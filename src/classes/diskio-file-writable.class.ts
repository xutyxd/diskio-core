import { Writable } from "node:stream";
import { IDiskIO } from "../interfaces/diskio.interface";
import { DiskIOFile } from "./diskio-file.class";

export class DiskIOFileWritable extends Writable {
    private diskioFile: DiskIOFile;
    private index = 0;
    public ready;

    constructor(diskio: IDiskIO, name: string[], from = 0) {
        super();
        this.diskioFile = new DiskIOFile(diskio, name);
        this.ready = this.diskioFile.ready;
        this.index = from;
    }

    public _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void) {
        this.diskioFile.writeSync(chunk, this.index);
        this.index += chunk.length;
        callback();
    }

    public _destroy(err: Error | null, callback: (error?: Error | null) => void) {
        this.diskioFile.close();
        callback(err);
    }
}