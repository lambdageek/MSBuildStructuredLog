import {
    Disposable,
    ExtensionContext,
    LogOutputChannel,
} from "vscode";
import { MSBuildLogDocument } from "./MSBuildLogDocument";

import { DisposableLike } from "../../shared/disposable";

import { assertNever } from "../../shared/assert-never";

import { WebviewToCodeRequest, WebviewToCodeReply, WebviewToCodeContentLoaded } from "../../shared/webview-to-code";

import { CodeToWebviewReply, CodeToWebviewNodeReply } from "../../shared/code-to-webview";

import { WasmState } from "./wasm/engine";

import { MSBuildLogViewer } from "./viewer";

export class MSBuildLogViewerController implements DisposableLike {
    readonly disposables: DisposableLike[];

    constructor(readonly context: ExtensionContext, readonly document: MSBuildLogDocument, readonly viewer: MSBuildLogViewer, readonly out?: LogOutputChannel) {
        this.disposables = [];
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
        this.disposables.length = 0;
    }

    onContentLoaded(e: WebviewToCodeContentLoaded, documentReady: () => void): void {
        {
            if (e.type === 'contentLoaded') {
                this.out?.info('webview content loaded');
                this.disposables.push(this.viewer.onWebviewReply((e) => this.onWebviewReply(e)));
                this.disposables.push(this.viewer.onWebviewRequest((e) => this.onWebviewRequest(e)));
                documentReady();
            }
        }
    }

    onWebviewReply(e: WebviewToCodeReply): void {
        switch (e.type) {
            case 'ready':
                this.postStateChange(this.document.state);
                if (this.document.isLive()) {
                    const stateChangeDisposable = this.document.onStateChange((ev) => this.postStateChange(ev.state, stateChangeDisposable));
                }
                break;
            default:
                assertNever(e.type);
                this.out?.warn(`unexpected response from webview ${(e as any).type}`)
        }
    }

    async onWebviewRequest(e: WebviewToCodeRequest): Promise<void> {
        switch (e.type) {
            case 'root': {
                const requestId = e.requestId;
                const node = await this.document.requestRoot();
                const reply: CodeToWebviewNodeReply = {
                    type: 'node',
                    requestId,
                    node: node.node,
                };
                this.out?.info(`posting root to webview ${JSON.stringify(reply)}`);
                this.viewer.postToWebview(reply);
                break;
            }
            case 'node':
            case 'manyNodes': {
                const requestId = e.requestId;
                const id = e.nodeId;
                let reply: CodeToWebviewReply;
                switch (e.type) {
                    case 'node':
                        const node = await this.document.requestNode(id);
                        reply = {
                            type: 'node',
                            requestId,
                            node: node.node,
                        };
                        break;
                    case 'manyNodes':
                        const nodes = await this.document.requestManyNodes(id, e.count);
                        reply = {
                            type: 'manyNodes',
                            requestId,
                            nodes: nodes.nodes,
                        }
                        break;
                    default:
                        assertNever(e);
                        reply = undefined as any;
                        break;
                }
                this.out?.info(`posting node ${id} to webview ${JSON.stringify(reply)}`);
                this.viewer.postToWebview(reply);
                break;
            }
            default:
                assertNever(e);
        }
    }

    postStateChange(state: WasmState, disposable?: Disposable) {
        switch (state) {
            case WasmState.LOADED:
            case WasmState.STARTED:
                /* ignore */
                break;
            case WasmState.READY:
                this.viewer.postToWebview({ type: 'engineStateChange', state: 'ready' });
                break;
            case WasmState.SHUTTING_DOWN:
            case WasmState.TERMINATING:
            case WasmState.EXIT_SUCCESS:
                this.viewer.postToWebview({ type: 'engineStateChange', state: 'done' });
                disposable?.dispose(); // unsubscribe
                break;
            case WasmState.EXIT_FAILURE:
                this.viewer.postToWebview({ type: 'engineStateChange', state: 'faulted' });
                disposable?.dispose(); // unsubscribe
                break;
            default:
                assertNever(state);
                break;
        }
    }

}
