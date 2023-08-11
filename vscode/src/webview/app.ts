// This is the JS we will load into the webview

import { assertNever } from '../shared/assert-never';

import { isCodeToWebviewMessage, CodeToWebviewEvent, CodeToWebviewReply } from '../shared/code-to-webview';

import { requestRoot, requestNodeSummary, postToVs, satisfyRequest } from './post-to-vs';
import { NodeTreeRenderer } from './node-tree-renderer';
import { SideViewController } from './side-view';

function findDivFatal(id: string): HTMLDivElement {
    const div = document.getElementById(id) as HTMLDivElement;
    if (!div)
        throw new Error(`No div with id ${id}`);
    return div;
}

class App {
    binlogFsPath: string = '';

    constructor(readonly statusLineDiv: HTMLDivElement, readonly sideViewController: SideViewController, readonly renderer: NodeTreeRenderer) { }
    static create(): App {
        const statusLineDiv = findDivFatal('status-line');
        const rootDiv = findDivFatal('logview-root-node');
        const gridColumnParent = findDivFatal('grid-column-parent');
        const sideview = findDivFatal('side-view');

        const sideViewController = new SideViewController(sideview, gridColumnParent);
        const renderer = new NodeTreeRenderer(rootDiv, sideViewController);

        return new App(statusLineDiv, sideViewController, renderer);
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
            this.sideViewController.closeSideview();
            ev.preventDefault();
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
