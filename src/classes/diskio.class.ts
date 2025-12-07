import child_process, { execSync } from 'node:child_process';
import { existsSync, fstatSync, mkdirSync, readSync, statSync, truncateSync, writeFileSync, writeSync } from 'node:fs';
import { FileHandle, mkdir, readdir, rmdir, stat, truncate, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { exists } from '../common/fs-extends';
import { IDiskIO } from '../interfaces/diskio.interface';
import { DiskIOFile } from './diskio-file.class';
import { withLock } from '../common/with-lock';
import { withoutError } from '../common/without-error';

const exec = promisify(child_process.exec);

export class DiskIO implements IDiskIO {
    private RESERVED_FILE = 'diskio.dat';

    protected RESERVED_SIZE;

    private path: { folder: string, diskio: string };

    protected optimal = 4096;

    private depth;

    public get folder() {
        return this.path.folder;
    }

    public ready: Promise<DiskIO>;

    constructor(path: string, size: number, depth: 1 | 2 | 3 | 4 | 5 = 2) {
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
        this.RESERVED_SIZE = size;
        // Set paths
        this.path = {
            folder: join(path),
            diskio: `${join(path)}/${this.RESERVED_FILE}`
        };
        // Set depth for the folder
        this.depth = depth;
        // Stabilize the diskio space
        this.ready = (async () => {
            await this.stabilize(size);
            this.optimal = await this.size.block();
            // Return itself
            return this;
        })();
    }

    private size = {
        block: async () => {
            const { stdout } = await exec(`stat -f -c "%S" ${this.path.folder}`);
            return Number(stdout);
        },
        diskio: async () => {
            const status = await stat(this.path.diskio);
            // Get diskio file size
            const { size } = status;

            return size;
        },
        diskioSync: () => {
            const status = statSync(this.path.diskio);
            // Get diskio file size
            const { size } = status;

            return size;
        },
        folder: async () => {
            const { stdout } = await exec(`du -sb ${this.path.folder}`);
            const cleaned = stdout.split('\t');
            const [size] = cleaned;

            return Number(size);
        },
        folderSync: () => {
            const buffer = execSync(`du -sb ${this.path.folder}`);
            const stdout = buffer.toString();
            const cleaned = stdout.split('\t');
            const [size] = cleaned;

            return Number(size);
        }
    }

    public information = {
        disk: async () => {
            const { stdout } = await exec(`df -k ${this.path.folder}`)
            const [, information] = stdout.split('\n');
            const cleaned = information.replace(/ +/g, ' ');
            const [filesystem, size, used, available, capacity, mount] = cleaned.split(' ');

            return {
                filesystem,
                size: Number(size),
                used: Number(used),
                available: Number(available),
                capacity,
                mount
            };
        },
        diskio: async () => {
            // Get diskio file size - optimal block size, one is reserved for folder metadata
            const size = this.RESERVED_SIZE - this.optimal;
            const available = await this.size.diskio();
            const used = await this.size.folder() - available;
            const capacity = Math.round(100 - (used / size) * 100);

            return {
                size, // in bytes
                used, // in bytes
                available, // in bytes
                capacity: `${capacity}%`, // in percentage
            };
        }
    }

    protected async stabilize(expected: number) {
        const diskioExists = await exists(this.path.diskio);
        // Check if diskio file exists
        if (!diskioExists) {
            // Create diskio file
            await withLock(async () => {
                await writeFile(this.path.diskio, Buffer.alloc(0));
            });
        }
        const diskio = await this.size.diskio();
        const folder = await this.size.folder();
        const difference = expected - folder + diskio;

        await withLock(async () => {
            // Truncate the difference
            await truncate(this.path.diskio, difference);
        });
    }

    private stabilizeSync(expected: number) {
        const diskioExists = existsSync(this.path.diskio);
        // Check if diskio file exists
        if (!diskioExists) {
            // Create diskio file
            writeFileSync(this.path.diskio, Buffer.alloc(0));
        }
        const diskio = this.size.diskioSync();
        const folder = this.size.folderSync();
        const difference = expected - folder + diskio;
        // Truncate the difference
        truncateSync(this.path.diskio, difference);
    }

    protected async allocate(size: number) {
        const diskio = await this.size.diskio();
        // Check if the size is less than the available size
        if (size > diskio) {
            throw new Error('The size is greater than the available size');
        }

        return await withLock(async () => {
            // Truncate the difference
            await truncate(this.path.diskio, diskio - size);
        });
    }

    private allocateSync(size: number) {
        const diskio = this.size.diskioSync();
        // Check if the size is less than the available size
        if (size > diskio) {
            throw new Error('The size is greater than the available size');
        }

        // Truncate the difference
        truncateSync(this.path.diskio, diskio - size);
    }

    public createPath(name: string, collision = false): string {
        // Check if the name is a valid string
        if (typeof name !== 'string') {
            throw new Error('The name is not a string');
        }
        // Check if the name is empty
        if (name.length === 0) {
            throw new Error('The name is empty');
        }
        // Clean the name
        const cleaned = name.split('/').filter(Boolean).join('');
        let path: string;
        // Check if the name is long enough
        if (cleaned.length >= this.depth * 2 && collision) {
            path = (cleaned.match(/.{2}/g) ?? []).slice(0, this.depth).join('/');
        } else {
            // Get a random UUID
            const uuid = crypto.randomUUID();
            // Create path for the file
            path = uuid.split('-').filter((e, index) => index < this.depth).join('/');
        }

        return path;
    }

    protected async Create(name: string, collision = false): Promise<DiskIOFile> {
        // Check if the name is a valid string
        if (typeof name !== 'string') {
            throw new Error('The name is not a string');
        }
        // Check if the name is empty
        if (name.length === 0) {
            throw new Error('The name is empty');
        }
        // Create path for the file
        const path = this.createPath(name, collision);
        const relative = join(this.path.folder, path);
        // Folders required to create the file
        await mkdir(relative, { recursive: true });
        // Create file path
        const filePath = join(relative, name);
        // Check if file exists
        if (await exists(filePath) && !collision) {
            // Recall trying to get a new path without the file
            return this.create(name, collision);
        }
        // Create the file (not locked because empty file not consume space)
        await writeFile(filePath, Buffer.alloc(0));
        // Return the file
        return this.get(filePath.replace(this.path.folder, ''));
    }

    public async create(name: string, collision = false): Promise<DiskIOFile> {
        // Get the path for the file
        const path = this.createPath(name, collision);
        // Count all folders
        const folders = path.split('/').filter(Boolean).length;
        // Allocate maximum possible space
        await this.allocate(folders * this.optimal);
        // Create the file
        const file = this.Create(name, collision);
        // Stabilize the diskio space, maybe not all allocated space is used
        await this.stabilize(this.RESERVED_SIZE);
        // Return the file
        return file;
    }

    public createSync(name: string, collision = false): DiskIOFile {
        // Check if the name is a valid string
        if (typeof name !== 'string') {
            throw new Error('The name is not a string');
        }
        // Check if the name is empty
        if (name.length === 0) {
            throw new Error('The name is empty');
        }
        // Create path for the file
        const path = this.createPath(name, collision);
        const relative = join(this.path.folder, path);
        // Folders required to create the file
        mkdirSync(relative, { recursive: true });
        // Create file path
        const filePath = join(relative, name);
        // Check if file exists
        if (existsSync(filePath) && !collision) {
            // Recall trying to get a new path without the file
            return this.createSync(name, collision);
        }
        // Create the file
        writeFileSync(filePath, Buffer.alloc(0));
        // Update the diskio file (folder metadata have size)
        this.stabilizeSync(this.RESERVED_SIZE);
        // Return the file
        return this.getSync(filePath.replace(this.path.folder, ''));
    }

    public exists(name: string): Promise<boolean> {
        // Clean the name
        const cleaned = name.split('/').filter(Boolean);
        // Get the path
        const path = join(this.path.folder, ...cleaned);
        // Check that name is not diskio file
        if (path === this.path.diskio) {
            throw new Error('The name is diskio storage file');
        }
        // Check if file exists
        return exists(path);
    }

    public existsSync(name: string): boolean {
        // Clean the name
        const cleaned = name.split('/').filter(Boolean);
        // Get the path
        const path = join(this.path.folder, ...cleaned);
        // Check that name is not diskio file
        if (path === this.path.diskio) {
            throw new Error('The name is diskio storage file');
        }
        // Check if file exists
        return existsSync(path);
    }

    public async get(name: string, check = false): Promise<DiskIOFile> {
        // Clean the name
        const cleaned = name.split('/').filter(Boolean);
        // Get the path
        const path = join(this.path.folder, ...cleaned);
        // Check that name is not diskio file
        if (path === this.path.diskio) {
            throw new Error('The name is diskio storage file');
        }
        // If need to check if file exists
        if (check) {
            // Check if file exists
            const result = await exists(path);
            if (!result) {
                throw new Error('The file does not exist');
            }
        }
        // Get an instance of the file
        const diskioFile = new DiskIOFile(this, cleaned);
        // Wait for the file to be ready
        await diskioFile.ready;
        // Return the file
        return diskioFile;
    }

    public getSync(name: string, check = false): DiskIOFile {
        // Clean the name
        const cleaned = name.split('/').filter(Boolean);
        // Get the path
        const path = join(this.path.folder, ...cleaned);
        // Check that name is not diskio file
        if (path === this.path.diskio) {
            throw new Error('The name is diskio storage file');
        }
        // If need to check if file exists
        if (check) {
            // Check if file exists
            const result = existsSync(path);
            if (!result) {
                throw new Error('The file does not exist');
            }
        }
        // Get an instance of the file
        const diskioFile = new DiskIOFile(this, cleaned);
        // Return the file
        return diskioFile;
    }

    public async read(fh: FileHandle, start: number, end: number): Promise<Buffer> {
        // Get file size
        const { size } = await fh.stat();
        // Get real end position
        const realEnd = end > size ? size : end;
        // Get difference between the expected size and the available size
        const difference = realEnd - start;
        // Get many bytes to read
        const length = difference > 0 ? difference : 0;
        // Create a buffer to read
        const buffer = Buffer.alloc(length);
        // Calculate how many reads are needed
        let reads = Math.ceil(length / this.optimal);
        // Set index to 0
        let index = 0;
        // Create a promise array
        const promises = [];
        // Iterate over the blobs
        while (index < reads) {
            // Calculate offset to read
            const offset = index * this.optimal;
            // Calculate remaining bytes to read
            const remaining = length - offset;
            // Calculate how many bytes to read
            const toRead = this.optimal > remaining ? remaining : this.optimal;
            // Read the buffer
            promises.push(fh.read(buffer, offset, toRead, start + offset));
            // Increment the index
            index++;
        }

        await Promise.all(promises);

        return buffer;
    }

    public readSync(fh: FileHandle, start: number, end: number): Buffer {
        // Get descriptor
        const descriptor = fh.fd;
        // Get file stats
        const stats = fstatSync(descriptor);
        // Get diskio file size
        const { size } = stats;
        // Get real end position
        const realEnd = end > size ? size : end;
        // Get difference between the expected size and the available size
        const difference = realEnd - start;
        // Get many bytes to read
        const length = difference > 0 ? difference : 0;
        // Create a buffer to read
        const buffer = Buffer.alloc(length);
        // Calculate how many reads are needed
        let reads = Math.ceil(length / this.optimal);
        // Set index to 0
        let index = 0;
        // Iterate over the blobs
        while (index < reads) {
            // Calculate offset to read
            const offset = index * this.optimal;
            // Calculate remaining bytes to read
            const remaining = length - offset;
            // Calculate how many bytes to read
            const toRead = this.optimal > remaining ? remaining : this.optimal;
            // Read from the file
            readSync(descriptor, buffer, offset, toRead, start + offset);
            // Increment the index
            index++;
        }

        return buffer;
    }

    protected async Write(fh: FileHandle, data: Buffer, position: number) {
        // Calculate how many writes are needed
        let writes = Math.ceil(data.length / this.optimal);
        // Set index to 0
        let index = 0;
        // Create a promise array
        const promises: Promise<{ bytesWritten: number; buffer: Buffer; }>[] = [];
        // Iterate over the blobs
        while (index < writes) {
            // Calculate offset to write
            const offset = index * this.optimal;
            // Calculate remaining bytes to write
            const remaining = data.length - offset;
            // Calculate how many bytes to write
            const toWrite = this.optimal > remaining ? remaining : this.optimal;
            // Write the buffer
            // Not locked because it's pre-allocated
            promises.push(fh.write(data, offset, toWrite, position + offset));
            // Increment the index
            index++;
        }

        await Promise.all(promises);
    }

    public async write(fh: FileHandle, data: Buffer, position: number) {
        // First, allocate the space
        await this.allocate(data.length);
        // Write it
        return this.Write(fh, data, position);
    }

    public writeSync(fh: FileHandle, data: Buffer, position: number) {
        // First, allocate the space
        this.allocateSync(data.length);
        // Calculate how many writes are needed
        let writes = Math.ceil(data.length / this.optimal);
        // Set index to 0
        let index = 0;
        // Iterate over the blobs
        while (index < writes) {
            // Calculate offset to write
            const offset = index * this.optimal;
            // Calculate remaining bytes to write
            const remaining = data.length - offset;
            // Calculate how many bytes to write
            const toWrite = this.optimal > remaining ? remaining : this.optimal;
            // Write the buffer
            writeSync(fh.fd, data, offset, toWrite, position + offset);
            // Increment the index
            index++;
        }
    }

    protected async Delete(fh: FileHandle, name: string[]) {
        // Close the file handle
        await fh.close();
        const path = join(this.path.folder, ...name);
        // Delete the file without check if exists        
        await withoutError(async () => unlink(path));
        let copy = [...name];
        // Remove last element until get undefined
        while (copy.pop()) {
            // Get folder path
            const parent = join(this.path.folder, ...copy);
            // Check if folder parent is empty
            const readed = await readdir(parent);
            // Avoid to delete if have files or folders
            if (readed.length !== 0) {
                // If have files or folders, stop
                break;
            }
            await withoutError(async () => rmdir(parent));
        }
    }

    public async delete(fh: FileHandle, name: string[]) {
        // Delete the file
        await this.Delete(fh, name);
        // Update the diskio file
        await this.stabilize(this.RESERVED_SIZE);
    }
}