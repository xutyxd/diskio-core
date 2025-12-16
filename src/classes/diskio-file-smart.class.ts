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
                // Get path
                const path = self.diskio.createPath(chunk.hash, true);
                // Get full path
                const fullPath = join(path, chunk.hash);
                // Get the file forcing to exists
                const file = await self.diskio.get(fullPath, true);
                // Check if is already setted
                if (self.fhs.has(chunk.hash)) {
                    await file.close();
                    return;
                }
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
        // Always return new instance
        return await create(AVG_BITS, MIN_SIZE, MAX_SIZE, WINDOW_SIZE, POLYNOMIAL);
    }

    private toTail(buffer: Buffer, before: boolean): Buffer {
        if (!this.tail || this.tail.length === 0) {
            return this.tail = buffer;
        }
        this.tail = Buffer.concat(before ? [buffer, this.tail] : [this.tail, buffer]);
        return this.tail;
    }

    private async proccess(buffer: Buffer, all = false): Promise<Buffer[]> {
        const toFingerprint = buffer.subarray(0, Math.min(buffer.length, this.FIXED_SIZE));
        this.toTail(buffer.subarray(this.FIXED_SIZE), false);
        
        const rabin = await this.rabin();
        const cutPoints = [...rabin.fingerprint(toFingerprint)];
        
        const parts: Buffer[] = [];
        let offset = 0;
    
        for (const point of cutPoints) {
            const len = Number(point);
            parts.push(toFingerprint.subarray(offset, offset + len));
            offset += len;
        }
    
        // Handle remaining data
        if (offset < toFingerprint.length) {
            const remaining = toFingerprint.subarray(offset);
            if (all) {
                parts.push(remaining);
            } else {
                this.toTail(remaining, true);
            }
        }
        return parts;
    }

    private async Write(parts: Buffer[]): Promise<IChunkManifest[]> {
        const startPosition = this.Manifest.chunks.length;
        const batchChunks: IChunkManifest[] = [];
        const missingItems: { hash: string, data: Buffer, index: number }[] = [];
    
        // 1. Pre-process and identify what already exists
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const position = startPosition + i;
            const hash = await blake3(part);
            
            // Use the map for O(1) lookups
            let fh = this.fhs.get(hash);
            
            if (!fh) {
                const path = join(this.diskio.createPath(hash, true), hash);
                if (await this.diskio.exists(path)) {
                    fh = await this.diskio.get(path);
                    this.fhs.set(hash, fh);
                }
            }
    
            if (fh) {
                const { size } = await fh.stat();
                const chunk: IChunkManifest = { 
                    hash, 
                    original: part.length, 
                    size: size as number, 
                    refs: 2, 
                    index: position 
                };
                batchChunks.push(chunk);
            } else {
                missingItems.push({ hash, data: part, index: position });
            }
        }
    
        // 2. Process missing chunks in parallel batches
        if (missingItems.length > 0) {
            const hashes = [...new Set(missingItems.map(m => m.hash))];
            const files = await this.diskio.createBatch(hashes);
    
            const writeData = await Promise.all(missingItems.map(async (item) => {
                const fileRef = files.find(f => f.name === item.hash);
                if (!fileRef) throw new Error(`File creation failed for ${item.hash}`);
                
                const compressed = await compress(item.data, 3);
                return {
                    name: item.hash,
                    file: fileRef.file,
                    data: compressed,
                    size: item.data.length, // Store original size
                    index: item.index
                };
            }));
    
            const results = await this.diskio.writeBatch(writeData);
            
            // Add to tracking map and batch results
            for (const res of results) {
                const item = writeData.find(d => d.name === res.hash);
                if (!this.fhs.has(res.hash)) {
                    this.fhs.set(res.hash, item!.file);
                }
                batchChunks.push(res);
            }
        }
    
        // 3. Update main manifest and return
        // We don't sort here; we maintain index order by pushing
        this.Manifest.chunks.push(...batchChunks);
        return batchChunks;
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
            // Calculate probably written bytes
            const written = original.slice(0, index).reduce((bytes, { from, to }) => bytes + (to - from), 0);
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
            decompressed.copy(buffer, written, from, to);
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
            // Move the data to tail and get all of it
            buffer = this.toTail(data, false);
        } else {
            buffer = data;
        }
        // Avoid writing small files to feed correctly rabin
        if (buffer.length < this.FIXED_SIZE) {
            // Overwrite tail cause maybe buffer already is tail
            this.tail = buffer;
            return { chunks: [] };
        }
        // Clear tail because at this moment tail is on buffer
        this.tail = Buffer.allocUnsafe(0);
        // Proccess buffer without tail
        const parts = await this.proccess(buffer);
        // Write parts
        const chunks = await this.Write(parts);
        // Check if there is still tail
        if (this.tail) {
            // Proccess tail until it is smaller than fixed size
            while (this.tail.length > this.FIXED_SIZE) {
               // Get all tail to process
               const buffer = this.tail;
               // Clear tail
               this.tail = Buffer.allocUnsafe(0);
               // Process the tail
               const parts = await this.proccess(buffer);
               // Write parts
               const tail = await this.Write(parts);
               // Update the chunks
               chunks.push(...tail);
            }
        }
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
        // Write the tail
        const proccessed = await this.proccess(this.tail, true);
        const chunks = await this.Write(proccessed);
        // Clean the tail
        this.tail = undefined;
        // Return the manifest
        return chunks;
    }

    public get manifest() {
        // Sort chunks
        this.Manifest.chunks = this.Manifest.chunks.sort((a, b) => a.index - b.index);
        // Return manifest
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