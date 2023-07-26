import { ParsedElementInfo, JsonTypes, JSONParser } from '@streamparser/json';
import { streams } from './polyfill-streams';
import { ByteChunkListener } from './types';
import { makeByteChunkStream } from './byte-chunk-stream';
import { callbackWritableStream } from './callback-writable-stream';

function jsonTransformer(): TransformStream<Uint8Array, ParsedElementInfo.ParsedElementInfo> {
    var parser = new JSONParser({
        separator: '', /* don't end the stream after the first toplevel object */
    });
    let controller: TransformStreamDefaultController<ParsedElementInfo.ParsedElementInfo> = null as any;
    parser.onValue = (value => controller.enqueue(value)); // FIXME: clone?
    parser.onError = (err) => controller.error(err);
    parser.onEnd = () => controller.terminate();
    return new streams.TransformStream<Uint8Array, ParsedElementInfo.ParsedElementInfo>({
        start(c): void {
            controller = c;
        },
        transform(chunk): void {
            parser.write(chunk);
        },
        flush() {
            parser.end();
        }
    });
}

export function jsonFromChunks(onJson: (value: JsonTypes.JsonPrimitive | JsonTypes.JsonStruct) => any): ByteChunkListener {
    const [chunkListener, inputStream] = makeByteChunkStream();
    inputStream.pipeThrough(jsonTransformer()).pipeTo(callbackWritableStream((parsedElementInfo) => {
        if (parsedElementInfo.stack.length > 0 || parsedElementInfo.parent !== undefined)
            return;
        onJson(parsedElementInfo.value);
    }));
    return chunkListener;
}
