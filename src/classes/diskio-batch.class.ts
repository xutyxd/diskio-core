
import { DiskIO } from "./diskio.class";
import { DiskIOFile } from "./diskio-file.class";
import { IChunkManifest } from "../interfaces/chunk-manifest.interface";
import { IDiskIOBatch } from "../interfaces/diskio-batch.interface";


export class DiskIOBatch extends DiskIO implements IDiskIOBatch {

    public async createBatch(names: string[]): Promise<{ name: string, file: DiskIOFile }[]> {
        // Get the path for every file
        const paths = names.map((name) => ({ name, path: this.createPath(name, true) }));
        // Count all folders
        const folders = paths.map(({ path }) => path.split('/').filter(Boolean).length).reduce((total, current) => total + current, 0);
        // Allocate maximum possible space
        await this.allocate(folders * this.optimal);
        // Create the files
        const promises = paths.map(async ({ name }) => {
            const file = await this.Create(name, true);

            return { name, file };
        });
        // Wait for all files to be created
        const files = await Promise.all(promises);
        // Stabilize the diskio space, maybe not all allocated space is used
        await this.stabilize(this.RESERVED_SIZE);
        // Return the files
        return files;
    }

    public async writeBatch(toWrite: { file: DiskIOFile, data: Buffer, size: number }[]): Promise<IChunkManifest[]> {
        // Calculate the size of the data
        const toAllocate = toWrite.reduce((total, current) => total + current.data.length, 0);
        // Allocate maximum possible space
        await this.allocate(toAllocate);
        // Create a promise array
        const promises = toWrite.map(async ({ file, data, size }) => {
            // Write the data
            await super.Write(file['fh'], data, 0);
            // Get the stats
            const stats = await file.stat();
            // Get hash from name
            const hash = file.name.split('/').reverse()[0];
            // Return the manifest
            return { hash, original: size, size: stats.size as number, refs: 1 };
        });
        // Wait for all the hashes to be ready
        const chunks = await Promise.all(promises);
        // Stabilize the diskio space, maybe not all allocated space is used
        await this.stabilize(this.RESERVED_SIZE);
        // Return the chunks
        return chunks;
    }

    public async deleteBatch(files: DiskIOFile[]): Promise<void> {
        // Iterate over the files
        const promises = files.map(async (file) => {
            // Delete the file
            await super.Delete(file['fh'], file['Name']);
        });
        // Wait for all the files to be deleted
        await Promise.all(promises);
        // Stabilize the diskio space, maybe not all allocated space is used
        await this.stabilize(this.RESERVED_SIZE);
    }
}