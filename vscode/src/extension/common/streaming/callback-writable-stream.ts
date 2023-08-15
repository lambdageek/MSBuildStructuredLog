import { streams } from './polyfill-streams';

export function callbackWritableStream<T>(onData: (value: T) => any): WritableStream<T> {
    return new streams.WritableStream<T>({
        write(chunk, _controller): void {
            onData(chunk);
        }
    });
}

