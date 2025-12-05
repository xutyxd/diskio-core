
import { FileHandle, open, unlink } from 'fs/promises';

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

    describe.skip('DiskIOFileSmart write', () => {
        it('should write a file', async () => {
            // Instance it
            const diskIOFileSmart = new DiskIOFileSmart(diskio);
            // Wait to be ready
            await diskIOFileSmart.ready;
            // Open the file
            const file = await open('./mocks/video-b.mp4', 'r+');
            // Read the file
            const buffer = await file.readFile();
            // Write the file
            await diskIOFileSmart.write(buffer);
            // Close the file
            await file.close();
            // Flush clean resources tail
            await diskIOFileSmart.flush();
            const manifest = diskIOFileSmart.manifest;
            // Expects it works
            const { chunks } = manifest;
            const expected = [
                {
                    hash: '539eb15950b02344efea9285d326101c8ce11781d9f79f1eba9628fef19c9d56',
                    original: 4194304,
                    size: 4128787
                },
                {
                    hash: '9f2dee59b37de5ca3abf31fad3f5e7237a3a970a3f81f315072c2acf6266ef0f',
                    original: 4194304,
                    size: 4194410
                },
                {
                    hash: 'f8a73f36063c7f047eac9e7f6753ff369657ffc6ab38d0c2299dbe77d7d06858',
                    original: 4194304,
                    size: 4194410
                }
            ]

            expect(chunks.length).toBe(3);
            expect(chunks).toEqual(expected);
            // Clean up
            await diskIOFileSmart.delete();
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
            // Read the file
            const buffer = await file.readFile();
            // Write the file
            await diskIOFileSmart.write(buffer);
            // Close to clean resources
            await diskIOFileSmart.flush();
            await diskIOFileSmart.close();
            // Re-write the file again
            await diskIOFileSmartBackup.write(buffer);
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
            const expected = [
                {
                    hash: '539eb15950b02344efea9285d326101c8ce11781d9f79f1eba9628fef19c9d56',
                    original: 4194304,
                    size: 4128787
                },
                {
                    hash: '9f2dee59b37de5ca3abf31fad3f5e7237a3a970a3f81f315072c2acf6266ef0f',
                    original: 4194304,
                    size: 4194410
                },
                {
                    hash: 'f8a73f36063c7f047eac9e7f6753ff369657ffc6ab38d0c2299dbe77d7d06858',
                    original: 4194304,
                    size: 4194410
                }
            ]

            expect(chunks.length).toBe(3);
            expect(chunks).toEqual(expected);
            expect(manifestBackup).toEqual(manifest);
            // Clean up
            await diskIOFileSmartBackup.delete();
        });
    });
});