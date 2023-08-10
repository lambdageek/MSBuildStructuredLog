// This is the JS we will load into the webview

// import type { LogModel } from '../shared/model';


import { NodeId } from '../shared/model';

import { assertNever } from '../shared/assert-never';

import { isCodeToWebviewMessage, CodeToWebviewEvent, CodeToWebviewReply } from '../shared/code-to-webview';

import { requestRoot, requestNodeSummary, postToVs, satisfyRequest } from './post-to-vs';
import { NodeTreeRenderer } from './node-tree-renderer';

let sideviewOpen: false | { nodeId: NodeId } = false;
let gridColumnParent: HTMLDivElement | null = null;
let sideview: HTMLDivElement | null = null;

function ensureSideview() {
    if (!gridColumnParent) {
        gridColumnParent = document.getElementById('grid-column-parent') as HTMLDivElement;
    }
    if (!sideview) {
        sideview = document.getElementById('side-view') as HTMLDivElement;
    }
}

const sideViewController = {
    closeSideview() {
        ensureSideview();
        gridColumnParent!.setAttribute('class', 'side-view-closed');
        sideview!.style.display = 'none';
        sideviewOpen = false;
    },

    toggleSideview(nodeId: NodeId) {
        ensureSideview();
        // if the view is currently open and showing the same node, close it
        // otherwise open it to the new node
        if (sideviewOpen && sideviewOpen.nodeId === nodeId) {
            sideViewController.closeSideview();
        } else {
            gridColumnParent!.setAttribute('class', 'side-view-open');
            sideview!.style.display = 'block';
            sideviewOpen = { nodeId };
        }
    },

    async setContent(nodeId: NodeId): Promise<void> {
        sideview!.innerHTML = `<p>Showing details for Node ${nodeId}</p>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const mainAppDiv = document.getElementById('main-app') as HTMLDivElement;
    const rootDiv = document.getElementById('logview-root-node') as HTMLDivElement;
    const renderer = new NodeTreeRenderer(rootDiv, sideViewController);
    let binlogFsPath = '';
    if (!mainAppDiv || !rootDiv)
        throw new Error("no main-app!");

    async function requestRootAndRefresh() {
        const nodeId = await requestRoot();
        renderer.setRootId(nodeId);
        await requestNodeSummary(nodeId);
        renderer.refresh();
    }

    function messageHandler(ev: MessageEvent<CodeToWebviewEvent | CodeToWebviewReply>): void {
        if (isCodeToWebviewMessage(ev.data)) {
            switch (ev.data.type) {
                case 'init': {
                    binlogFsPath = ev.data.fsPath;
                    mainAppDiv.innerHTML = `<p>Loading ${binlogFsPath}</p>`;
                    postToVs({ type: 'ready' });
                    break;
                }
                case 'engineStateChange': {
                    switch (ev.data.state) {
                        case 'ready': {
                            mainAppDiv.innerHTML = `<p>Loaded ${binlogFsPath}</p>`;
                            queueMicrotask(() => requestRootAndRefresh());
                            break;
                        }
                        case 'done': {
                            mainAppDiv.innerHTML = "<p>StructuredLogViewer.Wasi.Engine finished</p>";
                            window.removeEventListener('message', messageHandler);
                            break;
                        }
                        case 'faulted': {
                            mainAppDiv.innerHTML = `<p class="error">StructuredLogViewer.Wasi.Engine faulted</p>`;
                            window.removeEventListener('message', messageHandler);
                            break;
                        }
                        default:
                            assertNever(ev.data.state);
                            mainAppDiv.innerHTML = `<p class="error">Got a ${(ev.data as any).state} engine state change unexpectedly</p>`;
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
                default:
                    assertNever(ev.data);
                    mainAppDiv.innerHTML = `<p class="error">Got a ${(ev.data as any).type} unexpectedly</p>`;
                    break;
            }
        }
    }

    window.addEventListener('message', messageHandler);
    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
            sideViewController.closeSideview();
        }
    });
    postToVs({ type: 'contentLoaded' });
});
