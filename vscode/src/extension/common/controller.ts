import {
    Disposable,
    ExtensionContext,
    EventEmitter,
    LogOutputChannel,
} from "vscode";
import { AbstractMSBuildLogDocument } from "./document";

import { DisposableLike } from "../../shared/disposable";

import { assertNever } from "../../shared/assert-never";

import { WebviewToCodeRequest, WebviewToCodeReply, WebviewToCodeContentLoaded } from "../../shared/webview-to-code";

import { CodeToWebviewReply, CodeToWebviewNodeReply } from "../../shared/code-to-webview";

import { SearchResult } from "../../shared/model";

import { SubprocessState } from "./subprocess/subprocess-state";

import { MSBuildLogViewer } from "./editor/viewer";

export class SearchResultController implements DisposableLike {
    readonly disposables: DisposableLike[] = [];
    readonly _results: SearchResult[] = [];
    private _didRun = false;

    private readonly _onDidDispose = new EventEmitter<void>();

    constructor(readonly controller: MSBuildLogViewerController, readonly query: string) {
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
        this.disposables.length = 0;
        this._results.length = 0;
    }

    get onDidDispose() {
        return this._onDidDispose.event;
    }

    get results(): SearchResult[] {
        return this._results;
    }

    get hasResults(): boolean {
        return this._didRun;
    }

    get resultsLength(): number {
        return this._results.length;
    }

    async run(): Promise<void> {
        const results = await this.controller.document.requestSearch(this.query);
        this._didRun = true;
        this._results.length = 0;
        this._results.push(...results.results);
    }
}

export class MSBuildLogViewerController implements DisposableLike {
    readonly disposables: DisposableLike[];
    readonly _searches: SearchResultController[];
    readonly _onSearchAdded: EventEmitter<SearchResultController> = new EventEmitter<SearchResultController>();

    constructor(readonly context: ExtensionContext, readonly document: AbstractMSBuildLogDocument, readonly viewer: MSBuildLogViewer, readonly out?: LogOutputChannel) {
        this.disposables = [];
        this._searches = [];
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
        this.disposables.length = 0;
    }

    newSearch(query: string): SearchResultController {
        const search = new SearchResultController(this, query);
        this.disposables.push(search.onDidDispose(() => {
            const index = this._searches.indexOf(search);
            if (index >= 0) {
                this._searches.splice(index, 1);
            }
        }));
        this._searches.push(search);
        this._onSearchAdded.fire(search);
        return search;
    }

    get searches(): SearchResultController[] {
        return [... this._searches];
    }

    get onSearchAdded() {
        return this._onSearchAdded.event;
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

    revealNode(node: SearchResult): void {
        this.viewer.postToWebview({ type: 'revealNode', node });
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
            case 'manyNodes':
            case 'nodeFullText':
            case 'summarizeNode': {
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
                    case 'summarizeNode':
                        const summaryNodes = await this.document.requestNodeSummary(id);
                        reply = {
                            type: 'manyNodes',
                            requestId,
                            nodes: summaryNodes.nodes,
                        }
                        break;
                    case 'nodeFullText':
                        const fullText = await this.document.requestNodeFullText(id);
                        reply = {
                            type: 'fullText',
                            requestId,
                            fullText: fullText.fullText,
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

    postStateChange(state: SubprocessState, disposable?: Disposable) {
        switch (state) {
            case SubprocessState.LOADED:
            case SubprocessState.STARTED:
                /* ignore */
                break;
            case SubprocessState.READY:
                this.viewer.postToWebview({ type: 'engineStateChange', state: 'ready' });
                break;
            case SubprocessState.SHUTTING_DOWN:
            case SubprocessState.TERMINATING:
            case SubprocessState.EXIT_SUCCESS:
                this.viewer.postToWebview({ type: 'engineStateChange', state: 'done' });
                disposable?.dispose(); // unsubscribe
                break;
            case SubprocessState.EXIT_FAILURE:
                this.viewer.postToWebview({ type: 'engineStateChange', state: 'faulted' });
                disposable?.dispose(); // unsubscribe
                break;
            default:
                assertNever(state);
                break;
        }
    }

}
