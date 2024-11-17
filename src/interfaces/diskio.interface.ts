import { FileHandle } from "fs/promises";

export interface IDiskIO {
    folder: string;

    read: (fh: FileHandle, start: number, end: number) => Promise<Buffer>;
    readSync: (fh: FileHandle, start: number, end: number) => Buffer;
    write: (fh: FileHandle, data: Buffer, position: number) => Promise<void>;
    writeSync: (fh: FileHandle, data: Buffer, position: number) => void;

    delete: (fh: FileHandle, name: string[]) => Promise<void>;
}