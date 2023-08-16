async function dynamicImport(module: string): Promise<any> {
    return require(module);
}

export let streams: typeof globalThis = globalThis;

let polyfilledStreams = false;
export async function polyfillStreams(): Promise<void> {
    if (polyfilledStreams)
        return;
    if (typeof process === 'object') {
        streams = await dynamicImport('node:stream/web');
    }
    polyfilledStreams = true;
}
