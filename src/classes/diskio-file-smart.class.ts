import { join } from 'node:path';
import Rabin, { create } from 'rabin-wasm';

import { blake3 } from "hash-wasm";

import { compress, decompress } from '@mongodb-js/zstd'

import { IDiskIOFileManifest } from "../interfaces/diskio-file-manifest.interface";
import { IDiskIO } from "../interfaces/diskio.interface";
import { DiskIOFile } from "./diskio-file.class";
import { IChunkManifest } from '../interfaces/chunk-manifest.interface';


export class DiskIOFileSmart {
    private Manifest: IDiskIOFileManifest;

    private fhs: Map<string, DiskIOFile> = new Map();
    private Rabin?: Rabin;
    private tail?: Buffer;

    public ready: Promise<DiskIOFileSmart>;

    constructor(private diskio: IDiskIO, manifest?: IDiskIOFileManifest) {
        // Create a copy of the manifest
        this.Manifest = structuredClone(manifest || { chunks: [] });
        const self = this;
        this.ready = (async () => {
            // Await for the diskio to be ready
            await this.diskio.ready;
            // Iterate over the chunks with a map
            const promises = self.Manifest.chunks.map(async (chunk) => {
                // Get the file forcing to exists
                const file = await self.diskio.get(chunk.hash, true);
                // Add the file to the map
                self.fhs.set(chunk.hash, file);
            });
            // Wait for all the files to be ready
            await Promise.all(promises);
            // Return itself
            return self;
        })();
    }

    private async rabin(): Promise<Rabin> {
        return this.Rabin || (this.Rabin = await create(2 * 1024 * 1024, 4 * 1024 * 1024, 6 * 1024 * 1024));
    }

    private async Write(data: Buffer): Promise<IChunkManifest> {
        // Hash the part
        const hash = await blake3(data);
        // Get possible path
        const path = this.diskio.createPath(hash);
        // Check if path exists
        const exists = await this.diskio.exists(path);
        // Return hash
        if (exists) {
            // Get fh for it
            const fh = await this.diskio.get(hash);
            // Save the ref
            this.fhs.set(hash, fh);
            // Get the size
            const { size } = await fh.stat();
            // Return hash
            return { hash, original: data.length, size: size as number };
        }
        // Compress the data
        const compressed = await compress(data, 3);
        // Create file
        const fh = await this.diskio.create(path, true);
        // Write the compressed data
        await fh.write(compressed, 0);
        // Save ref
        this.fhs.set(hash, fh);
        // Return the compressed
        return { hash, original: data.length, size: compressed.length };

    }

    public async read(start: number, end: number): Promise<Buffer> {
        // Define buffer
        const buffer = Buffer.allocUnsafe(end - start);
        // Iterate over the chunks to create a map with instructions
        const instructions = this.Manifest.chunks.map((chunk, index, original) => {
            // Get moved bytes
            const moved = original.slice(0, index).reduce((bytes, { original }) => bytes + original, 0);
            // Check start
            const before = start > moved;
            // Check end
            const after = end < moved;
            // Check if is not range
            if (before || after) {
                // Skip this chunk
                return;
            }
            // Determine from where to start reading
            const from = Math.max(start - moved, 0);
            // Determine from where to end reading
            const to = Math.min(chunk.original, end - moved);
            // Return the instruction
            return { chunk, from, to };
            // Clear empty instructions
        }).filter((instruction): instruction is Exclude<typeof instruction, undefined> => Boolean(instruction));
        // Iterate over the instructions
        const promises = instructions.map(async ({ chunk, from, to }, index, original) => {
            // Calculate probably wrote bytes
            const wrote = original.slice(0, index).reduce((bytes, { from, to }) => bytes + (from - to), 0);
            // Get the file
            const fh = this.fhs.get(chunk.hash);
            // Check file handle exists
            if (!fh) {
                throw new Error('File corrupted!');
            }
            // Read the whole chunk to decompress it
            const readed = await fh.read(0, chunk.original);
            // Decompress the chunk
            const decompressed = await decompress(readed);
            // Read the part of the chunk
            decompressed.copy(buffer, wrote, from, to);
        });
        // Wait for all the instructions to be executed
        await Promise.all(promises);
        // Return the buffer
        return buffer;
    }

    public async write(data: Buffer): Promise<IDiskIOFileManifest> {
        let buffer: Buffer;
        // Check if there is a tail
        if (this.tail) {
            // Create a new buffer
            buffer = Buffer.allocUnsafe(data.length + this.tail.length);
            // Copy the tail
            this.tail.copy(buffer);
            // Copy the data
            data.copy(buffer, this.tail.length);
        } else {
            buffer = data;
        }
        // Create rabin
        const rabin = await this.rabin();
        // Get cut points
        const cutPoints = rabin.fingerprint(data);
        // Create a promise array
        const parts = [...cutPoints].map((point, index, self) => {
            const numbered = Number(point);
            // Get the previous
            const before = self.slice(0, index).reduce((bytes, point) => bytes + Number(point), 0);
            // Get the part
            return data.subarray(before, before + numbered);
        });
        // Get last part
        const last = parts.pop();
        // Update the tail
        this.tail = last;
        // For each part hash it and compress it
        const chunkPromises: Promise<IChunkManifest>[] = parts.map((part) => this.Write(part));
        // Await for all the hashes to be ready
        const chunks = await Promise.all(chunkPromises);
        // Push chunks to the manifest to keep updated
        this.Manifest.chunks.push(...chunks);
        // Create a manifest
        const manifest: IDiskIOFileManifest = { chunks };
        // Return the data manifest
        return manifest;
    }

    public async flush(): Promise<IChunkManifest | undefined> {
        // Check for the tail
        if (!this.tail) {
            return;
        }
        // Write the tail
        const wrote = await this.Write(this.tail);
        // Push the chunk to the manifest
        this.Manifest.chunks.push(wrote);
        // Update the chunk
        const chunk = wrote;
        // Return the manifest
        return chunk;
    }

    public get manifest() {
        return structuredClone(this.Manifest);
    }

    public async delete() {
        // Delete all the chunks
        const deletes = this.Manifest.chunks.map(async (chunk) => {
            const fh = this.fhs.get(chunk.hash);
            await fh?.delete();
        });
        // Return all the deletes
        return Promise.all(deletes);
    }

    public async close(): Promise<void> {
        // Flush the tail
        await this.flush();
        // Close all file descriptors
        for (const fh of this.fhs.values()) {
            await fh.close();
        }
        
    }
}