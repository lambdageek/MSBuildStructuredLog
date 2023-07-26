// This is the JS we will load into the webview

// import type { LogModel } from '../shared/model';

import { SyncRequestDispatch } from '../shared/sync-request';

import * as req from '../shared/webview-to-code';

const vscode = acquireVsCodeApi<void>();

function postToVs(message: req.WebviewToCodeRequest | req.WebviewToCodeReply) {
    vscode.postMessage(message);
}

type NodeId = number;
interface NodeReply {
    type: 'node';
    requestId: number;
    nodeId: NodeId;
    summary: string;
    children?: [NodeId];
}

const nodeMap = new Map<NodeId, NodeReply>();

function addNodeToMap(node: NodeReply) {
    nodeMap.set(node.nodeId, node);
}

const requestDispatch = new SyncRequestDispatch<NodeReply>();

async function requestNode(nodeId: NodeId): Promise<void> {
    const [requestId, promise] = requestDispatch.promiseReply();
    postToVs({ type: 'node', nodeId, requestId });
    const node = await promise;
    addNodeToMap(node);
}

function paintNode(nodeId: number, container: HTMLElement) {
    const node = nodeMap.get(nodeId);
    if (node === undefined) {
        const button = document.createElement('button');
        button.setAttribute('type', 'button');
        button.addEventListener('click', async () => {
            await requestNode(nodeId);
            container.removeChild(button);
            paintNode(nodeId, container);
        });
        button.textContent = `${nodeId}`;
        container.appendChild(button);
    } else {
        container.innerHTML = `<p>${node.summary}</p>`;
        if (node.children && node.children.length > 0) {
            for (let i = 0; i < node.children.length; i++) {
                const childBox = document.createElement('div');
                childBox.setAttribute('class', 'treeNode');
                container.appendChild(childBox);
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
        const [requestId, promise] = requestDispatch.promiseReply();
        postToVs({ type: 'root', requestId });
        const node = await promise;
        if (rootId < 0) {
            rootId = node.nodeId;
        }
        addNodeToMap(node);
        refresh();
    }

    function messageHandler(ev: MessageEvent): void {
        switch (ev.data.type) {
            case 'init': {
                binlogFsPath = ev.data.fsPath;
                mainAppDiv.innerHTML = `<p>Loading ${binlogFsPath}</p>`;
                postToVs({ type: 'ready' });
                break;
            }
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
            case 'node': {
                const node = ev.data as NodeReply;
                requestDispatch.satisfy(node.requestId, node);
                break;
            }
            default:
                mainAppDiv.innerHTML = `<p class="error">Got a ${ev.data} unexpectedly</p>`;
                break;
        }
    }

    window.addEventListener('message', messageHandler);
    postToVs({ type: 'ready' });
});
