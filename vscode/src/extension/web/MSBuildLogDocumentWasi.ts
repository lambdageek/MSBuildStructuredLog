
import { Uri } from 'vscode';
import * as vscode from 'vscode';

import {
    WasmToCodeReply, WasmToCodeEvent, WasmToCodeFullTextReply, WasmToCodeSearchResultsReply,
    isWasmToCodeMessage
} from './wasm-to-code';
import { CodeToWasmCommand } from './code-to-wasm';

import { polyfillStreams, jsonFromChunks, stringFromChunks } from './streaming';
import { SubprocessState, SubprocessStateChangeEvent } from './subprocess/subprocess-state';
import { loadWasm, WasmEngine } from './wasm/engine';
import * as wasiWasm from '@vscode/wasm-wasi';
import { assertNever } from '../../shared/assert-never';

import { AbstractMSBuildLogDocument } from './document';

export class MSBuildLogDocumentWasi extends AbstractMSBuildLogDocument {
    constructor(uri: Uri, readonly _engine: WasmEngine, out: vscode.LogOutputChannel) {
        super(uri, out);
        this.disposables.push(this._engine);
        this._engine.runProcess();
        this.disposables.push(this._engine.process.stdout!.onData(jsonFromChunks((value) => this.gotStdOut(value))));
        this.disposables.push(this._engine.process.stderr!.onData(stringFromChunks((value) => this.gotStdErr(value))));
    }

    get state(): SubprocessState { return this._engine.state; }
    isLive(): boolean { return this._engine.isLive(); }

    gotStdOut(v: unknown) {
        this.out.info(`received from wasm process: ${v}`);
        if (isWasmToCodeMessage(v)) {
            const value = v as WasmToCodeReply | WasmToCodeEvent;
            switch (value.type) {
                case 'ready':
                    this.out.info(`wasm process signalled Ready`);
                    this._engine.applicationChangedState(SubprocessState.READY);
                    break;
                case 'done':
                    this.out.info(`wasm process signalled Done`);
                    this._engine.applicationChangedState(SubprocessState.SHUTTING_DOWN);
                    break;
                case 'node':
                case 'manyNodes':
                    const nodeReply = value as WasmToCodeReply;
                    const requestId = nodeReply.requestId;
                    this._requestDispatch.satisfy(requestId, nodeReply);
                    break;
                case 'fullText':
                    const fullTextReply = value as WasmToCodeFullTextReply;
                    const fullTextRequestId = fullTextReply.requestId;
                    this._requestDispatch.satisfy(fullTextRequestId, fullTextReply);
                    break;
                case 'searchResults':
                    const searchResultsReply = value as WasmToCodeSearchResultsReply;
                    const searchResultsRequestId = searchResultsReply.requestId;
                    this._requestDispatch.satisfy(searchResultsRequestId, searchResultsReply);
                    break;
                default:
                    assertNever(value);
                    this.out.warn(`received unknown message from wasm: ${(<any>value).type}`);
                    break;
            }
        }
    }
    gotStdErr(value: string) {
        this.out.error(value);
    }

    get onStateChange(): vscode.Event<SubprocessStateChangeEvent> { return this._engine.onStateChange; }

    async postCommand(c: CodeToWasmCommand): Promise<void> {
        const payload = this.formatCommand(c);
        await this._engine.process.stdin?.write(payload, 'utf-8');
    }

}

export async function openMSBuildLogDocument(context: vscode.ExtensionContext, uri: Uri, out: vscode.LogOutputChannel): Promise<AbstractMSBuildLogDocument> {
    out.info(`opening msbuild log ${uri}`);
    const wasm = await loadWasm();
    await polyfillStreams();
    const rootFileSystem = await wasm.createRootFileSystem([
        { kind: 'workspaceFolder' }
    ]);
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
        rootFileSystem
    };
    const path = Uri.joinPath(context.extensionUri, 'dist', 'StructuredLogViewer.Vscode.Engine.wasm');
    const moduleBytes = await vscode.workspace.fs.readFile(path);
    const module = await WebAssembly.compile(moduleBytes);
    out.info('creating process')
    const process = await wasm.createProcess('StructuredLogViewer.Vscode.Engine', module, options);
    const engine = new WasmEngine(process, out);
    out.info('process created')
    return new MSBuildLogDocumentWasi(uri, engine, out);
}

