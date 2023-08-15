
import { Uri } from 'vscode';
import * as vscode from 'vscode';

import { CodeToDotnetCommand } from './code-to-dotnet';

import { polyfillStreams, jsonFromChunks, stringFromChunks } from './streaming';
import { SubprocessState, SubprocessStateChangeEvent } from './subprocess/subprocess-state';
import { loadWasm, WasmEngine } from './wasm/engine';
import * as wasiWasm from '@vscode/wasm-wasi';

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

    subprocessChangedApplicationState(state: SubprocessState.READY | SubprocessState.SHUTTING_DOWN) {
        this._engine.applicationChangedState(state);
    }

    get onStateChange(): vscode.Event<SubprocessStateChangeEvent> { return this._engine.onStateChange; }

    async postCommand(c: CodeToDotnetCommand): Promise<void> {
        const payload = this.formatCommand(c);
        await this._engine.process.stdin?.write(payload, 'utf-8');
    }

}

export async function openMSBuildLogDocumentWasi(context: vscode.ExtensionContext, uri: Uri, out: vscode.LogOutputChannel): Promise<AbstractMSBuildLogDocument> {
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

