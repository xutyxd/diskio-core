import { Readable } from "node:stream";
import { IDiskIO } from "../interfaces/diskio.interface";
import { DiskIOFile } from "./diskio-file.class";

export class DiskIOFileReadable extends Readable {

    private diskioFile: DiskIOFile;
    private index = 0;
    public ready;

    constructor(diskio: IDiskIO, name: string[], from = 0) {
        super();
        this.diskioFile = new DiskIOFile(diskio, name);
        this.ready = this.diskioFile.ready;
        this.index = from;
    }

    public _read(size: number) {
        return this.push(this.diskioFile.readSync(this.index, this.index += size));
    }

    public _destroy(err: Error | null, callback: (error?: Error | null) => void) {
        this.diskioFile.close();
        callback(err);
    }
}