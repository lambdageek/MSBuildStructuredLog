// This is the JS we will load into the webview

// import type { LogModel } from '../shared/model';


import { NodeId } from '../shared/model';

import { assertNever } from '../shared/assert-never';

import { isCodeToWebviewMessage, CodeToWebviewEvent, CodeToWebviewReply } from '../shared/code-to-webview';

import { findNode } from './node-mapper';

import { requestRoot, requestNodeSummary, postToVs, satisfyRequest } from './post-to-vs';

let sideviewOpen: false | { nodeId: NodeId } = false;
let gridColumnParent: HTMLDivElement | null = null;
let sideview: HTMLDivElement | null = null;

function ensureSideview() {
    if (!gridColumnParent) {
        gridColumnParent = <HTMLDivElement>document.getElementById('grid-column-parent');
    }
    if (!sideview) {
        sideview = <HTMLDivElement>document.getElementById('side-view');
    }
}

function closeSideview() {
    ensureSideview();
    gridColumnParent!.setAttribute('class', 'side-view-closed');
    sideview!.style.display = 'none';
    sideviewOpen = false;
}

function toggleSideview(nodeId: NodeId) {
    ensureSideview();
    // if the view is currently open and showing the same node, close it
    // otherwise open it to the new node
    if (sideviewOpen && sideviewOpen.nodeId === nodeId) {
        closeSideview();
    } else {
        gridColumnParent!.setAttribute('class', 'side-view-open');
        sideview!.style.display = 'block';
        sideviewOpen = { nodeId };
    }
}


function paintNode(nodeId: NodeId, container: HTMLElement, open?: 'open' | undefined) {
    const node = findNode(nodeId);
    if (node === undefined) {
        const button = document.createElement('button');
        button.setAttribute('type', 'button');
        button.addEventListener('click', async () => {
            await requestNodeSummary(nodeId);
            container.removeChild(button);
            paintNode(nodeId, container);
        });
        button.textContent = `${nodeId}`;
        container.appendChild(button);
    } else {
        let childrenDest = container;
        let summaryDest = container;
        if (node.children && node.children.length > 0) {
            const details = document.createElement('details');
            if (open === 'open') {
                details.setAttribute('open', '');
            }
            const fullyExplored = node.fullyExplored ?? false;
            container.appendChild(details);
            if (!fullyExplored) {
                details.addEventListener('toggle', async (ev) => {
                    if (details.getAttribute('open') === '') {
                        ev.preventDefault();
                        await requestNodeSummary(nodeId);
                        container.removeChild(details);
                        paintNode(nodeId, container, 'open');
                    }
                }, { once: true });
            }
            summaryDest = document.createElement('summary');
            details.appendChild(summaryDest);
            childrenDest = details;
        }
        let nodeSummaryAbridged: HTMLSpanElement | null = null;
        if (node.abridged) {
            nodeSummaryAbridged = document.createElement('span');
            nodeSummaryAbridged.setAttribute('class', 'nodeSummaryAbridged');
            nodeSummaryAbridged.appendChild(document.createTextNode(' 🔍'));
            nodeSummaryAbridged.addEventListener('click', async () => {
                // TODO: request abridged node's full content and display it in the sideview
                toggleSideview(node.nodeId);
                sideview!.innerHTML = `<p>Showing details for Node ${node.nodeId}</p>`;
            });
        }
        const nodeSummary = document.createElement('p');
        nodeSummary.setAttribute('class', `nodeSummary node-kind-${node.nodeKind}`);
        nodeSummary.innerHTML = `<span class='nodeKind'>${node.nodeKind}</span>${node.summary}`;
        if (nodeSummaryAbridged) {
            nodeSummary.appendChild(nodeSummaryAbridged);
        }
        summaryDest.appendChild(nodeSummary);
        if ((node.fullyExplored ?? false) && node.children && node.children.length > 0) {
            for (let i = 0; i < node.children.length; i++) {
                const childBox = document.createElement('div');
                childBox.setAttribute('class', 'treeNode');
                childrenDest.appendChild(childBox);
                paintNode(node.children[i], childBox);
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const mainAppDiv = document.getElementById('main-app') as HTMLDivElement;
    const rootDiv = document.getElementById('logview-root-node') as HTMLDivElement;
    let rootId = -1;
    let binlogFsPath = '';
    if (!mainAppDiv || !rootDiv)
        throw new Error("no main-app!");

    function refresh() {
        if (rootId != -1) {
            rootDiv.setAttribute('class', 'treeNode');
            paintNode(rootId, rootDiv, 'open');
        }
    }

    async function requestRootAndRefresh() {
        const nodeId = await requestRoot();
        if (rootId < 0) {
            rootId = nodeId;
        }
        await requestNodeSummary(rootId);
        refresh();
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
            closeSideview();
        }
    });
    postToVs({ type: 'contentLoaded' });
});
