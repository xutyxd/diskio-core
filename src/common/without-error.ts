
export async function withoutError<T>(fn: () => Promise<T | undefined> | T | undefined): Promise<T | undefined> {
    try {
        await fn();
    } catch (e) {
        return undefined;
    }
}