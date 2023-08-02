
import { Uri } from 'vscode';
import * as vscode from 'vscode';

import { NodeId, Node } from '../../shared/model';
import { DisposableLike } from '../../shared/disposable';
import { SyncRequestDispatch } from '../../shared/sync-request';

import { polyfillStreams, jsonFromChunks, stringFromChunks } from './streaming';
import { loadWasm, WasmEngine, WasmState, WasmStateChangeEvent } from './wasm/engine';
import * as wasiWasm from '@vscode/wasm-wasi';

interface WasmToCodeMessage {
    type: string;
}

interface WasmToCodeNodeReply extends WasmToCodeMessage {
    type: 'node';
    requestId: number;
    node: Node;
}

interface WasmToCodeManyNodesReply extends WasmToCodeMessage {
    type: 'manyNodes';
    requestId: number;
    nodes: Node[];
}

type WasmToCodeReply =
    WasmToCodeNodeReply
    | WasmToCodeManyNodesReply
    ;

function isWasmToCodeMessage(x: unknown): x is WasmToCodeMessage {
    return typeof (x) === 'object' && (x as WasmToCodeMessage).type !== undefined;
}

interface CodeToWasmCommandBase {
    requestId: number;
    command: string;
}

interface CodeToWasmRootCommand extends CodeToWasmCommandBase {
    command: 'root';
}

interface CodeToWasmNodeCommand extends CodeToWasmCommandBase {
    command: 'node';
    nodeId: NodeId;
}

interface CodeToWasmManyNodesCommand extends CodeToWasmCommandBase {
    command: 'manyNodes';
    nodeId: NodeId;
    count: number;
}

type CodeToWasmCommand =
    CodeToWasmRootCommand
    | CodeToWasmNodeCommand
    | CodeToWasmManyNodesCommand
    ;

export class MSBuildLogDocument implements vscode.CustomDocument {
    disposables: DisposableLike[];
    readonly _requestDispatch: SyncRequestDispatch<WasmToCodeReply>;
    constructor(readonly _pipeIn: wasiWasm.Writable, readonly uri: Uri, readonly _engine: WasmEngine, readonly out: vscode.LogOutputChannel) {
        this.disposables = [];
        this.disposables.push(this._engine);
        this.disposables.push(this._requestDispatch = new SyncRequestDispatch<WasmToCodeReply>());
        this._engine.runProcess();
        this.disposables.push(this._engine.process.stdout!.onData(jsonFromChunks((value) => this.gotStdOut(value))));
        this.disposables.push(this._engine.process.stderr!.onData(stringFromChunks((value) => this.gotStdErr(value))));
    }

    dispose() {
        this.disposables.forEach(d => d.dispose());
        this.disposables.length = 0;
    }

    get state(): WasmState { return this._engine.state; }
    isLive(): boolean { return this._engine.isLive(); }

