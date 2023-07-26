
import { Uri } from 'vscode';
import * as vscode from 'vscode';
import { ProcessOptions, Wasm, WasmProcess } from '@vscode/wasm-wasi';

import { NodeId, Node } from '../../shared/model';
import { DisposableLike } from '../../shared/disposable';
import { SyncRequestDispatch } from '../../shared/sync-request';

// export * from 'web-streams-polyfill';

import * as jsonStreamParser from '@streamparser/json';

async function dynamicImport(module: string): Promise<any> {
    return await import(module);
}

let streams: typeof globalThis = globalThis;;

let polyfilledStreams = false;
async function polyfillStreams() {
    if (polyfilledStreams)
        return;
    if (typeof process === 'object') {
        streams = await dynamicImport('node:stream/web');
    }
    polyfilledStreams = true;
}


let wasm: Wasm | null = null;

export enum WasmState {
    STARTING,
    READY,
    SHUTTING_DOWN,
    TERMINATING,
    EXIT_SUCCESS,
    EXIT_FAILURE,
}

interface TypedMessage {
    type: string;
}

export interface NodeReply extends Node {
    type: 'node';
    requestId: number;
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
    const inputStream = new streams.ReadableStream<Uint8Array>({
        start(streamController) {
            controller = streamController;
        }
    });
    return [chunkListener, inputStream];
}

function callbackWritableStream<T>(onData: (value: T) => any): WritableStream<T> {
    return new streams.WritableStream<T>({
        write(chunk, _controller): void {
            onData(chunk);
        }
    });
}

function jsonTransformer(): TransformStream<Uint8Array, jsonStreamParser.ParsedElementInfo.ParsedElementInfo> {
    var parser = new jsonStreamParser.JSONParser({
        separator: '', /* don't end the stream after the first toplevel object */
    });
    let controller: TransformStreamDefaultController<jsonStreamParser.ParsedElementInfo.ParsedElementInfo> = null as any;
    parser.onValue = (value => controller.enqueue(value)); // FIXME: clone?
    parser.onError = (err) => controller.error(err);
    parser.onEnd = () => controller.terminate();
    return new streams.TransformStream<Uint8Array, jsonStreamParser.ParsedElementInfo.ParsedElementInfo>({
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
        if (parsedElementInfo.stack.length > 0 || parsedElementInfo.parent !== undefined)
            return;
        onJson(parsedElementInfo.value);
    }));
    return chunkListener;
}

function stringFromChunks(onString: (value: string) => any): ByteChunkListener {
    const [chunkListener, inputStream] = makeByteChunkStream();
    const decoder = new streams.TextDecoderStream();
    inputStream.pipeThrough(decoder).pipeTo(callbackWritableStream(onString));
    return chunkListener;
}

export interface WasmStateChangeEvent {
    state: WasmState;
}

export class MSBuildLogDocument implements vscode.CustomDocument {
    _state: WasmState;
    disposables: DisposableLike[];
    readonly _requestDispatch: SyncRequestDispatch<NodeReply>;
    readonly stateChangeEmitter: vscode.EventEmitter<WasmStateChangeEvent>;
    constructor(readonly uri: Uri, readonly process: WasmProcess, readonly out: vscode.LogOutputChannel) {
        this._state = WasmState.STARTING;
        this.disposables = [];
        this.disposables.push(this._requestDispatch = new SyncRequestDispatch<NodeReply>());
        this.disposables.push(this.stateChangeEmitter = new vscode.EventEmitter<WasmStateChangeEvent>());
        this.runProcess();
        this.disposables.push(process.stdout!.onData(jsonFromChunks((value) => this.gotStdOut(value))));
        this.disposables.push(process.stderr!.onData(stringFromChunks((value) => this.gotStdErr(value))));
    }

    dispose() {
        this.process.terminate();
        this._state = WasmState.TERMINATING;
        this.disposables.forEach(d => d.dispose());
    }

    runProcess() {
        this.process.run()
            .then((exitCode) => {
                switch (exitCode) {
                    case 0:
                        this._state = WasmState.EXIT_SUCCESS;
                        break;
                    default:
                        this.out.warn(`wasm process for ${this.uri} returned with exit code ${exitCode}`)
                        this._state = WasmState.EXIT_FAILURE;
                        break;
                }
            })
            .catch((reason) => {
                this.out.warn(`wasm process for ${this.uri} threw ${reason}`);
                this._state = WasmState.EXIT_FAILURE;
            });
    }

    gotStdOut(value: unknown) {
        this.out.info(`received from wasm process: ${value}`);
        if (isTypedMessage(value)) {
            switch (value.type) {
                case 'ready':
                    this.out.info(`wasm process signalled Ready`);
                    this._state = WasmState.READY;
                    this.stateChangeEmitter.fire({ state: this.state });
                    break;
                case 'done':
                    this.out.info(`wasm process signalled Done`);
                    this._state = WasmState.SHUTTING_DOWN;
                    this.stateChangeEmitter.fire({ state: this.state });
                    break;
                case 'node':
                    const nodeReply = value as NodeReply;
                    const requestId = nodeReply.requestId;
                    this._requestDispatch.satisfy(requestId, nodeReply);
                    break;
                default:
                    this.out.warn(`received unknown message from wasm: ${value.type}`);
                    break;
            }
        }
    }
    gotStdErr(value: string) {
        this.out.error(value);
    }

    get onStateChange(): vscode.Event<WasmStateChangeEvent> { return this.stateChangeEmitter.event; }

    get state(): WasmState { return this._state; }

    isLive(): boolean {
        switch (this.state) {
            case WasmState.SHUTTING_DOWN:
            case WasmState.TERMINATING:
            case WasmState.EXIT_SUCCESS:
            case WasmState.EXIT_FAILURE:
                return false;
            default:
                return true;
        }
    }

    async postCommand(requestId: number, command: string, extraArg?: number | string): Promise<void> {
        let extra = "";
        if (extraArg !== undefined) {
            extra = `${extraArg}\n`;
        }
        await this.process.stdin?.write(`${requestId}\n${command}\n${extra}`, 'utf-8');
    }


    async requestRoot(): Promise<NodeReply> {
        const [requestId, replyPromise] = this._requestDispatch.promiseReply();
        this.out.info(`requested root id=${requestId}`);
        await this.postCommand(requestId, 'root');
        const n = await replyPromise;
        this.out.info(`god root id=${requestId} nodeId=${n.nodeId}`);
        return n;
    }

    async requestNode(nodeId: NodeId): Promise<NodeReply> {
        const [requestId, replyPromise] = this._requestDispatch.promiseReply();
        this.out.info(`requested node id=${requestId} nodeId=${nodeId}`);
        await this.postCommand(requestId, 'node', nodeId);
        const n = await replyPromise;
        this.out.info(`got node requestId=${requestId} nodeId=${n.nodeId}`);
        return n;
    }

}

export async function openMSBuildLogDocument(context: vscode.ExtensionContext, uri: Uri, out: vscode.LogOutputChannel): Promise<MSBuildLogDocument> {
    out.info(`opening msbuild log ${uri}`);
    if (!wasm) {
        wasm = await Wasm.load();
    }
    if (!polyfilledStreams)
        await polyfillStreams();
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

