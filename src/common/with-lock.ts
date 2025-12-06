import { mkdir, rmdir, readFile, writeFile } from 'fs/promises';
import { setTimeout } from 'timers/promises';
import { randomUUID } from 'crypto';
import path from 'path';

const LOCK_DIR = './diskio.lock';
const LOCK_OWNER = path.join(LOCK_DIR, 'owner');

async function checkProcessAlive(pid: number) {
    try {
        // Check process is alive using signal 0
        process.kill(pid, 0);
        return true;
    } catch {
        return false; // ESRCH = dead
    }
}

export async function withLock<T>(fn: () => Promise<T>): Promise<T> {
    const myTicket = `${process.pid}-${randomUUID()}`;
    const start = Date.now();
    let attempt = 0;

    // while (true) {
    //     try {
    //         // Create folder of lock
    //         await mkdir(LOCK_DIR, { recursive: false });
    //         // Fill with ticket
    //         await writeFile(LOCK_OWNER, myTicket, { flag: 'wx' });
    //         // We own it, continue with operation
    //         break;
    //     } catch (e) {
    //         // Get node error type
    //         const error = e as NodeJS.ErrnoException;
    //         // Check type of error
    //         if (error.code !== 'EEXIST') {
    //             throw e;
    //         }
    //         // Stale lock detection
    //         try {
    //             // Read current ticket
    //             const ticket = await readFile(LOCK_OWNER, 'utf8').catch(() => '');
    //             // Get the old process id
    //             const oldPid = ticket ? parseInt(ticket.split('-')[0]) : NaN;
    //             // Check exists and is alive
    //             if (oldPid && !(await checkProcessAlive(oldPid))) {
    //                 // Owner dead -> try to steal the lock
    //                 await rmdir(LOCK_DIR, { recursive: true });
    //                 // Retry again
    //                 continue;
    //             }
    //         } catch { }
    //         // Exponential backoff: 5 -> 10 -> 20 -> 40 ms
    //         const delay = Math.min(5 * 2 ** Math.min(attempt++, 5), 40);
    //         await setTimeout(delay);
    //     }
    // }
    const acquired = Date.now();
    // console.log(`Lock waited: ${acquired - start} ms (attempts: ${attempt})`);
    try {
        return await fn();
    } finally {
        // // Only remove if we still own it (race with steal is impossible because we just released)
        // await rmdir(LOCK_DIR, { recursive: true }).catch((error) => { console.warn('Error freeing: ', error)});
        // console.log(`Lock held: ${Date.now() - acquired} ms`);
    }
}