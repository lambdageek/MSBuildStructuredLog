
import { Uri } from 'vscode';
import * as vscode from 'vscode';
import { ProcessOptions, Wasm, WasmProcess } from '@vscode/wasm-wasi';

// export * from 'web-streams-polyfill';

import * as jsonStreamParser from '@streamparser/json';

// async function dynamicImport(module: string): Promise<any> {
//     return await import(module);
// }

// let polyfilledStreams = false;
// async function polyfillStreams() {
//     if (polyfilledStreams)
//         return;
//     if (typeof process === 'object') {
//         const web = await dynamicImport('node:stream/web');
//         if (typeof (globalThis.TextDecoderStream) === 'undefined') {
//             Object.assign(globalThis, web);
//         }
//     }
//     polyfilledStreams = true;
// }


let wasm: Wasm | null = null;

enum WasmState {
    RUNNING,
    TERMINATED,
    EXIT_SUCCESS,
    EXIT_FAILURE,
}

interface DisposableLike {
    dispose(): any;
}

interface TypedMessage {
    type: string;
}

function isTypedMessage(x: unknown): x is TypedMessage {
    return typeof (x) === 'object' && (x as TypedMessage).type !== undefined;
}

type ChunkListener<T> = (chunk: T) => any;
type ChunkListenerAndStream<T> = [ChunkListener<T>, ReadableStream<T>];
type ByteChunkListener = ChunkListener<Uint8Array>;


function makeByteChunkStream(): ChunkListenerAndStream<Uint8Array> {
    let controller: ReadableStreamController<Uint8Array> = undefined as any;
    function chunkListener(chunk: Uint8Array): void {
        controller.enqueue(chunk);
    }
    const inputStream = new ReadableStream<Uint8Array>({
        start(streamController) {
            controller = streamController;
        }
    });
    return [chunkListener, inputStream];
}

function callbackWritableStream<T>(onData: (value: T) => any): WritableStream<T> {
    return new WritableStream<T>({
        write(chunk, _controller): void {
            onData(chunk);
        }
    });
}

function jsonTransformer(): TransformStream<Uint8Array, jsonStreamParser.ParsedElementInfo.ParsedElementInfo> {
    var parser = new jsonStreamParser.JSONParser();
    let controller: TransformStreamDefaultController<jsonStreamParser.ParsedElementInfo.ParsedElementInfo> = null as any;
    parser.onValue = (value => controller.enqueue(value)); // FIXME: clone?
    parser.onError = (err) => controller.error(err);
    parser.onEnd = () => controller.terminate();
    return new TransformStream<Uint8Array, jsonStreamParser.ParsedElementInfo.ParsedElementInfo>({
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

function jsonFromChunks(onJson: (value: jsonStreamParser.JsonTypes.JsonPrimitive | jsonStreamParser.JsonTypes.JsonStruct) => any): ByteChunkListener {
    const [chunkListener, inputStream] = makeByteChunkStream();
    inputStream.pipeThrough(jsonTransformer()).pipeTo(callbackWritableStream((parsedElementInfo) => {
        if (parsedElementInfo.stack.length > 0)
            return;
        onJson(parsedElementInfo.value);
    }));
    return chunkListener;
}

function stringFromChunks(onString: (value: string) => any): ByteChunkListener {
    const [chunkListener, inputStream] = makeByteChunkStream();
    const decoder = new TextDecoderStream();
    inputStream.pipeThrough(decoder).pipeTo(callbackWritableStream(onString));
    return chunkListener;
}

export class MSBuildLogDocument implements vscode.CustomDocument {
    state: WasmState;
    disposables: DisposableLike[];
    constructor(readonly uri: Uri, readonly process: WasmProcess, readonly out: vscode.LogOutputChannel) {
        this.state = WasmState.RUNNING;
        this.disposables = [];
        this.runProcess();
        this.disposables.push(process.stdout!.onData(jsonFromChunks((value) => this.onStdOut(value))));
        this.disposables.push(process.stderr!.onData(stringFromChunks((value) => this.onStdErr(value))));
    }

    dispose() {
        this.process.terminate();
        this.state = WasmState.TERMINATED;
        this.disposables.forEach(d => d.dispose());
    }

    runProcess() {
        this.process.run()
            .then((exitCode) => {
                switch (exitCode) {
                    case 0:
                        this.state = WasmState.EXIT_SUCCESS;
                        break;
                    default:
                        this.out.warn(`wasm process for ${this.uri} returned with exit code ${exitCode}`)
                        this.state = WasmState.EXIT_FAILURE;
                        break;
                }
            })
            .catch((reason) => {
                this.out.warn(`wasm process for ${this.uri} threw ${reason}`);
                this.state = WasmState.EXIT_FAILURE;
            });
    }

    onStdOut(value: unknown) {
        this.out.info(`received from wasm process: ${value}`);
        if (isTypedMessage(value)) {
            switch (value.type) {
                case 'ready':
                    this.out.info(`wasm process signalled Ready`);
                    break;
                case 'done':
                    this.out.info(`wasm process signalled Done`);
                    break;
                default:
                    this.out.warn(`received unknown message from wasm: ${value.type}`);
                    break;
            }
        }
    }
    onStdErr(value: string) {
        this.out.error(value);
    }
}

export async function openMSBuildLogDocument(context: vscode.ExtensionContext, uri: Uri, out: vscode.LogOutputChannel): Promise<MSBuildLogDocument> {
    out.info(`opening msbuild log ${uri}`);
    if (!wasm) {
        wasm = await Wasm.load();
    }
    //if (!polyfilledStreams)
    //    await polyfillStreams();
    //try {
    const rootFileSystem = await wasm.createRootFileSystem([
        { kind: 'workspaceFolder' }
    ]);
    const pipeIn = wasm.createWritable();
    const pipeOut = wasm.createReadable();
    const pipeErr = wasm.createReadable();
    const options: ProcessOptions = {
        args: ["interactive", uri],
        stdio: {
            in: { 'kind': 'pipeIn', pipe: pipeIn },
            out: { 'kind': 'pipeOut', pipe: pipeOut },
            err: { 'kind': 'pipeOut', pipe: pipeErr },
        },
        rootFileSystem
    };
    const path = Uri.joinPath(context.extensionUri, 'dist', 'StructuredLogViewer.Wasi.Engine.wasm');
    const wasiWasm = await vscode.workspace.fs.readFile(path);
    const module = await WebAssembly.compile(wasiWasm);
    out.info('creating process')
    const process = await wasm.createProcess('StructuredLogViewer.Wasi.Engine', module, options);
    out.info('process created')
    return new MSBuildLogDocument(uri, process, out);
    //} catch (error) {
    //    out.error("" + error);
    //    return null as any; // FIXME: is there a nicer way to abort CustomEditor openCustomDocument
    //}
}

