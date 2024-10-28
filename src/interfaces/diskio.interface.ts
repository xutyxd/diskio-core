import { FileHandle } from "fs/promises";

export interface IDiskIO {
    folder: string;

    read: (fh: FileHandle, start: number, end: number) => Promise<Buffer>;
    write: (fh: FileHandle, data: Buffer, position: number) => Promise<void>;

    delete: (fh: FileHandle, name: string) => Promise<void>;
}