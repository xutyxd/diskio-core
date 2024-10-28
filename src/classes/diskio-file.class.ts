import { accessSync, constants } from 'node:fs';
import { FileHandle, open } from 'node:fs/promises';
import { join } from 'node:path';
import { IDiskIO } from "../interfaces/diskio.interface";

export class DiskIOFile {
    private fh!: FileHandle;

    public ready: Promise<void>;

    constructor(private diskio: IDiskIO, private name: string) {
        this.name = name;
        const path = join(diskio.folder, name);
        const flag = this.flag(path);

        this.ready = new Promise(async (resolve) => {
            // Get file descriptor for read/write
            this.fh = await open(path, flag);
            resolve();
        });
    }

    private flag(path: string): 'r+' | 'w+' {
        let flag: 'r+' | 'w+' = 'r+';
        
        try {
            accessSync(path, constants.F_OK);
        } catch {
            flag = 'w+';
        }

        return flag;
    }

    public read(start: number, end: number) {
        return this.diskio.read(this.fh, start, end);
    }

    public write(data: Buffer, position: number) {
        return this.diskio.write(this.fh, data, position);
    }

    public delete() {
        return this.diskio.delete(this.fh, this.name);
    }

    public close() {
        return this.fh.close();
    }
}