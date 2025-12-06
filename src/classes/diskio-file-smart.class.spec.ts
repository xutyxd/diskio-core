
import { FileHandle, open, unlink } from 'fs/promises';

// Results to compare
import videoAResult from '../../mocks/data/video-a-chunks.data.json';
import videoBResult from '../../mocks/data/video-b-chunks.data.json';

import { DiskIOFileSmart } from './diskio-file-smart.class';
import { DiskIO } from './diskio.class';

describe('DiskIOFileSmart class', () => {
    let diskio: DiskIO;

    beforeEach(async () => {
        try {
            await unlink('./mocks/diskio-smart/diskio.dat');
        } catch { }
        // Define a basic diskIO with 10MB
        diskio = new DiskIO('./mocks/diskio-smart', 20 * 1024 * 1024);
        // Wait to be ready
        await diskio.ready;
    });

    describe('DiskIOFileSmart instance', () => {
        it('should throw an error if the path does not exist', async () => {
            const manifest = { chunks: [{ hash: '4ffe02e5e92cfile.data', size: 10, original: 10 }] };

            try {
                const diskIOFileSmart = new DiskIOFileSmart(diskio, manifest);
                await diskIOFileSmart.ready;
            } catch (error) {
                const { message } = error as Error;
                expect(message).toBe('The file does not exist');
            }
        });

        it('should throw an error if the path is diskIO directory', async () => {
            const manifest = { chunks: [{ hash: 'diskio.dat', size: 10, original: 10 }] };

            try {
                const diskIOFileSmart = new DiskIOFileSmart(diskio, manifest);
                await diskIOFileSmart.ready;
            } catch (error) {
                const { message } = error as Error;
                expect(message).toBe('The name is diskio storage file');
            }
        });

        it('should instance a DiskIOFileSmart class', async () => {
            // Create an empty manifest
            const manifest = { chunks: [] };
            // Instance it
            const file = new DiskIOFileSmart(diskio, manifest);
            // Wait to be ready
            await file.ready;
            // Excepts it works
            expect(file).toBeInstanceOf(DiskIOFileSmart);
            // Close to clean resources
            await file.close();
        });
    });

    describe('DiskIOFileSmart write', () => {
        it('should write a file', async () => {
            // Instance it
            const diskIOFileSmart = new DiskIOFileSmart(diskio);
            // Wait to be ready
            await diskIOFileSmart.ready;
            // Open the file
            const file = await open('./mocks/video-a.mp4', 'r+');
            // Read the file
            const buffer = await file.readFile();
            // Write the file
            await diskIOFileSmart.write(buffer);
            // Close the file
            await file.close();
            // Flush clean resources tail
            await diskIOFileSmart.flush();
            // Get manifest generated
            const manifest = diskIOFileSmart.manifest;
            // Expects it works
            const { chunks } = manifest;

            try {
                expect(chunks).toEqual(videoAResult);
            } finally {
                // Clean up
                await diskIOFileSmart.delete();
            }
        });

        it('should write a file twice', async () => {
            // Instance it
            const diskIOFileSmart = new DiskIOFileSmart(diskio);
            const diskIOFileSmartBackup = new DiskIOFileSmart(diskio);
            // Wait to be ready
            await diskIOFileSmart.ready;
            await diskIOFileSmartBackup.ready;
            // Open the file
            const file = await open('./mocks/video-b.mp4', 'r+');
            const fileBackup = await open('./mocks/video-b.mp4', 'r+');
            // Read the file
            const buffer = await file.readFile();
            const bufferBackup = await fileBackup.readFile();
            // Write the file
            await diskIOFileSmart.write(buffer);
            // Close to clean resources
            await diskIOFileSmart.flush();
            await diskIOFileSmart.close();
            // Re-write the file again
            await diskIOFileSmartBackup.write(bufferBackup);
            // Close to clean resources
            await diskIOFileSmartBackup.flush();
            // Close the file
            await file.close();
            // Get manifest
            const manifest = diskIOFileSmart.manifest;
            // Get manifest backup
            const manifestBackup = diskIOFileSmartBackup.manifest;
            // Expects it works
            const { chunks } = manifest;

            try {
                expect(chunks).toEqual(videoBResult);
                expect(manifestBackup).toEqual(manifest);
            } finally {
                // Clean up
                await diskIOFileSmartBackup.delete();
            }
        });
    });
});