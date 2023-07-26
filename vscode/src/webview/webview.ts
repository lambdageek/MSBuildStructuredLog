// This is the JS we will load into the webview

// import type { LogModel } from '../shared/model';

import { SyncRequestDispatch } from '../shared/sync-request';

const vscode = acquireVsCodeApi<void>();

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
    vscode.postMessage({ type: 'node', nodeId, requestId });
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
        vscode.postMessage({ type: 'root', requestId });
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
                mainAppDiv.innerHTML = "<h2>Initialized!!</h2>";
                vscode.postMessage({ type: 'ready' });
                break;
            }
            case 'ready': {
                mainAppDiv.innerHTML = "<h2>StructuredLogViewer.Wasi.Engine ready</h2>";
                queueMicrotask(() => requestRoot());
                break;
            }
            case 'done': {
                mainAppDiv.innerHTML = "<div>StructuredLogViewer.Wasi.Engine finished</div>";
                window.removeEventListener('message', messageHandler);
                break;
            }
            case 'faulted': {
                mainAppDiv.innerHTML = `<h2 class="error">StructuredLogViewer.Wasi.Engine faulted</h2>`;
                window.removeEventListener('message', messageHandler);
                break;
            }
            case 'node': {
                mainAppDiv.innerHTML = `<h2>Got a node</h2>`;
                const node = ev.data as NodeReply;
                requestDispatch.satisfy(node.requestId, node);
                break;
            }
            default:
                mainAppDiv.innerHTML = `<h2>Got a ${ev.data} unexpectedly`;
                break;
        }
    }

    window.addEventListener('message', messageHandler);
    vscode.postMessage({ type: 'ready' });
});
