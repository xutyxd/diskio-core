import { open, unlink, writeFile } from 'fs/promises';
import { pipeline } from 'node:stream/promises';

import { blake3 } from "hash-wasm";

import { DiskIOBatch } from "./diskio-batch.class";
import { DiskIOFileSmartWritable } from "./diskio-file-smart-writable.class";
import { DiskIOFileSmart } from "./diskio-file-smart.class";

// Results to compare
import videoAResult from '../../mocks/data/video-a-chunks.data.json';
import videoBResult from '../../mocks/data/video-b-chunks.data.json';

describe('DiskIOFileSmartWritable class', () => {
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

    describe.skip('DiskIOFileSmartWritable instance', () => {
        it('should instance a DiskIOFileSmartWritable class', async () => {
            // Create an empty manifest
            const manifest = { chunks: [] };
            // Create a file
            const file = new DiskIOFileSmart(diskio, manifest);
            // Wait to be ready
            await file.ready;
            // Instance it
            const stream = new DiskIOFileSmartWritable(file);
            // Excepts it works
            expect(stream).toBeInstanceOf(DiskIOFileSmartWritable);
            // Close to clean resources
            await file.close();
        });
    });

    describe('DiskIOFileSmartWritable write', () => {
        it.skip('should write a buffer', async () => {
            // Instance it
            const diskIOFileSmart = new DiskIOFileSmart(diskio);
            // Wait to be ready
            await diskIOFileSmart.ready;
            // Create an input
            const input = Buffer.from('Hello, world!');
            // Create hash
            const hash = await blake3(input);
            // Create a stream
            const stream = new DiskIOFileSmartWritable(diskIOFileSmart);
            // Write the file
            await pipeline([input], stream);
            // Clean up
            await diskIOFileSmart.delete();
            // Get manifest generated
            const manifest = diskIOFileSmart.manifest;

            expect(manifest.chunks.length).toEqual(1);
            expect(manifest.chunks[0].original).toEqual(input.length);
            expect(manifest.chunks[0].hash).toEqual(hash);
        });

        it('should stream a real file', async () => {
            // Instance it
            const diskIOFileSmart = new DiskIOFileSmart(diskio);
            // Wait to be ready
            await diskIOFileSmart.ready;
            // Create an input
            const input = await open('./mocks/video-a.mp4', 'r+');
            // Get readable stream
            const readable = input.createReadStream();
            // Create a stream
            const stream = new DiskIOFileSmartWritable(diskIOFileSmart);
            // Write the file
            await pipeline(readable, stream);
            // Clean up
            await diskIOFileSmart.delete();
            // Get manifest generated
            const { chunks } = diskIOFileSmart.manifest;
            await writeFile('generated.json', JSON.stringify(chunks, null, 2));
            // console.warn('Manifest:', chunks);
            expect(chunks).toEqual(videoAResult);
        });
    });
});