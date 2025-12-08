import { Writable, WritableOptions } from "node:stream";
import { DiskIOFileSmart } from "./diskio-file-smart.class";

export class DiskIOFileSmartWritable extends Writable {
    private file: DiskIOFileSmart;

    constructor(file: DiskIOFileSmart, opts?: WritableOptions) {
        super({ ...opts, highWaterMark: 1024 * 1024 }); // 1 MiB backpressure window
        this.file = file;
    }
    // Called by the framework for each buffer from the HTTP body
    async _write(chunk: Buffer, encoding: string, callback: (err?: Error) => void) {
        try {
            // Wait to be written
            await this.file.write(chunk);
            // Signal backpressure: TCP socket will pause until we call callback()
            callback();
        } catch (err) {
            callback(err as Error);
        }
    }

    async _final(callback: (err?: Error) => void) {
        try {
            // Since _write waits for completion, by the time we get to _final,
            // all writes are guaranteed done. We just flush.
            await this.file.flush();
            callback();
        } catch (err) {
            callback(err as Error);
        }
    }
}