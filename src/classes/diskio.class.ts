import fs from 'node:fs';
import { execSync } from 'node:child_process';

export class DiskIO {
    private RESERVED_FILE = 'diskio.dat';

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

        const disk = this.information.disk(path);
        const diskio = this.information.diskio(`${path}/${this.RESERVED_FILE}`, size);
        console.log('Disk: ', disk);
        console.log('DiskIO: ', diskio);
    }

    private information = {
        disk: (path: string) => {
            const stdout = execSync(`df -k ${path}`).toString();
            const [, information] = stdout.split('\n');
            const cleaned = information.replace(/ +/g, ' ');
            const [ filesystem, size, used, available, capacity, mount ] = cleaned.split(' ');
    
            return {
                filesystem,
                size,
                used,
                available,
                capacity,
                mount
            };
        },
        diskio: (path: string, expected: number) => {
            let size = expected;
            let used = 0;
            let available = 0;
            let capacity = 0;
            // Check if diskio file exists
            if (fs.existsSync(path)) {
                const stat = fs.statSync(path);
                available = stat.size;

                const folder = path.replace(this.RESERVED_FILE, '');
                const stdout = execSync(`du -s ${folder}`).toString();
                console.log(stdout);
                const cleaned = stdout.split('\t');
                const [ folderSize ] = cleaned;
                console.log(folderSize);
                used = Number(folderSize) - available;
                capacity = Math.round((used / size) * 100);
            }

            return {
                size, // in bytes
                used, // in bytes
                available, // in bytes
                capacity, // in percentage
            };
        }
    }

    private async reserve() {
    
    }
}