    gotStdOut(value: unknown) {
        this.out.info(`received from wasm process: ${JSON.stringify(value)}`);
        if (isWasmToCodeMessage(value)) {
            switch (value.type) {
                case 'ready':
                    this.out.info(`wasm process signalled Ready`);
                    this._engine.applicationChangedState(WasmState.READY);
                    break;
                case 'done':
                    this.out.info(`wasm process signalled Done`);
                    this._engine.applicationChangedState(WasmState.SHUTTING_DOWN);
                    break;
                case 'node':
                case 'manyNodes':
                    const nodeReply = value as WasmToCodeReply;
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

    get onStateChange(): vscode.Event<WasmStateChangeEvent> { return this._engine.onStateChange; }

    async postCommand(c: CodeToWasmCommand): Promise<void> {
        const json = JSON.stringify(c);
        const encoder = new TextEncoder();
        const jsonBytes = encoder.encode(json);
        const len = jsonBytes.byteLength;
        this.out?.info(`sending ${len} followed by <<${json}>>`);
        const lenBuf = new ArrayBuffer(4);
        const int32View = new Int32Array(lenBuf);
        int32View[0] = len;
        const int8View = new Uint8Array(lenBuf);
        int8View[0]++;
        int8View[1]++;
        int8View[2]++;
        int8View[3]++;
        await this._pipeIn.write(int8View);
        await this._pipeIn.write(jsonBytes);
        await this._pipeIn.write('\n', 'utf-8');
    }

    async requestRoot(): Promise<WasmToCodeNodeReply> {
        const [requestId, replyPromise] = this._requestDispatch.promiseReply<WasmToCodeNodeReply>();
        this.out.info(`requested root id=${requestId}`);
        await this.postCommand({ requestId, command: 'root' });
        const n = await replyPromise;
        if (n.type != 'node')
            throw Error(`expected reply type 'node', but got ${n.type}`);
        this.out.info(`god root id=${requestId} nodeId=${n.node.nodeId}`);
        return n;
    }

    async requestNode(nodeId: NodeId): Promise<WasmToCodeNodeReply> {
        const [requestId, replyPromise] = this._requestDispatch.promiseReply<WasmToCodeNodeReply>();
        this.out.info(`requested node id=${requestId} nodeId=${nodeId}`);
        await this.postCommand({ requestId, command: 'node', nodeId });
        const n = await replyPromise;
        if (n.type != 'node')
            throw Error(`expected reply type 'node', but got ${n.type}`);
        this.out.info(`got node requestId=${requestId} nodeId=${n.node.nodeId}`);
        return n;
    }

    async requestManyNodes(nodeId: NodeId, count: number): Promise<WasmToCodeManyNodesReply> {
        const [requestId, replyPromise] = this._requestDispatch.promiseReply<WasmToCodeManyNodesReply>();
        this.out.info(`requested id=${requestId}  ${count} nodes starting from nodeId=${nodeId}`);
        await this.postCommand({ requestId, command: 'manyNodes', nodeId, count });
        const n = await replyPromise;
        if (n.type != 'manyNodes')
            throw Error(`expected reply type 'node', but got ${n.type}`);
        this.out.info(`got many nodes requestId=${requestId} nodes.length=${n.nodes.length}`);
        return n;
    }

}

export async function openMSBuildLogDocument(context: vscode.ExtensionContext, uri: Uri, out: vscode.LogOutputChannel): Promise<MSBuildLogDocument> {
    out.info(`opening msbuild log ${uri}`);
    const wasm = await loadWasm();
    await polyfillStreams();
    //const memFS = await wasm.createMemoryFileSystem();
    const rootFileSystem = await wasm.createRootFileSystem([
        { kind: 'workspaceFolder' },
        //{
        //    kind: 'memoryFileSystem',
        //    mountPoint: '/pipe',
        //    fileSystem: memFS
        //},
    ]);
    //const pipeIn = memFS.createWritable('./input', 'utf-8');
    const pipeIn = wasm.createWritable();
    const pipeOut = wasm.createReadable();
    const pipeErr = wasm.createReadable();
    const options: wasiWasm.ProcessOptions = {
        args: ["interactive", uri],
        stdio: {
            in: { 'kind': 'pipeIn', pipe: pipeIn },
            out: { 'kind': 'pipeOut', pipe: pipeOut },
            err: { 'kind': 'pipeOut', pipe: pipeErr },
        },
        rootFileSystem,
    };
    const path = Uri.joinPath(context.extensionUri, 'dist', 'StructuredLogViewer.Wasi.Engine.wasm');
    const moduleBytes = await vscode.workspace.fs.readFile(path);
    const module = await WebAssembly.compile(moduleBytes);
    out.info('creating process')
    const process = await wasm.createProcess('StructuredLogViewer.Wasi.Engine', module, options);
    const engine = new WasmEngine(process, out);
    out.info('process created')
    return new MSBuildLogDocument(pipeIn, uri, engine, out);
}

