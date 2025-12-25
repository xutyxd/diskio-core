import { Writable, WritableOptions } from "node:stream";
import { DiskIOFileSmart } from "./diskio-file-smart.class";

export class DiskIOFileSmartWritable extends Writable {
    private file: DiskIOFileSmart;

    constructor(file: DiskIOFileSmart, opts?: WritableOptions) {
        // Use 2 MiB default if not specified
        const highWaterMark = opts?.highWaterMark ?? 2 * 1024 * 1024;
        super({ ...opts, highWaterMark });
        this.file = file;
    }
    /**
     * Called by Node.js when multiple chunks are buffered.
     * This is your batching point!
     */
    async _writev(
        chunks: Array<{ chunk: Buffer; encoding: string }>,
        callback: (err?: Error) => void
    ) {
        try {
            // Concatenate all chunks into one large Buffer
            const toAllocate = chunks.reduce((sum, item) => sum + item.chunk.length, 0);
            const batch = Buffer.allocUnsafe(toAllocate);
            
            let offset = 0;
            for (const item of chunks) {
                item.chunk.copy(batch, offset);
                offset += item.chunk.length;
            }
            // Single write operation for the entire batch
            await this.file.write(batch);
            callback();
        } catch (err) {
            callback(err as Error);
        }
    }
    /**
     * Fallback for single chunks when buffer isn't full enough.
     * Rarely called if source is faster than disk.
     */
    async _write(chunk: Buffer, encoding: string, callback: (err?: Error) => void) {
        try {
            // Write the chunk
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