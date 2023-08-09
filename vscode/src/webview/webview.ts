// This is the JS we will load into the webview

// import type { LogModel } from '../shared/model';

import { SyncRequestDispatch } from '../shared/sync-request';

import { NodeId, Node } from '../shared/model';

import { assertNever } from '../shared/assert-never';

import { isCodeToWebviewMessage, CodeToWebviewEvent, CodeToWebviewReply, CodeToWebviewNodeReply, CodeToWebviewManyNodesReply } from '../shared/code-to-webview';

import * as req from '../shared/webview-to-code';

let sideviewOpen = false;
let gridColumnParent: HTMLDivElement | null = null;
let sideview: HTMLDivElement | null = null;

function toggleSideview() {
    if (!gridColumnParent) {
        gridColumnParent = <HTMLDivElement>document.getElementById('grid-column-parent');
    }
    if (!sideview) {
        sideview = <HTMLDivElement>document.getElementById('side-view');
    }
    if (sideviewOpen) {
        gridColumnParent.setAttribute('class', 'side-view-closed');
        sideview.style.display = 'none';
        sideviewOpen = false;
    } else {
        gridColumnParent.setAttribute('class', 'side-view-open');
        sideview.style.display = 'block';
        sideviewOpen = true;
    }
}

const vscode = acquireVsCodeApi<void>();

function postToVs(message: req.WebviewToCodeContentLoaded | req.WebviewToCodeRequest | req.WebviewToCodeReply) {
    vscode.postMessage(message);
}

const nodeMap = new Map<NodeId, Node>();

function addNodeToMap(node: Node) {
    const fullyExplored = node.fullyExplored ?? false;
    if (fullyExplored || !nodeMap.has(node.nodeId))
        nodeMap.set(node.nodeId, node);
}

const requestDispatch = new SyncRequestDispatch<CodeToWebviewReply>();

// async function requestNode(nodeId: NodeId): Promise<void> {
//     const [requestId, promise] = requestDispatch.promiseReply<CodeToWebviewNodeReply>();
//     postToVs({ type: 'node', nodeId, requestId });
//     const node = await promise;
//     addNodeToMap(node.node);
// }

// async function requestManyNodes(nodeId: NodeId, count: number = 50): Promise<void> {
//     const [requestId, promise] = requestDispatch.promiseReply<CodeToWebviewManyNodesReply>();
//     postToVs({ type: 'manyNodes', nodeId, count, requestId });
//     const nodes = await promise;
//     for (const node of nodes.nodes) {
//         addNodeToMap(node);
//     }
// }

async function requestNodeSummary(nodeId: NodeId): Promise<void> {
    const [requestId, promise] = requestDispatch.promiseReply<CodeToWebviewManyNodesReply>();
    postToVs({ type: 'summarizeNode', nodeId, requestId });
    const nodes = await promise;
    for (const node of nodes.nodes) {
        addNodeToMap(node);
    }
}


function paintNode(nodeId: NodeId, container: HTMLElement, open?: 'open' | undefined) {
    const node = nodeMap.get(nodeId);
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
                toggleSideview(); // FIXME: this should force the sideview to open unless we're already showing the current node.
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

    async function requestRoot(): Promise<void> {
        const [requestId, promise] = requestDispatch.promiseReply<CodeToWebviewNodeReply>();
        postToVs({ type: 'root', requestId });
        const node = await promise;
        if (rootId < 0) {
            rootId = node.node.nodeId;
        }
        addNodeToMap(node.node);
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
                            queueMicrotask(() => requestRoot());
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
                        requestDispatch.satisfy(reply.requestId, reply);
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
    postToVs({ type: 'contentLoaded' });
});
