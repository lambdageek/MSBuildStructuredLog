
import { Uri } from 'vscode';
import * as vscode from 'vscode';
import { ProcessOptions, Wasm, WasmProcess } from '@vscode/wasm-wasi';

import * as jsonStreamParser from '@streamparser/json-whatwg';
import { ReadableStreamController } from 'stream/web';

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

function jsonFromChunks(onJson: (value: jsonStreamParser.JsonTypes.JsonPrimitive | jsonStreamParser.JsonTypes.JsonStruct) => any): (e: Uint8Array) => any {
    let controller: ReadableStreamController<Uint8Array> = undefined as any;
    function chunkListener(chunk: Uint8Array): void {
        controller.enqueue(chunk);
    }
    const inputStream = new ReadableStream<Uint8Array>({
        start(streamController) {
            controller = streamController;
        }
    });
    const jsonParser = new jsonStreamParser.JSONParser();
    const reader = inputStream.pipeThrough(jsonParser).getReader();
    function consumer({ done, value }: ReadableStreamReadResult<jsonStreamParser.ParsedElementInfo.ParsedElementInfo>) {
        if (done)
            return;
        onJson(value.value);
        reader.read().then(consumer);
    }
    reader.read().then(consumer);
    return chunkListener;
}

export class MSBuildLogDocument implements vscode.CustomDocument {
    state: WasmState;
    disposables: DisposableLike[];
    constructor(readonly uri: Uri, readonly process: WasmProcess, readonly out: vscode.LogOutputChannel) {
        this.state = WasmState.RUNNING;
        this.disposables = [];
        this.runProcess();
        // FIXME
        false && this.disposables.push(process.stdout!.onData(jsonFromChunks((value) => this.onStdOut(value))));
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
        this.out.debug(`received from wasm process: ${value}`);
        if (isTypedMessage(value)) {
            switch (value.type) {
                case 'ready':
                    this.out.info(`wasm process signalled Ready`);
                    break;
                case 'done':
                    this.out.info(`wasm process signalled Done`);
                    break;
            }
        }
    }
}



export async function openMSBuildLogDocument(context: vscode.ExtensionContext, uri: Uri, out: vscode.LogOutputChannel): Promise<MSBuildLogDocument> {
    out.debug(`opening msbuild log ${uri}`);
    if (!wasm) {
        wasm = await Wasm.load();
    }
    const pty = wasm.createPseudoterminal();
    try {
        const rootFileSystem = await wasm.createRootFileSystem([
            { kind: 'workspaceFolder' }
        ]);
        const options: ProcessOptions = {
            args: ["interactive", uri],
            stdio: pty.stdio,
            rootFileSystem
        };
        const path = Uri.joinPath(context.extensionUri, 'dist', 'StructuredLogViewer.Wasi.Engine.wasm');
        const wasiWasm = await vscode.workspace.fs.readFile(path);
        const module = await WebAssembly.compile(wasiWasm);
        const process = await wasm.createProcess('dotnet-wasi-hello', module, options);
        return new MSBuildLogDocument(uri, process, out);
    } catch (error) {
        out.error("" + error);
        return null as any; // FIXME: is there a nicer way to abort CustomEditor openCustomDocument
    }
}

