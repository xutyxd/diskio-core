import { IChunkManifest } from "./chunk-manifest.interface";

export interface IDiskIOFileManifest {
    // name: string;
    // size: number;
    chunks: IChunkManifest[];
}