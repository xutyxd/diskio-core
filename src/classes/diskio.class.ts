import child_process from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { FileHandle, stat, truncate, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { exists } from '../common/fs-extends';
import { IDiskIO } from '../interfaces/diskio.interface';

const exec = promisify(child_process.exec);

export class DiskIO implements IDiskIO {
    private RESERVED_FILE = 'diskio.dat';
    private path: { folder: string, diskio: string };
    private optimal = 4096;

    public get folder() {
        return this.path.folder;
    }

    public ready: Promise<void>;

    constructor(path: string, size: number) {
        // Check if the path exists
        if (!existsSync(path)) {
            throw new Error('The path does not exist');
        }
        // Check if the path is a valid directory
        const isDirectory = statSync(path).isDirectory();
        if (!isDirectory) {
            throw new Error('The path is not a directory');
        }
        // Check if the size is a valid number
        if (typeof size !== 'number') {
            throw new Error('The size is not a number');
        }
        // Check if the size is positive
        if (size <= 0) {
            throw new Error('The size must be positive');
        }
        // Set paths
        this.path = {
            folder: path,
            diskio: `${path}/${this.RESERVED_FILE}`
        };
        // Stabilize the diskio space
        this.ready = new Promise(async (resolve) => {
            await this.stabilize(size);
            this.optimal = await this.size.block();
            resolve();
        });
    }

    private size = {
        block: async () => {
            const { stdout } = await exec(`stat -f -c "%S" ${this.path.folder}`);
            return Number(stdout);
        },
        diskio: async () => {
            // Get diskio file size
            const { size } = await stat(this.path.diskio);

            return size;
        },
        folder: async () => {
            const { stdout } = await exec(`du -sb ${this.path.folder}`);
            const cleaned = stdout.split('\t');
            const [ size ] = cleaned;

            return Number(size);
        }
    }

    private information = {
        disk: async () => {
            const { stdout } = await exec(`df -k ${this.path.folder}`)
            const [, information] = stdout.split('\n');
            const cleaned = information.replace(/ +/g, ' ');
            const [ filesystem, size, used, available, capacity, mount ] = cleaned.split(' ');
    
            return {
                filesystem,
                size: Number(size),
                used: Number(used),
                available: Number(available),
                capacity,
                mount
            };
        },
        diskio: async (expected: number) => {
            const size = expected;            
            const available = await this.size.diskio();
            const used = await this.size.folder() - available;
            const capacity = Math.round((used / size) * 100);

            return {
                size, // in bytes
                used, // in bytes
                available, // in bytes
                capacity: `${capacity}%`, // in percentage
            };
        }
    }

    private async stabilize(expected: number) {
        const diskioExists = await exists(this.path.diskio);
        // Check if diskio file exists
        if (!diskioExists) {
            // Create diskio file
            await writeFile(this.path.diskio, Buffer.alloc(0));
        }
        const diskio = await this.size.diskio();
        const folder = await this.size.folder();
        const difference = expected - folder + diskio;
        // Truncate the difference
        await truncate(this.path.diskio, difference);
    }

    private async allocate(size: number) {
        // Check if the size is a valid number
        if (typeof size !== 'number') {
            throw new Error('The size is not a number');
        }
        // Check if the size is positive
        if (size <= 0) {
            throw new Error('The size must be positive');
        }
        const diskio = await this.size.diskio();
        // Check if the size is less than the available size
        if (size > diskio) {
            throw new Error('The size is greater than the available size');
        }

        // Truncate the difference
        await truncate(this.path.diskio, diskio - size);
    }

    public async read(fh: FileHandle, start: number, end: number): Promise<Buffer> {
        // Get difference between the expected size and the available size
        const difference = end - start;
        // Get file size
        const { size } = await fh.stat();
        // Create a buffer to read
        const buffer = Buffer.alloc(end - start);
        // Calculate how many reads are needed
        let reads = Math.ceil(difference / this.optimal);
        // Set index to 0
        let index = 0;
        // Iterate over the blobs
        while (index <= reads) {
            // Calculate the buffer start position
            const bufferStart = index * this.optimal;
            // Calculate how many bytes to read
            const bytesToRead = bufferStart + this.optimal > size ? size - bufferStart : this.optimal;
            // Read the buffer
            await fh.read(buffer, bufferStart, bytesToRead, bufferStart);
            // Increment the index
            index++;
        }

        return buffer;
    }

    public async write(fh: FileHandle, data: Buffer, position: number) {
        // First, allocate the space
        await this.allocate(data.length);
        // Get file size
        const { size } = await fh.stat();
        // Calculate how many writes are needed
        let writes = Math.ceil(data.length / this.optimal);
        // Set index to 0
        let index = 0;
        // Iterate over the blobs
        while (index <= writes) {
            // Calculate the buffer start position
            const bufferStart = index * this.optimal;
            // Calculate how many bytes to write
            const bytesToWrite = bufferStart + this.optimal > size ? size - bufferStart : this.optimal;
            // Write the buffer
            await fh.write(data, bufferStart, bytesToWrite, bufferStart);
            // Increment the index
            index++;
        }
    }

    public async delete(fh: FileHandle, name: string) {
        // Remove the file
        await fh.close();
        await unlink(join(this.path.folder, name));
    }
}