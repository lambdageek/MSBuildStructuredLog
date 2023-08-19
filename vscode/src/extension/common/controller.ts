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

enum SearchState {
    Idle,
    Searching,
    Done,
}

export class SearchResultController implements DisposableLike {
    readonly disposables: DisposableLike[] = [];
    readonly _results: SearchResult[] = [];
    private _state: SearchState = SearchState.Idle;

    private readonly _onDidDispose = new EventEmitter<void>();
    private readonly _onWillSearch = new EventEmitter<void>();
    private readonly _onDidSearch = new EventEmitter<void>();

    constructor(readonly controller: DocumentController, readonly query: string) {
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
        this.disposables.length = 0;
        this._results.length = 0;
        this._onDidDispose.fire();
    }

    get onDidDispose() {
        return this._onDidDispose.event;
    }

    get onWillSearch() {
        return this._onWillSearch.event;
    }

    get onDidSearch() {
        return this._onDidSearch.event;
    }

    get results(): SearchResult[] {
        return this._results;
    }

    get searchRunning(): boolean {
        return this._state == SearchState.Searching;
    }

    get hasResults(): boolean {
        return this._state == SearchState.Done;
    }

    get resultsLength(): number {
        return this._results.length;
    }

    async run(): Promise<void> {
        if (this._state !== SearchState.Idle) {
            throw new Error('search has already been done');
        }
        this._state = SearchState.Searching;
        this._onWillSearch.fire();
        const results = await this.controller.document.requestSearch(this.query);
        this._state = SearchState.Done;
        this._results.length = 0;
        this._results.push(...results.results);
        this._onDidSearch.fire();
    }

    reveal(result: SearchResult): void {
        this.controller.revealSearchResult(result);
    }
}

// talks to the underlying Engine process
export class DocumentController implements DisposableLike {
    private readonly subscriptions: DisposableLike[] = [];
    readonly _searches: SearchResultController[] = []
    readonly _onSearchAdded: EventEmitter<SearchResultController> = new EventEmitter<SearchResultController>();
    readonly _onSearchRemoved: EventEmitter<SearchResultController> = new EventEmitter<SearchResultController>();
    readonly _onSearchStarted: EventEmitter<SearchResultController> = new EventEmitter<SearchResultController>();
    readonly _onSearchFinished: EventEmitter<SearchResultController> = new EventEmitter<SearchResultController>();
    readonly _onSearchResultRevealed: EventEmitter<SearchResult> = new EventEmitter<SearchResult>();
    constructor(readonly context: ExtensionContext, readonly document: AbstractMSBuildLogDocument, readonly out?: LogOutputChannel) {

    }
    dispose() {
        this.subscriptions.forEach((d) => d.dispose());
        this.subscriptions.length = 0;
    }
    newSearch(query: string): SearchResultController {
        const search = new SearchResultController(this, query);
        this.subscriptions.push(search.onDidDispose(this.removeSearch.bind(this, search, true)));
        this._searches.push(search);
        this._onSearchAdded.fire(search);
        this.subscriptions.push(search.onWillSearch(() => this._onSearchStarted.fire(search)));
        this.subscriptions.push(search.onDidSearch(() => this._onSearchFinished.fire(search)));
        return search;
    }

    get searches(): SearchResultController[] {
        return [... this._searches];
    }

    get hasSearches(): boolean {
        return this._searches.length > 0;
    }

    get hasBookmarks(): boolean {
        return false;
    }

    get onSearchAdded() {
        return this._onSearchAdded.event;
    }

    get onSearchRemoved() {
        return this._onSearchRemoved.event;
    }

    get onSearchStarted() {
        return this._onSearchStarted.event;
    }

    get onSearchFinished() {
        return this._onSearchFinished.event;
    }

    get onSearchResultRevealed() {
        return this._onSearchResultRevealed.event;
    }

    revealSearchResult(result: SearchResult): void {
        this._onSearchResultRevealed.fire(result);
    }

    removeSearch(search: SearchResultController, afterDispose?: boolean): void {
        if (!afterDispose) {
            this._onSearchRemoved.fire(search);
        }
        const index = this._searches.indexOf(search);
        if (index >= 0) {
            this._searches.splice(index, 1);
        }
        if (!afterDispose) {
            search.dispose();
        }
    }

}

// talks to the webview
export class EditorController implements DisposableLike {
    private readonly subscriptions: DisposableLike[] = [];
    constructor(readonly viewer: MSBuildLogViewer, readonly documentController: DocumentController, readonly out?: LogOutputChannel) {
        this.subscriptions.push(documentController.onSearchResultRevealed(this.revealNode.bind(this)));
    }

    dispose() {
        this.subscriptions.forEach((d) => d.dispose());
        this.subscriptions.length = 0;
    }

    onContentLoaded(e: WebviewToCodeContentLoaded, documentReady: () => void): void {
        {
            if (e.type === 'contentLoaded') {
                this.out?.info('webview content loaded');
                this.subscriptions.push(this.viewer.onWebviewReply((e) => this.onWebviewReply(e)));
                this.subscriptions.push(this.viewer.onWebviewRequest((e) => this.onWebviewRequest(e)));
                documentReady();
            }
        }
    }

    revealNode(node: SearchResult): void {
        this.viewer.webviewPanel.reveal();
        this.viewer.postToWebview({ type: 'revealNode', node });
    }

    onWebviewReply(e: WebviewToCodeReply): void {
        switch (e.type) {
            case 'ready':
                this.postStateChange(this.documentController.document.state);
                if (this.documentController.document.isLive()) {
                    const stateChangeDisposable = this.documentController.document.onStateChange((ev) => this.postStateChange(ev.state, stateChangeDisposable));
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
                const node = await this.documentController.document.requestRoot();
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
                        const node = await this.documentController.document.requestNode(id);
                        reply = {
                            type: 'node',
                            requestId,
                            node: node.node,
                        };
                        break;
                    case 'manyNodes':
                        const nodes = await this.documentController.document.requestManyNodes(id, e.count);
                        reply = {
                            type: 'manyNodes',
                            requestId,
                            nodes: nodes.nodes,
                        }
                        break;
                    case 'summarizeNode':
                        const summaryNodes = await this.documentController.document.requestNodeSummary(id);
                        reply = {
                            type: 'manyNodes',
                            requestId,
                            nodes: summaryNodes.nodes,
                        }
                        break;
                    case 'nodeFullText':
                        const fullText = await this.documentController.document.requestNodeFullText(id);
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
