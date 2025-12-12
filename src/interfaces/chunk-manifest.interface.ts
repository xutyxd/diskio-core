
export interface IChunkManifest {
    hash: string;
    index: number;
    size: number;
    original: number;
    refs: number;
}