import { Readable, ReadableOptions } from "node:stream";

import { IChunkManifest } from "../interfaces/chunk-manifest.interface";
import { DiskIOFileSmart } from "./diskio-file-smart.class";

export class DiskIOFileSmartReadable extends Readable {
    private file: DiskIOFileSmart;
    private manifest: IChunkManifest[];

    private idx = 0;
    private reading = false; // re-entrancy guard

    constructor(file: DiskIOFileSmart, opts?: ReadableOptions) {
        super({ ...opts, highWaterMark: 2 * 1024 * 1024 }); // 2 MiB read-ahead
        this.file = file;
        this.manifest = file.manifest.chunks;
    }

    async _read() {
        // Check if we are already reading to avoid parallel reads
        if (this.reading) {
            return;
        }
        // Notify that stream is finished
        if (this.idx >= this.manifest.length) {
            this.push(null); // EOS
            return;
        }
        // Set reading flag
        this.reading = true;
        // Get next chunk to be readed
        const entry = this.manifest[this.idx++];
        try {
            // Get readed until this point
            const readed = this.manifest.slice(0, this.idx - 1).reduce((readed, current) => readed += current.original, 0);
            // Get chunk
            const data = await this.file.read(readed, readed + entry.original);
            // push() returns false if internal buffer is full -> wait for 'drain'
            const canContinue = this.push(data);
            // Remove flag
            this.reading = false;
            if (canContinue) {
                // Schedule next tick to recurse; avoids stack overflow on tiny chunks
                setImmediate(() => this._read());
                return;
            }
            // Wait for drain event to continue
            this.once('drain', () => this._read());
        } catch (err) {
            this.destroy(err as Error);
        }
    }
}