import { IDiskIO } from "./diskio.interface";
import { IChunkManifest } from "./chunk-manifest.interface";

import { DiskIOFile } from "../classes/diskio-file.class";

export interface IDiskIOBatch extends IDiskIO {
    createBatch(name: string[]): Promise<{ name: string, file: DiskIOFile }[]>;
    writeBatch(batch: { file: DiskIOFile, data: Buffer, size: number }[], compress: boolean): Promise<IChunkManifest[]>;
    deleteBatch(files: DiskIOFile[]): Promise<void>;
}