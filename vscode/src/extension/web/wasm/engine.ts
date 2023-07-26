import * as vscode from 'vscode';

import { Wasm, WasmProcess } from '@vscode/wasm-wasi';
import { DisposableLike } from '../../../shared/disposable';


export let wasm: Wasm | null = null;

export async function loadWasm(): Promise<Wasm> {
    if (!wasm) {
        wasm = await Wasm.load();
    }
    return wasm;
}

/* application logic is responsible for changing state to READY and SHUTTING_DOWN
 * based on interactinos with the app.
 */
export enum WasmState {
    LOADED,
    STARTED,
    READY,
    SHUTTING_DOWN,
    TERMINATING,
    EXIT_SUCCESS,
    EXIT_FAILURE,
}

export interface WasmStateChangeEvent {
    state: WasmState;
}


export class WasmEngine implements DisposableLike {
    disposables: DisposableLike[];
    _state: WasmState;
    readonly stateChangeEmitter: vscode.EventEmitter<WasmStateChangeEvent>;
    constructor(readonly process: WasmProcess, readonly logOutput?: vscode.LogOutputChannel) {
        this._state = WasmState.LOADED;
        this.disposables = [];
        this.disposables.push(this.stateChangeEmitter = new vscode.EventEmitter<WasmStateChangeEvent>());

    }

    runProcess() {
        this._state = WasmState.STARTED;
        this.process.run()
            .then((exitCode) => {
                switch (exitCode) {
                    case 0:
                        this._state = WasmState.EXIT_SUCCESS;
                        break;
                    default:
                        this.logOutput?.warn(`wasm process returned with exit code ${exitCode}`)
                        this._state = WasmState.EXIT_FAILURE;
                        break;
                }
            })
            .catch((reason) => {
                this.logOutput?.warn(`wasm process threw ${reason}`);
                this._state = WasmState.EXIT_FAILURE;
            });
        this.fireStateChange();
    }

    applicationChangedState(newState: WasmState.READY | WasmState.SHUTTING_DOWN) {
        this._state = newState;
        this.fireStateChange();
    }

    fireStateChange() {
        this.stateChangeEmitter.fire({ state: this._state });
    }
    get onStateChange(): vscode.Event<WasmStateChangeEvent> { return this.stateChangeEmitter.event; }

    get state(): WasmState { return this._state; }

    isLive(): boolean {
        switch (this._state) {
            case WasmState.SHUTTING_DOWN:
            case WasmState.TERMINATING:
            case WasmState.EXIT_SUCCESS:
            case WasmState.EXIT_FAILURE:
                return false;
            default:
                return true;
        }
    }

    dispose() {
        this._state = WasmState.TERMINATING;
        this.process.terminate();
        this.disposables.forEach(d => d.dispose());
    }
}