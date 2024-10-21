
import { DiskIO } from './diskio.class';

describe('DiskIO class', () => {
    describe('DiskIO instance', () => {
        it('should throw an error if the path does not exist', () => {
            expect(() => new DiskIO('path/to/non-existent/directory', 100)).toThrow('The path does not exist');
        });

        it('should throw an error if the path is not a directory', () => {
            expect(() => new DiskIO('./mocks/video-a.mp4', 100)).toThrow('The path is not a directory');
        });

        it('should instance a DiskIO class', () => {
            const diskio = new DiskIO('./mocks', 10 * 1024);
            expect(diskio).toBeInstanceOf(DiskIO);
        });
    });
});