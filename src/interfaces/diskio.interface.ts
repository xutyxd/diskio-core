import { FileHandle } from "fs/promises";
import { DiskIOFile } from "../classes/diskio-file.class";

export interface IDiskIO {
    folder: string;

    ready: Promise<IDiskIO>;

    createPath: (name: string, collision?: boolean) => string;

    create: (name: string, collision?: boolean) => Promise<DiskIOFile>;
    createSync: (name: string, collision?: boolean) => DiskIOFile;

    exists: (name: string) => Promise<boolean>;
    existsSync: (name: string) => boolean;

    get: (name: string, check?: boolean) => Promise<DiskIOFile>;
    getSync: (name: string, check?: boolean) => DiskIOFile;

    read: (fh: FileHandle, start: number, end: number) => Promise<Buffer>;
    readSync: (fh: FileHandle, start: number, end: number) => Buffer;

    write: (fh: FileHandle, data: Buffer, position: number) => Promise<void>;
    writeSync: (fh: FileHandle, data: Buffer, position: number) => void;

    delete: (fh: FileHandle, name: string[]) => Promise<void>;
}