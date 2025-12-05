import { accessSync, constants } from 'node:fs';
import { FileHandle, open } from 'node:fs/promises';
import { join } from 'node:path';
import { IDiskIO } from "../interfaces/diskio.interface";

export class DiskIOFile {
    private fh!: FileHandle;
    private Name: string[] // [ '4ffe02e5', 'e92c', 'file.data' ];
    private Stat?: Awaited<ReturnType<FileHandle['stat']>>;

    public ready: Promise<DiskIOFile>;

    constructor(private diskio: IDiskIO, name: string[]) {
        this.Name = name;
        const path = join(diskio.folder, ...name);
        const flag = this.flag(path);

        this.ready = (async () => {
            // Get file descriptor for read/write
            this.fh = await open(path, flag);
            return this;
        })();
    }

    private flag(path: string): 'r+' | 'w+' {
        let flag: 'r+' | 'w+' = 'r+';
        
        try {
            accessSync(path, constants.F_OK);
        } catch(e) {
            flag = 'w+';
        }

        return flag;
    }

    public get name() {
        return this.Name.join('/').replace(this.diskio.folder, '');
    }

    public async stat() {
        await this.ready;
        let stat = this.Stat;

        if (!stat) {
            stat = this.Stat = await this.fh.stat();
        }

        return stat;
    }

    public read(start: number, end: number) {
        return this.diskio.read(this.fh, start, end);
    }

    public readSync(start: number, end: number) {
        return this.diskio.readSync(this.fh, start, end);
    }

    public write(data: Buffer, position: number) {
        return this.diskio.write(this.fh, data, position);
    }

    public writeSync(data: Buffer, position: number) {
        return this.diskio.writeSync(this.fh, data, position);
    }

    public async delete() {
        await this.ready;
        return this.diskio.delete(this.fh, this.Name);
    }

    public close() {
        return this.fh.close();
    }
}