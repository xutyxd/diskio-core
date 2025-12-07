
export async function withoutError(fn: () => Promise<unknown> | unknown): Promise<void> {
    try {
        await fn();
    } catch (e) { }
}