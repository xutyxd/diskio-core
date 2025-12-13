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

    constructor(file: DiskIOFileSmart, opts?: ReadableOptions) {
        // Use 2 MiB default if not specified
        const highWaterMark = opts?.highWaterMark ?? 2 * 1024 * 1024;
        super({ ...opts, highWaterMark });

        this.file = file;
        this.manifest = file.manifest.chunks;
        this.batches = this.toBatches(this.manifest, highWaterMark);
    }

    private toBatches(chunks: IChunkManifest[], target: number): IBatch[] {
        const batches: IBatch[] = [];
        let current: IBatch | null = null;
        let offset = 0;

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];

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
}