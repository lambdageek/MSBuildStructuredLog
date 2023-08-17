import { Uri } from 'vscode'
import * as vscode from 'vscode';
import type * as cp from 'child_process';

import { AbstractMSBuildLogDocument, MSBuildLogDocumentFactory } from "../common/document";

import { SubprocessState, SubprocessStateChangeEvent } from '../common/subprocess/subprocess-state';


import { polyfillStreams, jsonFromChunks, stringFromChunks } from '../common/streaming';

import type { CodeToDotnetCommand } from '../common/code-to-dotnet';

import { DisposableLike } from '../../shared/disposable';

async function dynamicImport(module: string): Promise<any> {
    return require(module);
}

async function nodeChildProcess(): Promise<typeof cp> {
    return await dynamicImport('node:child_process');
}

export class ChildProcessEngine implements DisposableLike {
    disposables: DisposableLike[];
    _state: SubprocessState;
    readonly stateChangeEmitter: vscode.EventEmitter<SubprocessStateChangeEvent>;
    constructor(readonly childProcess: cp.ChildProcessWithoutNullStreams, readonly logOutput?: vscode.LogOutputChannel) {
        this._state = SubprocessState.STARTED;
        this.disposables = [];
        this.disposables.push(this.stateChangeEmitter = new vscode.EventEmitter<SubprocessStateChangeEvent>());
        childProcess.on('exit', (code, signal) => {
            this.logOutput?.appendLine(`engine process exited with code ${code} and signal ${signal}`);
            if (code === 0) {
                this._state = SubprocessState.EXIT_SUCCESS;
            } else {
                this._state = SubprocessState.EXIT_FAILURE;
            }
            this.fireStateChange();
        });
    }

    applicationChangedState(newState: SubprocessState.READY | SubprocessState.SHUTTING_DOWN) {
        this._state = newState;
        this.fireStateChange();
    }

    fireStateChange() {
        this.stateChangeEmitter.fire({ state: this._state });
    }
    get onStateChange(): vscode.Event<SubprocessStateChangeEvent> { return this.stateChangeEmitter.event; }

    get state(): SubprocessState { return this._state; }

    dispose() {
        this._state = SubprocessState.TERMINATING;
        this.childProcess.kill();
        this.disposables.forEach(d => d.dispose());
    }
}

export class MSBuildLogDocumentDesktop extends AbstractMSBuildLogDocument {
    constructor(uri: Uri, readonly _engine: ChildProcessEngine, out: vscode.LogOutputChannel) {
        super(uri, out);
        this.disposables.push(this._engine);
        this._engine.childProcess.stdout.on('data', jsonFromChunks((value) => this.gotStdOut(value))); //('data', jsonFromChunks((value) => this.gotStdOut(value))));
        this._engine.childProcess.stderr.on('data', stringFromChunks((value) => this.gotStdErr(value)));
    }

    get state(): SubprocessState { return this._engine.state; }

    subprocessChangedApplicationState(state: SubprocessState.READY | SubprocessState.SHUTTING_DOWN) {
        this._engine.applicationChangedState(state);
    }

    get onStateChange(): vscode.Event<SubprocessStateChangeEvent> { return this._engine.onStateChange; }

    async postCommand(c: CodeToDotnetCommand): Promise<void> {
        const payload = this.formatCommand(c);
        await this._engine.childProcess.stdin.write(payload, 'utf-8');
    }

}


export function openMSBuildLogDocumentDesktopFactory(dotnetPath: string): MSBuildLogDocumentFactory {
    async function openMSBuildLogDocumentDesktop(context: vscode.ExtensionContext, uri: Uri, out: vscode.LogOutputChannel): Promise<AbstractMSBuildLogDocument> {
        await polyfillStreams();
        const cp = await nodeChildProcess();
        const enginePath = context.asAbsolutePath('dist/desktop/engine/StructuredLogViewer.Vscode.Engine.dll');
        out.info(`opening msbuild log ${uri} using ${dotnetPath}`);
        const documentPath = uri.fsPath;
        const proc = cp.spawn(dotnetPath, [enginePath, 'interactive', documentPath], { stdio: 'pipe' });
        return new MSBuildLogDocumentDesktop(uri, new ChildProcessEngine(proc, out), out);
    }
    return openMSBuildLogDocumentDesktop;

}