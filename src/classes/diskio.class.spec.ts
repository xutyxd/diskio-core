
import { rm, unlink } from 'fs/promises';
import { join } from 'path';
import { DiskIOFile } from './diskio-file.class';
import { DiskIO } from './diskio.class';

describe('DiskIO class', () => {
    beforeEach(async () => {
        try {
            await unlink('./mocks/diskio-a/diskio.dat');
        } catch { }
    });

    describe('DiskIO instance', () => {
        it('should throw an error if the path does not exist', () => {
            expect(() => new DiskIO('path/to/non-existent/directory', 100)).toThrow('The path does not exist');
        });

        it('should throw an error if the path is not a directory', () => {
            expect(() => new DiskIO('./mocks/video-a.mp4', 100)).toThrow('The path is not a directory');
        });

        it('should throw an error if the size is not a number', () => {
            expect(() => new DiskIO('./mocks', 'NaN' as unknown as number)).toThrow('The size is not a number');
        });

        it('should throw an error if the size is negative', () => {
            expect(() => new DiskIO('./mocks', -100)).toThrow('The size must be positive');
        });

        it('should instance a DiskIO class', async () => {
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            await diskio.ready;
            expect(diskio).toBeInstanceOf(DiskIO);
            expect(diskio.folder).toBe(join('./mocks/diskio-a'));
        });
    });

    describe('DiskIO information', () => {
        describe('DiskIO information.disk', () => {
            it('should return the disk information.disk', async () => {
                const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
                await diskio.ready;
                const diskInformation = await diskio.information.disk();

                expect(diskInformation).toBeInstanceOf(Object);
                expect(typeof diskInformation.filesystem).toBe('string');
                expect(typeof diskInformation.size).toBe('number');
                expect(typeof diskInformation.used).toBe('number');
                expect(typeof diskInformation.available).toBe('number');
                expect(typeof diskInformation.capacity).toBe('string');
                expect(typeof diskInformation.mount).toBe('string');
            });
        });

        describe('DiskIO information.diskio', () => {
            it('should return the disk information.diskio', async () => {
                const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
                await diskio.ready;
                const diskioInformation = await diskio.information.diskio();
    
                expect(diskioInformation).toBeInstanceOf(Object);
                expect(diskioInformation.size).toBe(10 * 1024 * 1024 - diskio['optimal']);
                expect(diskioInformation.used).toBe(diskio['optimal']);
                expect(diskioInformation.available).toBe(10 * 1024 * 1024 - diskio['optimal']);
                expect(diskioInformation.capacity).toBe('100%');
            });
        });
    });

    describe('DiskIO create', () => {
        it('should throw an error if the name is not a string', async () => {
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            await diskio.ready;

            try {
                await diskio.create(10 as unknown as string);
            } catch (error) {
                const { message } = error as Error;
                expect(message).toBe('The name is not a string');
            }
        });

        it('should throw an error if the name is empty', async () => {
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            await diskio.ready;

            try {
                await diskio.create('');
            } catch (error) {
                const { message } = error as Error;
                expect(message).toBe('The name is empty');
            }
        });

        it('should create a file', async () => {
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            await diskio.ready;

            const file = await diskio.create('test.txt');

            expect(file).toBeInstanceOf(DiskIOFile);
            console.log('File name: ', file.name);
            expect(file.name).toContain('test.txt');

            await file.delete();
        });
    });

    describe('DiskIO get', () => {
        it('should throw an error if the name is diskio storage', async () => {
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);

            try {
                await diskio.get('diskio.dat');
            } catch (error) {
                const { message } = error as Error;
                expect(message).toBe('The name is diskio storage file');
            }
        });

        it('should get a file', async () => {
            // Get instance of the diskio
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            // Wait to be ready
            await diskio.ready;
            // Create a file
            const created = await diskio.create('test.txt');
            // Close the file
            await created.close();
            // Get the file
            const file = await diskio.get(created.name);
            
            expect(file).toBeInstanceOf(DiskIOFile);
            expect(file.name).toContain('test.txt');

            await file.delete();
        });
    });

    describe('DiskIO write', () => {
        it('should throw an error if want to write more than the available size', async () => {
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            await diskio.ready;

            const file = await diskio.create('test.txt');
            const buffer = Buffer.alloc(10 * 1024 * 1024 + 1);
            try {
                await diskio.write(file['fh'], buffer, 0);
            } catch (error) {
                const { message } = error as Error;
                expect(message).toBe('The size is greater than the available size');
            }

            await file.delete();
        });

        it('should write a file', async () => {
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            await diskio.ready;
            const buffer = Buffer.from('Hello world!');

            const file = await diskio.create('test.txt');
            await file.write(buffer, 0);

            const read = await diskio.read(file['fh'], 0, buffer.length);

            expect(read).toBeInstanceOf(Buffer);
            expect(read.toString()).toBe(buffer.toString());

            await file.delete();
        });
    });
});