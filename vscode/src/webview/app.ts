// This is the JS we will load into the webview

import { assertNever } from '../shared/assert-never';

import { isCodeToWebviewMessage, CodeToWebviewEvent, CodeToWebviewReply } from '../shared/code-to-webview';

import { NodeRequester, postToVs, satisfyRequest } from './post-to-vs';
import { NodeMapper } from './node-mapper';
import { LayoutController } from './layout-controller';
import { NodeTreeRenderer } from './node-tree-renderer';
import { SideViewController } from './side-view';

import { SearchController } from './search';

function findFatal<T extends HTMLElement = HTMLDivElement>(id: string): T {
    const elem = document.getElementById(id) as T;
    if (!elem)
        throw new Error(`No div with id ${id}`);
    return elem;
}

class App {
    binlogFsPath: string = '';

    constructor(readonly nodeRequester: NodeRequester, readonly statusLineDiv: HTMLDivElement, readonly layoutController: LayoutController,
        readonly searchController: SearchController,
        readonly renderer: NodeTreeRenderer) {

    }
    static create(): App {
        const statusLineDiv = findFatal('status-line');
        const rootDiv = findFatal('logview-root-node');
        const gridColumnParent = findFatal('grid-column-parent');
        const sideview = findFatal('side-view');

        const nodeMapper = new NodeMapper();
        const nodeRequester = new NodeRequester(nodeMapper);
        nodeMapper.requestNodeSummary = nodeRequester.requestNodeSummary.bind(nodeRequester);

        const layoutController = new LayoutController(gridColumnParent, sideview, rootDiv);
        const searchController = new SearchController(nodeMapper);
        const sideViewController = new SideViewController(sideview, layoutController);
        const renderer = new NodeTreeRenderer(nodeRequester, rootDiv, sideViewController);

        return new App(nodeRequester, statusLineDiv, layoutController, searchController, renderer);
    }

    async requestRootAndRefresh() {
        const nodeId = await this.nodeRequester.requestRoot();
        this.renderer.setRootId(nodeId);
        await this.nodeRequester.requestNodeSummary(nodeId);
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
                                this.setStatus(`Loaded ${this.binlogFsPath}`);
                            });
                            break;
                        }
                        case 'done': {
                            this.setStatus("StructuredLogViewer.Vscode.Engine finished");
                            removeMessageHandler();
                            break;
                        }
                        case 'faulted': {
                            this.setStatus("StructuredLogViewer.Vscode.Engine faulted", { logLevel: 'error' });
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
                case 'revealNode':
                    {
                        const searchResult = ev.data.node;
                        queueMicrotask(async () => {
                            const fullyExploredNode = await this.searchController.summarizeResult(searchResult);
                            this.renderer.selectSearchResult(fullyExploredNode);
                        });
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
            if (this.layoutController.sideViewOpen) {
                this.layoutController.closeSideview();
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
