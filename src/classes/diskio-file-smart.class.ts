import { join } from 'node:path';
import Rabin, { create } from 'rabin-wasm';

import { blake3 } from "hash-wasm";

import { compress, decompress } from '@mongodb-js/zstd'

import { IDiskIOFileManifest } from "../interfaces/diskio-file-manifest.interface";
import { IChunkManifest } from '../interfaces/chunk-manifest.interface';
import { IDiskIOBatch } from '../interfaces/diskio-batch.interface';

import { DiskIOFile } from "./diskio-file.class";


export class DiskIOFileSmart {
    private FIXED_SIZE = 128 * 1024 * 10;

    private Manifest: IDiskIOFileManifest;

    private fhs: Map<string, DiskIOFile> = new Map();
    private Rabin?: Rabin;
    private tail?: Buffer;

    public ready: Promise<DiskIOFileSmart>;

    constructor(private diskio: IDiskIOBatch, manifest?: IDiskIOFileManifest) {
        // Create a copy of the manifest
        this.Manifest = structuredClone(manifest || { chunks: [] });
        const self = this;
        this.ready = (async () => {
            // Await for the diskio to be ready
            await diskio.ready;
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
        // Min and Max are defined in BYTES
        const MIN_SIZE = 32 * 1024;  // 32 KiB
        const MAX_SIZE = 128 * 1024; // 128 KiB

        // Average is defined in BITS (Powers of 2)
        // 2^16 = 65,536 bytes = 64 KiB
        const AVG_BITS = 16;

        const WINDOW_SIZE = 64;
        const POLYNOMIAL = 0x3DA3358B4DC173n;

        return this.Rabin || (this.Rabin = await create(AVG_BITS, MIN_SIZE, MAX_SIZE, WINDOW_SIZE, POLYNOMIAL));
    }

    private async Write(parts: Buffer[]): Promise<IChunkManifest[]> {
        console.log('Writing:', parts.length);
        console.log('size:', parts.map((part) => part.length));
        const chunks: IChunkManifest[] = [];
        // Define a missing chunk array
        const missing: { path: string, hash: string, data: Buffer }[] = [];
        // Iterate over the parts
        for (const part of parts) {
            // Get the hash
            const hash = await blake3(part);
            // Get possible path
            const path = this.diskio.createPath(hash, true);
            // Check if path exists
            const exists = await this.diskio.exists(path);
            // Check if is already referenced
            const reference = this.fhs.get(hash);
            // Push to manifest
            if (exists) {
                // Get fh for it
                const fh = reference ?? await this.diskio.get(join(path, hash));
                // Save the ref
                this.fhs.set(hash, fh);
                // Get the size
                const { size } = await fh.stat();
                // Create a chunk with ref setted to 2 at least
                const chunk = { hash, original: part.length, size: size as number, refs: 2 };
                // Push to manifest
                this.Manifest.chunks.push(chunk);
                // Push to chunks
                chunks.push(chunk);
                continue;
            }

            missing.push({ path, hash, data: part });
        }
        // Check if there is missing chunks
        if (missing.length) {
            // Execute a createBatch
            const files = await this.diskio.createBatch(missing.map(({ hash }) => hash));
            // Add data to files
            const promises = files.map(async ({ name, file }) => {
                const { data } = missing.find(({ hash }) => hash === name) || {};
                
                if (!data) {
                    throw new Error('File corrupted!');
                }
                const size = data?.length;
                // Compress data
                const compressed = await compress(data, 3);

                return { name, file, data: compressed, size };
            });
            // Wait for all the data to be compressed
            const withData = await Promise.all(promises);
            // Iterate over the files
            const missingWrites = await this.diskio.writeBatch(withData, true);
            // Save the ref
            missingWrites.forEach(({ hash }) => {
                const part = withData.find(({ name }) => name === hash);
                if (!part) {
                    throw new Error('File corrupted!');
                }
                // Check if is already referenced
                const referenced = this.fhs.has(hash);
                if (referenced) {
                    return;
                }
                this.fhs.set(hash, part.file);
            });
            // Push chunks to the manifest to keep updated
            this.Manifest.chunks.push(...missingWrites);
            // Push to chunk array
            chunks.push(...missingWrites);
        }
        // Return the chunks
        return chunks;
    }

    public async read(start: number, end: number): Promise<Buffer> {
        // Define buffer
        const buffer = Buffer.allocUnsafe(end - start);
        // Iterate over the chunks to create a map with instructions
        const instructions = this.Manifest.chunks.map((chunk, index, original) => {
            // Get moved bytes
            const moved = original.slice(0, index).reduce((bytes, current) => bytes + current.original, 0);
            const until = moved + chunk.original;
            // Check is on range
            const before = moved > end;
            const after = until < start;
            const outside = before || after;

            if (outside) {
                // Skip this chunk
                return;
            }
            const from = Math.max(start - moved, 0);
            // Determine from where to end reading
            const to = Math.min(end - moved, chunk.original);
            // Return the instruction
            return { chunk, from, to };
            // Clear empty instructions
        }).filter((instruction): instruction is Exclude<typeof instruction, undefined> => Boolean(instruction));
        // Iterate over the instructions
        const promises = instructions.map(async ({ chunk, from, to }, index, original) => {
            // Calculate probably wrote bytes
            const wrote = original.slice(0, index).reduce((bytes, { from, to }) => bytes + (to - from), 0);
            // Get the file
            const fh = this.fhs.get(chunk.hash);
            // Check file handle exists
            if (!fh) {
                throw new Error('File corrupted!');
            }
            // Read the whole chunk to decompress it
            const readed = await fh.read(0, chunk.size);
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

    public async write(data: Buffer, isTail = false): Promise<IDiskIOFileManifest> {
        let buffer: Buffer;
        // Check if there is a tail
        if (this.tail && !isTail) {
            // Create a new buffer
            buffer = Buffer.allocUnsafe(data.length + this.tail.length);
            // Copy the tail
            this.tail.copy(buffer);
            // Copy the data from the tail length
            data.copy(buffer, this.tail.length);
        } else {
            buffer = data;
        }
        // Avoid writing small files to feed correctly rabin
        if (buffer.length < this.FIXED_SIZE && !isTail) {
            console.log('Increasing tail to: ', buffer.length);
            // Move to tail and return empty manifest
            this.tail = buffer;
            return { chunks: [] };
        }
        // Fix size of the buffer if is not tail
        if (!isTail) {
            // Get first part
            const toFingerprint = buffer.subarray(0, Math.min(buffer.length, this.FIXED_SIZE));
            // Move the rest to tail
            this.tail = buffer.subarray(this.FIXED_SIZE);
            console.log('Tail increased to:', this.tail.length);
            // Set as buffer to fingerprint
            buffer = toFingerprint;
        }
        // Create rabin
        const rabin = await this.rabin();
        console.log('Data to fingerprint:', buffer.length);
        // Get cut points
        const cutPoints = [ ...rabin.fingerprint(buffer)] as unknown as number[];
        console.log('Cut points:', cutPoints);
        // Get last part, it will be the tail
        const point = buffer.length - cutPoints.reduce((total, current) => total += Number(current), 0);
        console.log('Point:', point);
        // If need to add a point
        if (point > 0) {
            cutPoints.push(point);
        }
        // Split data to write in parts
        let parts = cutPoints.map((point, index, self) => {
            const numbered = Number(point);
            // Get the previous
            const before = self.slice(0, index).reduce((bytes, point) => bytes + Number(point), 0);
            // Get the part
            return buffer.subarray(before, Math.min(before + numbered, buffer.length));
        });

        if (!parts.length) {
            parts = [buffer];
        }
        console.log('Parts:', parts.length);
        if (!isTail) {
            // Get last part
            const last = parts.pop();
            if (this.tail && last) {
                // Create a new buffer
                const temp = Buffer.allocUnsafe(this.tail.length + last.length);
                // Copy the tail to temporal
                this.tail.copy(temp);
                // Copy the data from the tail length
                last.copy(buffer, this.tail.length);
                // Update the tail
                this.tail = temp;
            } else {
                // Update the tail
                this.tail = last;
            }
        }
        // Write parts
        const chunks = await this.Write(parts);
        // Create a manifest
        const manifest: IDiskIOFileManifest = { chunks };
        // Return the data manifest
        return manifest;
    }

    public async flush(): Promise<IChunkManifest[] | undefined> {
        // Check for the tail
        if (!this.tail || this.tail.length === 0) {
            this.tail = undefined;
            return;
        }
        console.log('Flushing tail:', this.tail.length);
        // Write the tail
        const wrote = await this.write(this.tail, true);
        // Clean the tail
        this.tail = Buffer.alloc(0);
        // Update the chunk
        const { chunks } = wrote;
        // Return the manifest
        return chunks;
    }

    public get manifest() {
        return structuredClone(this.Manifest);
    }

    public async delete(): Promise<IChunkManifest[]> {
        // Get alone chunks
        const alones: DiskIOFile[] = [];
        // Get referenced on other files
        const referenced: IChunkManifest[] = [];
        // Iterate to split
        this.Manifest.chunks.forEach((chunk) => {
            // Push if hash more references
            if (chunk.refs > 1) {
                referenced.push(chunk);
            };
            // Find it file
            const file = this.fhs.get(chunk.hash);
            // Check not corrupted
            if (!file) {
                return;
            }
            // Push to alones
            alones.push(file);
        });
        // Delete all the files
        await this.diskio.deleteBatch(alones);
        // Return references
        return referenced;
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