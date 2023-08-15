import { streams } from "./polyfill-streams";
import { ChunkListenerAndStream } from "./types";

export function makeByteChunkStream(): ChunkListenerAndStream<Uint8Array> {
    let controller: ReadableStreamController<Uint8Array> = undefined as any;
    function chunkListener(chunk: Uint8Array): void {
        controller.enqueue(chunk);
    }
    const inputStream = new streams.ReadableStream<Uint8Array>({
        start(streamController) {
            controller = streamController;
        }
    });
    return [chunkListener, inputStream];
}