import Rabin, { create } from 'rabin-wasm';

import { blake3 } from "hash-wasm";

import { compress } from '@mongodb-js/zstd'

import { IDiskIOFileManifest } from "../interfaces/diskio-file-manifest.interface";
import { IDiskIO } from "../interfaces/diskio.interface";
import { DiskIOFile } from "./diskio-file.class";
import { IChunkManifest } from '../interfaces/chunk-manifest.interface';

export class DiskioFileSmart {
    private fhs: Map<string, DiskIOFile> = new Map();
    private Rabin?: Rabin;
    private tail?: Buffer;

    public ready: Promise<DiskioFileSmart>;

    constructor(private diskio: IDiskIO, manifest: IDiskIOFileManifest) {
        this.ready = new Promise(async (resolve) => {
            // Await for the diskio to be ready
            await this.diskio.ready;
            // Iterate over the chunks with a map
            const promises = manifest.chunks.map((chunk) => {
                // Get the file
                const filePromise = this.diskio.get(chunk.hash);
                filePromise.then((file) => {
                    // Add the file to the map
                    this.fhs.set(chunk.hash, file);
                });

                return filePromise;
            });
            // Wait for all the files to be ready
            Promise.all(promises).then(() => resolve(this));
        });
    }

    private rabin(): Rabin | Promise<Rabin> {
        return this.Rabin || create(2 * 1024 * 1024, 4 * 1024 * 1024, 6 * 1024 * 1024);
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
        const fh = await this.diskio.create(hash);
        // Write the compressed data
        await fh.write(compressed, 0);
        // Save ref
        this.fhs.set(hash, fh);
        // Return the compressed
        return { hash, original: data.length, size: compressed.length };

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
        const parts = cutPoints.map((point, index, self) => {
            // Get the previous
            const previous = self[index - 1] ?? 0;
            // Get the part
            return data.subarray(previous, point);
        });
        // Get last part
        const last = parts.pop();
        // Update the tail
        this.tail = last;
        // For each part hash it and compress it
        const chunkPromises: Promise<IChunkManifest>[] = parts.map((part) => this.Write(part));
        // Await for all the hashes to be ready
        const chunks = await Promise.all(chunkPromises);
        // Create a manifest
        const manifest: IDiskIOFileManifest = { chunks };
        // Return the manifest
        return manifest;
    }

    public async close(): Promise<IChunkManifest | void> {
        let chunk: IChunkManifest | undefined;
        // Check for the tail
        if (this.tail) {
            // Write the tail
            chunk = await this.Write(this.tail);
        }
        // Return the manifest
        return chunk;
    }
}