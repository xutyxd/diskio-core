import { Writable, WritableOptions } from "node:stream";
import { DiskIOFileSmart } from "./diskio-file-smart.class";

export class DiskIOFileSmartWritable extends Writable {
    private file: DiskIOFileSmart;
    private writing = Promise.resolve(); // tail of the chain
    private wrote = 0;

    constructor(file: DiskIOFileSmart, opts?: WritableOptions) {
        super({ ...opts, highWaterMark: 1024 * 1024 }); // 1 MiB backpressure window
        this.file = file;
    }

    // Called by the framework for each buffer from the HTTP body
    async _write(chunk: Buffer, encoding: string, callback: (err?: Error) => void) {
        try {
            // Wait for previous chunk to be written
            await this.writing;
            // Start the next write; do NOT await here yet
            this.writing = (async () => {
                await this.file.write(chunk);
            })();
            this.wrote += chunk.length;
            // Signal backpressure: TCP socket will pause until we call callback()
            // We call it ONLY after the previous chunk is done, thus preserving order
            callback();
        } catch (err) {
            callback(err as Error);
        }
    }

    async _final(callback: (err?: Error) => void) {
        try {
            // Wait for previous chunk to be written
            await this.writing;
            console.log('Wrote:', this.wrote);
            // Flush last part of the file
            await this.file.flush();
            callback();
        } catch (err) {
            callback(err as Error);
        }
    }
}