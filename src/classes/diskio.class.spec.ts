
import { unlink } from 'fs/promises';
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
            // Remove the file
            await file.delete();
            
            expect(file).toBeInstanceOf(DiskIOFile);
            expect(file.name).toContain('test.txt');
        });
    });

    describe('DiskIO createSync', () => {
        it('should throw an error if the name is not a string', async () => {
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            await diskio.ready;

            try {
                diskio.createSync(10 as unknown as string);
            } catch (error) {
                const { message } = error as Error;
                expect(message).toBe('The name is not a string');
            }
        });

        it('should throw an error if the name is empty', async () => {
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            await diskio.ready;

            try {
                diskio.createSync('');
            } catch (error) {
                const { message } = error as Error;
                expect(message).toBe('The name is empty');
            }
        });

        it('should create a file', async () => {
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            await diskio.ready;

            const file = diskio.createSync('test.txt');
            // Remove the file
            await file.delete();
            
            expect(file).toBeInstanceOf(DiskIOFile);
            expect(file.name).toContain('test.txt');
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

        it('should get a file that not exist previously', async () => {
            // Get instance of the diskio
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            // Wait to be ready
            await diskio.ready;
            // Get the file
            const file = await diskio.get('test.txt');
            
            expect(file).toBeInstanceOf(DiskIOFile);
            expect(file.name).toContain('test.txt');

            await file.delete();
        });

        it('should thrown an error if check param is setted', async () => {
            // Get instance of the diskio
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            // Wait to be ready
            await diskio.ready;

            let result: DiskIOFile | Error;

            try {
                // Get the file
                result = await diskio.get('test.txt', true);
            } catch (error) {
                result = error as Error;
            }
            
            expect(result).toBeInstanceOf(Error);
        });
    });

    describe('DiskIO getSync', () => {
        it('should throw an error if the name is diskio storage', () => {
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);

            try {
                diskio.getSync('diskio.dat');
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
            const file = diskio.getSync(created.name);
            
            expect(file).toBeInstanceOf(DiskIOFile);
            expect(file.name).toContain('test.txt');

            await file.delete();
        });

        it('should get a file that not exist previously', async () => {
            // Get instance of the diskio
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            // Wait to be ready
            await diskio.ready;
            // Get the file
            const file = diskio.getSync('test.txt');
            
            expect(file).toBeInstanceOf(DiskIOFile);
            expect(file.name).toContain('test.txt');

            await file.delete();
        });

        it('should thrown an error if check param is setted', async () => {
            // Get instance of the diskio
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            // Wait to be ready
            await diskio.ready;

            let result: DiskIOFile | Error;

            try {
                // Get the file
                result = diskio.getSync('test.txt', true);
            } catch (error) {
                result = error as Error;
            }
            
            expect(result).toBeInstanceOf(Error);
        });
    });

    describe('DiskIO read', () => {
        it('should read if is less than file size without offset', async () => {
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            await diskio.ready;
            const buffer = Buffer.from('Hello world!');

            const file = await diskio.create('test.txt');
            await file.write(buffer, 0);

            const read = await diskio.read(file['fh'], 0, 5);
            // Remove the file
            await file.delete();
            
            expect(read).toBeInstanceOf(Buffer);
            expect(read.toString()).toBe('Hello');
        });

        it('should read nothing if start is higher than end', async () => {
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            await diskio.ready;
            const buffer = Buffer.from('Hello world!');

            const file = await diskio.create('test.txt');
            await file.write(buffer, 0);

            const read = await diskio.read(file['fh'], 6, 5);
            // Remove the file
            await file.delete();
            
            expect(read).toBeInstanceOf(Buffer);
            expect(read.toString()).toBe('');
        });

        it('should read if is less than file size with offset', async () => {
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            await diskio.ready;
            const buffer = Buffer.from('Hello world!');

            const file = await diskio.create('test.txt');
            await file.write(buffer, 0);

            const read = await diskio.read(file['fh'], 6, 6 + 5);
            // Remove the file
            await file.delete();
            
            expect(read).toBeInstanceOf(Buffer);
            expect(read.toString()).toBe('world');
        });

        it('should read if is more than file size with offset', async () => {
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            await diskio.ready;
            const buffer = Buffer.from('Hello world!');

            const file = await diskio.create('test.txt');
            await file.write(buffer, 0);

            const read = await diskio.read(file['fh'], 11, 25);
            // Remove the file
            await file.delete();
            
            expect(read).toBeInstanceOf(Buffer);
            expect(read.toString()).toBe('!');
        });

        it('should read if is more than file size', async () => {
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            await diskio.ready;
            const buffer = Buffer.from('Hello world!');

            const file = await diskio.create('test.txt');
            await file.write(buffer, 0);

            const read = await diskio.read(file['fh'], 0, buffer.length + 10);
            // Remove the file
            await file.delete();
            
            expect(read).toBeInstanceOf(Buffer);
            expect(read.toString()).toBe(buffer.toString());
        });
    });

    describe('DiskIO readSync', () => {
        it('should read if is less than file size without offset', async () => {
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            await diskio.ready;
            const buffer = Buffer.from('Hello world!');

            const file = await diskio.create('test.txt');
            await file.write(buffer, 0);

            const read = diskio.readSync(file['fh'], 0, 5);
            // Remove the file
            await file.delete();
            
            expect(read).toBeInstanceOf(Buffer);
            expect(read.toString()).toBe('Hello');
        });

        it('should read nothing if start is higher than end', async () => {
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            await diskio.ready;
            const buffer = Buffer.from('Hello world!');

            const file = await diskio.create('test.txt');
            await file.write(buffer, 0);

            const read = diskio.readSync(file['fh'], 6, 5);
            // Remove the file
            await file.delete();
            
            expect(read).toBeInstanceOf(Buffer);
            expect(read.toString()).toBe('');
        });

        it('should read if is less than file size with offset', async () => {
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            await diskio.ready;
            const buffer = Buffer.from('Hello world!');

            const file = await diskio.create('test.txt');
            await file.write(buffer, 0);

            const read = diskio.readSync(file['fh'], 6, 6 + 5);
            // Remove the file
            await file.delete();
            
            expect(read).toBeInstanceOf(Buffer);
            expect(read.toString()).toBe('world');
        });

        it('should read if is more than file size with offset', async () => {
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            await diskio.ready;
            const buffer = Buffer.from('Hello world!');

            const file = await diskio.create('test.txt');
            await file.write(buffer, 0);

            const read = diskio.readSync(file['fh'], 11, 25);
            // Remove the file
            await file.delete();
            
            expect(read).toBeInstanceOf(Buffer);
            expect(read.toString()).toBe('!');
        });

        it('should read if is more than file size', async () => {
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            await diskio.ready;
            const buffer = Buffer.from('Hello world!');

            const file = await diskio.create('test.txt');
            await file.write(buffer, 0);

            const read = diskio.readSync(file['fh'], 0, buffer.length + 10);
            // Remove the file
            await file.delete();
            
            expect(read).toBeInstanceOf(Buffer);
            expect(read.toString()).toBe(buffer.toString());
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
            // Remove the file
            await file.delete();
            
            expect(read).toBeInstanceOf(Buffer);
            expect(read.toString()).toBe(buffer.toString());
        });

        it('should write a file with a buffer bigger than 65536 bytes', async () => {            
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            await diskio.ready;
            const buffer = Buffer.from(new Array(65537).fill('A').join(''));

            // Get the file
            const file = await diskio.get('test.txt');
            // Write the file
            await file.write(buffer, 0);
            // Read the file
            const read = await diskio.read(file['fh'], 0, buffer.length);
            // Remove the file
            await file.delete();

            expect(read).toBeInstanceOf(Buffer);
            expect(read.toString()).toBe(buffer.toString());
        });

        it('should write a file that not exist previously', async () => {
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            await diskio.ready;
            const buffer = Buffer.from('Hello world!');

            // Get the file
            const file = await diskio.get('test.txt');
            // Write the file
            await file.write(buffer, 0);
            // Read the file
            const read = await diskio.read(file['fh'], 0, buffer.length);
            // Remove the file
            await file.delete();

            expect(read).toBeInstanceOf(Buffer);
            expect(read.toString()).toBe(buffer.toString());
        });
    });

    describe('DiskIO writeSync', () => {
        it('should throw an error if want to write more than the available size', async () => {
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            await diskio.ready;

            const file = await diskio.create('test.txt');
            const buffer = Buffer.alloc(10 * 1024 * 1024 + 1);
            try {
                diskio.writeSync(file['fh'], buffer, 0);
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
            file.writeSync(buffer, 0);

            const read = await diskio.read(file['fh'], 0, buffer.length);
            // Remove the file
            await file.delete();
            
            expect(read).toBeInstanceOf(Buffer);
            expect(read.toString()).toBe(buffer.toString());
        });

        it('should write a file with a buffer bigger than 65536 bytes', async () => {            
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            await diskio.ready;
            const buffer = Buffer.from(new Array(65537).fill('A').join(''));

            // Get the file
            const file = await diskio.get('test.txt');
            // Write the file
            file.writeSync(buffer, 0);
            // Read the file
            const read = await diskio.read(file['fh'], 0, buffer.length);
            // Remove the file
            await file.delete();

            expect(read).toBeInstanceOf(Buffer);
            expect(read.toString()).toBe(buffer.toString());
        });

        it('should write a file that not exist previously', async () => {
            const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
            await diskio.ready;
            const buffer = Buffer.from('Hello world!');

            // Get the file
            const file = await diskio.get('test.txt');
            // Write the file
            file.writeSync(buffer, 0);
            // Read the file
            const read = await diskio.read(file['fh'], 0, buffer.length);
            // Remove the file
            await file.delete();

            expect(read).toBeInstanceOf(Buffer);
            expect(read.toString()).toBe(buffer.toString());
        });
    });
});