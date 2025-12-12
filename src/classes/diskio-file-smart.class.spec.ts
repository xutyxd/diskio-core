
import { open, unlink } from 'fs/promises';

import { blake3 } from "hash-wasm";

// Results to compare
import videoAResult from '../../mocks/data/video-a-chunks.data.json';
import videoBResult from '../../mocks/data/video-b-chunks.data.json';

import { DiskIOFileSmart } from './diskio-file-smart.class';
import { DiskIOBatch } from './diskio-batch.class';

describe('DiskIOFileSmart class', () => {
    let diskio: DiskIOBatch;

    beforeEach(async () => {
        try {
            await unlink('./mocks/diskio-smart/diskio.dat');
        } catch { }
        // Define a basic diskIO with 10MB
        diskio = new DiskIOBatch('./mocks/diskio-smart', 20 * 1024 * 1024);
        // Wait to be ready
        await diskio.ready;
    });
    afterEach(async () => {
        try {
            await unlink('./mocks/diskio-smart/diskio.dat');
        } catch { }
    });

    describe('DiskIOFileSmart instance', () => {
        it('should throw an error if the path does not exist', async () => {
            const manifest = { chunks: [{ hash: '4ffe02e5e92cfile.data', size: 10, original: 10, refs: 1, index: 0 }] };

            try {
                const diskIOFileSmart = new DiskIOFileSmart(diskio, manifest);
                await diskIOFileSmart.ready;
            } catch (error) {
                const { message } = error as Error;
                expect(message).toBe('The file does not exist');
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
                await diskIOFileSmart.close();
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
            // Close since it is not needed anymore
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
                // Update because now has 2 ref each chunk
                const result = structuredClone(chunks).map((chunk) => ({ ...chunk, refs: 2 }));
                expect(manifestBackup).toEqual({ ...manifest, chunks: result });
            } finally {
                // Clean up
                await diskIOFileSmartBackup.delete();
                await diskIOFileSmartBackup.close();
            }
        });
    });

    describe('DiskIOFileSmart read', () => {
        it('should read a file', async () => {
            // Instance it
            const diskIOFileSmart = new DiskIOFileSmart(diskio);
            // Wait to be ready
            await diskIOFileSmart.ready;
            // Create a small buffer
            const buffer = Buffer.from("Hello world!");
            // Get original hash to check after
            const hash = await blake3(buffer);
            // Write on disk
            await diskIOFileSmart.write(buffer);
            // Always flush the tail
            await diskIOFileSmart.flush();
            // Read from disk
            const readed = await diskIOFileSmart.read(0, buffer.length);
            // Get hash of readed
            const readedHash = await blake3(readed);
            // Clean up
            await diskIOFileSmart.delete();
            await diskIOFileSmart.close();
            // Expect hash to be equal to new one
            expect(readedHash).toBe(hash);
        });

        it('should read a range of file', async () => {
            // Instance it
            const diskIOFileSmart = new DiskIOFileSmart(diskio);
            // Wait to be ready
            await diskIOFileSmart.ready;
            // Create a small buffer
            const buffer = Buffer.from("Hello world!");
            // Get original hash to check after
            const hash = await blake3(buffer.subarray(5));
            // Write on disk
            await diskIOFileSmart.write(buffer);
            // Always flush the tail
            await diskIOFileSmart.flush();
            // Read from disk
            const readed = await diskIOFileSmart.read(5, buffer.length);
            // Get hash of readed
            const readedHash = await blake3(readed);
            // Clean up
            await diskIOFileSmart.delete();
            await diskIOFileSmart.close();
            // Expect hash to be equal to new one
            expect(readedHash).toBe(hash);
        });

        it('should read a file wrote 2 times', async () => {
            // Instance it
            const diskIOFileSmart = new DiskIOFileSmart(diskio);
            // Wait to be ready
            await diskIOFileSmart.ready;
            // Create a small buffer
            const buffer = Buffer.from("Hello world! | Hello world! | Hello world! | Hello world! | Hello world! | Hello world! | Hello world!");
            // Mixed it to get hash
            const bufferMixed = Buffer.concat([buffer, buffer]);
            // Get original hash
            const hash = await blake3(bufferMixed);
            // Write the file
            await diskIOFileSmart.write(buffer);
            // Flush to force 2 writes to disk
            await diskIOFileSmart.flush();
            // Write again the same
            await diskIOFileSmart.write(buffer);
            // Flush again
            await diskIOFileSmart.flush();
            // Get manifest
            const { chunks } = diskIOFileSmart.manifest;
            // Expect 2 chunks equals
            expect(chunks.length).toBe(2);
            expect(chunks[0].hash).toBe(chunks[1].hash);
            // Read the whole file
            const readed = await diskIOFileSmart.read(0, buffer.length * 2);
            // Hash readed
            const readedHash = await blake3(readed);
            expect(readedHash).toBe(hash);

            try {
                // Clean up
                await diskIOFileSmart.delete();
                await diskIOFileSmart.close();
            } catch { }
        });

        it('should read a range of file with 3 chunks', async () => {
            // Instance it
            const diskIOFileSmart = new DiskIOFileSmart(diskio);
            // Wait to be ready
            await diskIOFileSmart.ready;
            // Create a small buffer
            const buffer = Buffer.from("Hello world! | Hello world! | Hello world! | Hello world! | Hello world! | Hello world! | Hello world!");
            // Mixed it to get hash
            const bufferMixed = Buffer.concat([buffer, buffer, buffer]);
            // Get original hash to check after
            const hash = await blake3(bufferMixed.subarray(5));
            // Write the file
            await diskIOFileSmart.write(buffer);
            // Flush to force 2 writes to disk
            await diskIOFileSmart.flush();
            // Write again the same
            await diskIOFileSmart.write(buffer);
            // Flush again
            await diskIOFileSmart.flush();
            // Write again the same
            await diskIOFileSmart.write(buffer);
            // Flush again
            await diskIOFileSmart.flush();
            // Read from disk
            const readed = await diskIOFileSmart.read(5, bufferMixed.length);
            // Get hash of readed
            const readedHash = await blake3(readed);
            // Clean up
            await diskIOFileSmart.delete();
            await diskIOFileSmart.close();
            // Expect hash to be equal to new one
            expect(readedHash).toBe(hash);
        });

        it('should read a range from 1º to 2º chunk of file with 3 chunks', async () => {
            // Instance it
            const diskIOFileSmart = new DiskIOFileSmart(diskio);
            // Wait to be ready
            await diskIOFileSmart.ready;
            // Create a small buffer
            const buffer = Buffer.from("Hello world! | Hello world! | Hello world! | Hello world! | Hello world! | Hello world! | Hello world!");
            // Mixed it to get hash
            const bufferMixed = Buffer.concat([buffer, buffer, buffer]);
            // Get original hash to check after
            const hash = await blake3(bufferMixed.subarray(95, 135));
            // Write the file
            await diskIOFileSmart.write(buffer);
            // Flush to force 2 writes to disk
            await diskIOFileSmart.flush();
            // Write again the same
            await diskIOFileSmart.write(buffer);
            // Flush again
            await diskIOFileSmart.flush();
            // Write again the same
            await diskIOFileSmart.write(buffer);
            // Flush again
            await diskIOFileSmart.flush();
            // Read from disk
            const readed = await diskIOFileSmart.read(95, 135);
            // Get hash of readed
            const readedHash = await blake3(readed);
            // Clean up
            await diskIOFileSmart.delete();
            await diskIOFileSmart.close();
            // Expect hash to be equal to new one
            expect(readedHash).toBe(hash);
        });

        it('should read a range from 1º to 3º chunk of file with 3 chunks', async () => {
            // Instance it
            const diskIOFileSmart = new DiskIOFileSmart(diskio);
            // Wait to be ready
            await diskIOFileSmart.ready;
            // Create a small buffer
            const buffer = Buffer.from("Hello world! | Hello world! | Hello world! | Hello world! | Hello world! | Hello world! | Hello world!");
            // Mixed it to get hash
            const bufferMixed = Buffer.concat([buffer, buffer, buffer]);
            // Get original hash to check after
            const hash = await blake3(bufferMixed.subarray(95, 235));
            // Write the file
            await diskIOFileSmart.write(buffer);
            // Flush to force 2 writes to disk
            await diskIOFileSmart.flush();
            // Write again the same
            await diskIOFileSmart.write(buffer);
            // Flush again
            await diskIOFileSmart.flush();
            // Write again the same
            await diskIOFileSmart.write(buffer);
            // Flush again
            await diskIOFileSmart.flush();
            // Read from disk
            const readed = await diskIOFileSmart.read(95, 235);
            // Get hash of readed
            const readedHash = await blake3(readed);
            // Clean up
            await diskIOFileSmart.delete();
            await diskIOFileSmart.close();
            // Expect hash to be equal to new one
            expect(readedHash).toBe(hash);
        });

        it('should read a range from 2º to 3º chunk of file with 3 chunks', async () => {
            // Instance it
            const diskIOFileSmart = new DiskIOFileSmart(diskio);
            // Wait to be ready
            await diskIOFileSmart.ready;
            // Create a small buffer
            const buffer = Buffer.from("Hello world! | Hello world! | Hello world! | Hello world! | Hello world! | Hello world! | Hello world!");
            // Mixed it to get hash
            const bufferMixed = Buffer.concat([buffer, buffer, buffer]);
            // Get original hash to check after
            const hash = await blake3(bufferMixed.subarray(135, 235));
            // Write the file
            await diskIOFileSmart.write(buffer);
            // Flush to force 2 writes to disk
            await diskIOFileSmart.flush();
            // Write again the same
            await diskIOFileSmart.write(buffer);
            // Flush again
            await diskIOFileSmart.flush();
            // Write again the same
            await diskIOFileSmart.write(buffer);
            // Flush again
            await diskIOFileSmart.flush();
            // Read from disk
            const readed = await diskIOFileSmart.read(135, 235);
            // Get hash of readed
            const readedHash = await blake3(readed);
            // Clean up
            await diskIOFileSmart.delete();
            await diskIOFileSmart.close();
            // Expect hash to be equal to new one
            expect(readedHash).toBe(hash);
        });

        it('should read a range from 3º to 3º chunk of file with 3 chunks', async () => {
            // Instance it
            const diskIOFileSmart = new DiskIOFileSmart(diskio);
            // Wait to be ready
            await diskIOFileSmart.ready;
            // Create a small buffer
            const buffer = Buffer.from("Hello world! | Hello world! | Hello world! | Hello world! | Hello world! | Hello world! | Hello world!");
            // Mixed it to get hash
            const bufferMixed = Buffer.concat([buffer, buffer, buffer]);
            // Get original hash to check after
            const hash = await blake3(bufferMixed.subarray(235));
            // Write the file
            await diskIOFileSmart.write(buffer);
            // Flush to force 2 writes to disk
            await diskIOFileSmart.flush();
            // Write again the same
            await diskIOFileSmart.write(buffer);
            // Flush again
            await diskIOFileSmart.flush();
            // Write again the same
            await diskIOFileSmart.write(buffer);
            // Flush again
            await diskIOFileSmart.flush();
            // Read from disk
            const readed = await diskIOFileSmart.read(235, bufferMixed.length);
            // Get hash of readed
            const readedHash = await blake3(readed);
            // Clean up
            await diskIOFileSmart.delete();
            await diskIOFileSmart.close();
            // Expect hash to be equal to new one
            expect(readedHash).toBe(hash);
        });

        it('should read a real file', async () => {
            // Instance it
            const diskIOFileSmart = new DiskIOFileSmart(diskio);
            // Wait to be ready
            await diskIOFileSmart.ready;
            //Open the file
            const file = await open('./mocks/video-a.mp4', 'r+');
            // Read the file
            const buffer = await file.readFile();
            // Get original hash
            const hash = await blake3(buffer);
            // Write the file
            await diskIOFileSmart.write(buffer);
            // Flush to assure file is fully wrote
            await diskIOFileSmart.flush();
            // Close the file
            await file.close();
            // Get manifest
            const { chunks } = diskIOFileSmart.manifest;
            expect(chunks).toEqual(videoAResult);
            // Now read the whole file
            const readed = await diskIOFileSmart.read(0, buffer.length);
            // Get the new hash of the file
            const newHash = await blake3(readed);
            // Clean up
            await diskIOFileSmart.delete();
            await diskIOFileSmart.close();
            // Expects it works
            expect(newHash).toBe(hash);
        });

        it('should read from a manifest of a written file', async () => {
            // Instance it
            const diskIOFileSmart = new DiskIOFileSmart(diskio);
            // Wait to be ready
            await diskIOFileSmart.ready;
            //Open the file
            const file = await open('./mocks/video-a.mp4', 'r+');
            // Read the file
            const buffer = await file.readFile();
            // Get original hash
            const hash = await blake3(buffer);
            // Write the file
            await diskIOFileSmart.write(buffer);
            // Flush to assure file is fully wrote
            await diskIOFileSmart.flush();
            // Close the file
            await file.close();
            // Create a new file from the manifest
            const file2 = new DiskIOFileSmart(diskio, diskIOFileSmart.manifest);
            // Wait to be ready
            await file2.ready;
            // Read the file
            const buffer2 = await file2.read(0, buffer.length);
            // Close the file
            await file2.close();
            // Get the new hash of the file
            const newHash = await blake3(buffer2);
            // Clean up
            await diskIOFileSmart.delete();
            await diskIOFileSmart.close();
            // Expects it works
            expect(newHash).toBe(hash);
        });
    });
});