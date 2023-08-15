import * as vscode from 'vscode';

import { SubprocessState, SubprocessStateChangeEvent } from '../common/subprocess/subprocess-state';
import { Wasm, WasmProcess } from '@vscode/wasm-wasi';
import { DisposableLike } from '../../shared/disposable';


export let wasm: Wasm | null = null;

export async function loadWasm(): Promise<Wasm> {
    if (!wasm) {
        wasm = await Wasm.load();
    }
    return wasm;
}



export class WasmEngine implements DisposableLike {
    disposables: DisposableLike[];
    _state: SubprocessState;
    readonly stateChangeEmitter: vscode.EventEmitter<SubprocessStateChangeEvent>;
    constructor(readonly process: WasmProcess, readonly logOutput?: vscode.LogOutputChannel) {
        this._state = SubprocessState.LOADED;
        this.disposables = [];
        this.disposables.push(this.stateChangeEmitter = new vscode.EventEmitter<SubprocessStateChangeEvent>());

    }

    runProcess() {
        this._state = SubprocessState.STARTED;
        this.process.run()
            .then((exitCode) => {
                switch (exitCode) {
                    case 0:
                        this._state = SubprocessState.EXIT_SUCCESS;
                        break;
                    default:
                        this.logOutput?.warn(`wasm process returned with exit code ${exitCode}`)
                        this._state = SubprocessState.EXIT_FAILURE;
                        break;
                }
            })
            .catch((reason) => {
                this.logOutput?.warn(`wasm process threw ${reason}`);
                this._state = SubprocessState.EXIT_FAILURE;
            });
        this.fireStateChange();
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
        this.process.terminate();
        this.disposables.forEach(d => d.dispose());
    }
}