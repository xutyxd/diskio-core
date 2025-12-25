import { Readable, ReadableOptions } from "node:stream";

import { IChunkManifest } from "../interfaces/chunk-manifest.interface";
import { DiskIOFileSmart } from "./diskio-file-smart.class";

interface IBatch {
    start: number;
    bytes: number;
    chunks: number[]; // Which chunks belong to this batch
}

export class DiskIOFileSmartReadable extends Readable {
    private file: DiskIOFileSmart;
    private manifest: IChunkManifest[];
    private batches: IBatch[] = [];

    private idx = 0;
    
    public size;

    constructor(file: DiskIOFileSmart, opts?: ReadableOptions & { from?: number, to?: number }) {
        // Use 2 MiB default if not specified
        const highWaterMark = opts?.highWaterMark ?? 2 * 1024 * 1024;
        super({ ...opts, highWaterMark });

        this.file = file;
        this.manifest = file.manifest.chunks;
        this.batches = this.toBatches(this.manifest, { target: highWaterMark, from: opts?.from, to: opts?.to });
        this.size = file.size;
    }

    private toBatches(chunks: IChunkManifest[], configuration: { target: number, from?: number, to?: number }): IBatch[] {
        const batches: IBatch[] = [];
        let current: IBatch | null = null;
        const target = configuration.target;
        let offset = 0;
        const start = configuration.from ?? 0;
        const end = configuration.to ?? this.size;

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const nextEnd = offset + chunk.original;
            // Check if chunk is out of range
            if (nextEnd <= start) {
                offset += chunk.original;
                continue;
            }

            if (nextEnd >= end) {
                break;
            }

            const needChunk = current ? current.bytes + chunk.original > target : false;

            // Start new batch if needed
            if (!current || needChunk) {
                if (current) {
                    batches.push(current);
                }

                current = {
                    start: offset,
                    bytes: 0,
                    chunks: []
                };
            }

            current.chunks.push(i);
            current.bytes += chunk.original;

            if (offset + chunk.original > end) {
                // Calculate exactly how many bytes of this batch are actually valid
                const needed = end - current.start;
                // Update the current chunk
                current.bytes = needed;
                break; // We are done!
            }

            offset += chunk.original;
        }

        // Push final batch
        if (current) {
            batches.push(current);
        }

        return batches;
    }

    async _read() {
        // End of file
        if (this.idx >= this.batches.length) {
            this.push(null);
            return;
        }

        const batch = this.batches[this.idx++];
        
        try {
            // Read the ENTIRE batch in ONE async operation
            // This is the key: read from startOffset to startOffset + totalBytes
            const data = await this.file.read(
                batch.start, 
                batch.start + batch.bytes
            );
            // Push the batch data to the stream
            this.push(data);
        } catch (err) {
            this.destroy(err as Error);
        }
    }

    async _destroy(err: Error | null, callback: (error?: Error | null) => void) {
        try {
            if (err) {
                await this.file.close();
            }
        } catch (err) {
            // Ignore
        }
        callback(err);
    }
}