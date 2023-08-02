// This is the JS we will load into the webview

// import type { LogModel } from '../shared/model';

import { SyncRequestDispatch } from '../shared/sync-request';

import { NodeId, Node } from '../shared/model';

import { assertNever } from '../shared/assert-never';

import { isCodeToWebviewMessage, CodeToWebviewEvent, CodeToWebviewReply, CodeToWebviewNodeReply, CodeToWebviewManyNodesReply } from '../shared/code-to-webview';

import * as req from '../shared/webview-to-code';

const vscode = acquireVsCodeApi<void>();

function postToVs(message: req.WebviewToCodeContentLoaded | req.WebviewToCodeRequest | req.WebviewToCodeReply) {
    vscode.postMessage(message);
}

const nodeMap = new Map<NodeId, Node>();

function addNodeToMap(node: Node) {
    nodeMap.set(node.nodeId, node);
}

const requestDispatch = new SyncRequestDispatch<CodeToWebviewReply>();

// async function requestNode(nodeId: NodeId): Promise<void> {
//     const [requestId, promise] = requestDispatch.promiseReply<CodeToWebviewNodeReply>();
//     postToVs({ type: 'node', nodeId, requestId });
//     const node = await promise;
//     addNodeToMap(node.node);
// }

async function requestManyNodes(nodeId: NodeId, count: number = 50): Promise<void> {
    const [requestId, promise] = requestDispatch.promiseReply<CodeToWebviewManyNodesReply>();
    postToVs({ type: 'manyNodes', nodeId, count, requestId });
    const nodes = await promise;
    for (const node of nodes.nodes) {
        addNodeToMap(node);
    }
}

function paintNode(nodeId: NodeId, container: HTMLElement) {
    const node = nodeMap.get(nodeId);
    if (node === undefined) {
        const button = document.createElement('button');
        button.setAttribute('type', 'button');
        button.addEventListener('click', async () => {
            await requestManyNodes(nodeId);
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
            container.appendChild(details);
            summaryDest = document.createElement('summary');
            details.appendChild(summaryDest);
            childrenDest = details;
        }
        summaryDest.innerHTML = `<p class='node-kind-${node.nodeKind}'><span class='nodeKind'>${node.nodeKind}</span>${node.summary}</p>`;
        if (node.children && node.children.length > 0) {
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
            paintNode(rootId, rootDiv);
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
        await requestManyNodes(rootId);
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
