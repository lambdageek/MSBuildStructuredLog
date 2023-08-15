import { streams } from './polyfill-streams';
import { ByteChunkListener } from './types';
import { makeByteChunkStream } from './byte-chunk-stream';
import { callbackWritableStream } from './callback-writable-stream';

export function stringFromChunks(onString: (value: string) => any): ByteChunkListener {
    const [chunkListener, inputStream] = makeByteChunkStream();
    const decoder = new streams.TextDecoderStream();
    inputStream.pipeThrough(decoder).pipeTo(callbackWritableStream(onString));
    return chunkListener;
}

