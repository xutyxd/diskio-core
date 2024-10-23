import fs from 'node:fs';
import { execSync } from 'node:child_process';

export class DiskIO {
    private RESERVED_FILE = 'diskio.dat';
    private path: { folder: string, diskio: string };

    constructor(path: string, size: number) {
        // Check if the path exists
        if (!fs.existsSync(path)) {
            throw new Error('The path does not exist');
        }
        // Check if the path is a valid directory
        const isDirectory = fs.statSync(path).isDirectory();
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
        this.stabilize(size);
    }

    private stabilize(expected: number) {
        // Check if diskio file exists
        if (!fs.existsSync(this.path.diskio)) {
            // Create diskio file
            fs.writeFileSync(this.path.diskio, Buffer.alloc(0));
        }
        const diskio = this.size.diskio();
        const difference = expected - this.size.folder() + diskio;
        // Truncate the difference
        fs.truncateSync(this.path.diskio, difference);
    }

    private size = {
        diskio: () => {
            // Get diskio file size
            const { size } = fs.statSync(this.path.diskio);

            return size;
        },
        folder: () => {
            const stdout = execSync(`du -sb ${this.path.folder}`).toString();
            const cleaned = stdout.split('\t');
            const [ size ] = cleaned;

            return Number(size);
        }
    }

    private information = {
        disk: () => {
            const stdout = execSync(`df -k ${this.path.folder}`).toString();
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
        diskio: (expected: number) => {
            const size = expected;            
            const available = this.size.diskio();
            const used = this.size.folder() - available;
            const capacity = Math.round((used / size) * 100);

            return {
                size, // in bytes
                used, // in bytes
                available, // in bytes
                capacity: `${capacity}%`, // in percentage
            };
        }
    }

    private async reserve() {
    
    }
}