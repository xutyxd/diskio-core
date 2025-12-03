import { accessSync, constants } from 'node:fs';
import { access } from 'node:fs/promises';

export async function exists(path: string) {
    try {
        await access(path, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

export function existsSync(path: string) {
    try {
        accessSync(path, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}