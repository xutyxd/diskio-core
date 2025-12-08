import { open, unlink } from 'fs/promises';

import { blake3 } from "hash-wasm";

import { DiskIOBatch } from "./diskio-batch.class";
import { DiskIOFileSmartReadable } from "./diskio-file-smart-readable.class";
import { DiskIOFileSmart } from "./diskio-file-smart.class";


describe.skip('DiskIOFileSmartReadable class', () => {
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

    describe('DiskIOFileSmartReadable instance', () => {
        it('should instance a DiskIOFileSmartReadable class', async () => {
            // Create an empty manifest
            const manifest = { chunks: [] };
            // Create a file
            const file = new DiskIOFileSmart(diskio, manifest);
            // Wait to be ready
            await file.ready;
            // Instance it
            const stream = new DiskIOFileSmartReadable(file);
            // Excepts it works
            expect(stream).toBeInstanceOf(DiskIOFileSmartReadable);
            // Close to clean resources
            await file.close();
        });
    });

    describe('DiskIOFileSmartReadable read', () => {
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
            const stream = new DiskIOFileSmartReadable(diskIOFileSmart);
            // Read the file
            const chunks: Buffer[] = [];
            // Push for every chunk
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const data = Buffer.concat(chunks);
            // Get hash of readed
            const readedHash = await blake3(data);
            // Clean up
            await diskIOFileSmart.delete();
            // Close file
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
            const stream = new DiskIOFileSmartReadable(diskIOFileSmart);
            // Read the file
            const readed: Buffer[] = [];
            // Push for every chunk
            for await (const chunk of stream) {
                readed.push(chunk);
            }
            const data = Buffer.concat(readed);
            // Hash readed
            const readedHash = await blake3(data);
            expect(readedHash).toBe(hash);

            try {
                // Clean up
                await diskIOFileSmart.delete();
                // Close file
                await diskIOFileSmart.close();
            } catch { }
        });

        it('should read a real file', async () => {
            // Instance it
            const diskIOFileSmart = new DiskIOFileSmart(diskio);
            // Wait to be ready
            await diskIOFileSmart.ready;
            //Open the file
            const file = await open('./mocks/video-a.mp4', 'r+');
            // Read the whole file
            const buffer = await file.readFile();
            // Get hash of it
            const hash = await blake3(buffer);
            // Write the file
            await diskIOFileSmart.write(buffer);
            // Flush to assure file is fully wrote
            await diskIOFileSmart.flush();
            // Close the file
            await file.close();
            // Read the file
            const stream = new DiskIOFileSmartReadable(diskIOFileSmart);
            // Read the file
            const chunks: Buffer[] = [];
            // Push for every chunk
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const data = Buffer.concat(chunks);
            // Get the new hash of the file
            const readedHash = await blake3(data);
            // Clean up
            await diskIOFileSmart.delete();
            // Close file
            await diskIOFileSmart.close();
            // Expects it works
            expect(readedHash).toBe(hash);
        });
    });
});