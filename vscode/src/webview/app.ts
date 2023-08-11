// This is the JS we will load into the webview

import { assertNever } from '../shared/assert-never';

import { isCodeToWebviewMessage, CodeToWebviewEvent, CodeToWebviewReply } from '../shared/code-to-webview';

import { requestRoot, requestNodeSummary, postToVs, satisfyRequest } from './post-to-vs';
import { LayoutController } from './layout-controller';
import { NodeTreeRenderer } from './node-tree-renderer';
import { SideViewController } from './side-view';

function findFatal<T extends HTMLElement = HTMLDivElement>(id: string): T {
    const elem = document.getElementById(id) as T;
    if (!elem)
        throw new Error(`No div with id ${id}`);
    return elem;
}

class SearchController {
    constructor(readonly searchInput: HTMLInputElement, readonly searchButton: HTMLButtonElement,
        readonly searchResults: HTMLDivElement, readonly layoutController: LayoutController) {
        this.searchButton.addEventListener('click', () => this.onSearch());
        this.searchInput.addEventListener('keydown', (ev) => this.onKeyDown(ev));
    }

    onReady() {
        this.setSearchControlsActive(true);
    }

    private setSearchControlsActive(enable: boolean) {
        this.searchInput.disabled = !enable;
        this.searchButton.disabled = !enable;
    }

    private onSearch() {
        const text = this.searchInput.value;
        if (text) {
            // toggle view to open search
            this.searchResults.replaceChildren(document.createTextNode(`Searching for ${text}...`));
            this.layoutController.openSearchResults();
            this.setSearchControlsActive(false);
            setTimeout(() => {
                this.setSearchControlsActive(true);
            }, 5000);
        } else {
            // toggle view to close search
            this.layoutController.closeSearchResults();
            this.searchResults.replaceChildren();
        }
    }

    private onKeyDown(ev: KeyboardEvent) {
        if (ev.key === 'Enter') {
            this.onSearch();
            ev.preventDefault();
        }
    }
}

class App {
    binlogFsPath: string = '';

    constructor(readonly statusLineDiv: HTMLDivElement, readonly layoutController: LayoutController,
        readonly searchController: SearchController,
        readonly renderer: NodeTreeRenderer) { }
    static create(): App {
        const statusLineDiv = findFatal('status-line');
        const rootDiv = findFatal('logview-root-node');
        const gridColumnParent = findFatal('grid-column-parent');
        const sideview = findFatal('side-view');
        const searchResults = findFatal('search-results');
        const searchInput = findFatal<HTMLInputElement>('search-input');
        const searchButton = findFatal<HTMLButtonElement>('search-button');

        const layoutController = new LayoutController(gridColumnParent, sideview, rootDiv, searchResults);
        const searchController = new SearchController(searchInput, searchButton, searchResults, layoutController);
        const sideViewController = new SideViewController(sideview, layoutController);
        const renderer = new NodeTreeRenderer(rootDiv, sideViewController);

        return new App(statusLineDiv, layoutController, searchController, renderer);
    }

    async requestRootAndRefresh() {
        const nodeId = await requestRoot();
        this.renderer.setRootId(nodeId);
        await requestNodeSummary(nodeId);
        this.renderer.refresh();
    }

    setStatus(text: string, options?: { logLevel: 'error' }) {
        const p = document.createElement('p');
        p.appendChild(document.createTextNode(text));
        if (options?.logLevel === 'error') {
            p.setAttribute('class', 'error');
        }
        this.statusLineDiv.replaceChildren(p);
    }

    messageHandler(ev: MessageEvent<CodeToWebviewEvent | CodeToWebviewReply>, removeMessageHandler: () => void): void {
        if (isCodeToWebviewMessage(ev.data)) {
            switch (ev.data.type) {
                case 'init': {
                    this.binlogFsPath = ev.data.fsPath;
                    this.setStatus(`Loading ${this.binlogFsPath}`);
                    postToVs({ type: 'ready' });
                    break;
                }
                case 'engineStateChange': {
                    switch (ev.data.state) {
                        case 'ready': {
                            this.setStatus(`Rendering ${this.binlogFsPath}`);
                            queueMicrotask(async () => {
                                await this.requestRootAndRefresh();
                                this.searchController.onReady();
                                this.setStatus(`Loaded ${this.binlogFsPath}`);
                            });
                            break;
                        }
                        case 'done': {
                            this.setStatus("StructuredLogViewer.Wasi.Engine finished");
                            removeMessageHandler();
                            break;
                        }
                        case 'faulted': {
                            this.setStatus("StructuredLogViewer.Wasi.Engine faulted", { logLevel: 'error' });
                            removeMessageHandler();
                            break;
                        }
                        default:
                            assertNever(ev.data.state);
                            this.setStatus(`Got a ${(ev.data as any).state} engine state change unexpectedly`, { logLevel: 'error' });
                            break;
                    }
                    break;
                }
                case 'node':
                case 'manyNodes':
                    {
                        const reply = ev.data;
                        satisfyRequest(reply.requestId, reply);
                        break;
                    }
                case 'fullText':
                    {
                        const reply = ev.data;
                        satisfyRequest(reply.requestId, reply);
                        break;
                    }
                default:
                    assertNever(ev.data);
                    this.setStatus(`Got a ${(ev.data as any).type} unexpectedly`, { logLevel: 'error' });
                    break;
            }
        }
    }

    onContentLoaded() {
        postToVs({ type: 'contentLoaded' });
    }

    onKeyDown(ev: KeyboardEvent): void {
        if (ev.key === 'Escape') {
            // prefer closing the side view if it's open, otherwise close the search results
            if (this.layoutController.sideViewOpen) {
                this.layoutController.closeSideview();
                ev.preventDefault();
            } else if (this.layoutController.searchResultsOpen) {
                this.layoutController.closeSearchResults();
                ev.preventDefault();
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = App.create();

    const handler = (ev: MessageEvent<CodeToWebviewEvent | CodeToWebviewReply>): void => app.messageHandler(ev, () => window.removeEventListener('message', handler));
    window.addEventListener('message', handler);
    document.addEventListener('keydown', (ev) => app.onKeyDown(ev));
    app.onContentLoaded();
});
