// This is the JS we will load into the webview

// import type { LogModel } from '../shared/model';

const vscode = acquireVsCodeApi<void>();

type NodeId = number;
interface NodeReply {
    type: 'node';
    // requestId: number;
    nodeId: NodeId;
    summary: string;
    children?: [NodeId];
}

const nodeMap = new Map<NodeId, NodeReply>();

function requestNode(nodeId: NodeId) {
    vscode.postMessage({ type: 'node', nodeId });
}

function paintNode(nodeId: number, container: HTMLElement) {
    const node = nodeMap.get(nodeId);
    if (node === undefined) {
        const button = document.createElement('button');
        button.setAttribute('type', 'button');
        button.addEventListener('click', () => { requestNode(nodeId); });
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
    const div = document.getElementById('main-app') as HTMLDivElement;
    let rootId = -1;
    if (!div)
        throw new Error("no main-app!");

    function refresh() {
        if (rootId != -1) {
            div.setAttribute('class', 'treeNode');
            paintNode(rootId, div);
        }
    }

    function addNodeToMap(node: NodeReply) {
        nodeMap.set(node.nodeId, node);
    }

    function messageHandler(ev: MessageEvent): void {
        switch (ev.data.type) {
            case 'init': {
                div.innerHTML = "<h2>Initialized!!</h2>";
                vscode.postMessage({ type: 'ready' });
                break;
            }
            case 'ready': {
                div.innerHTML = "<h2>StructuredLogViewer.Wasi.Engine ready</h2>";
                vscode.postMessage({ type: 'root' });
                break;
            }
            case 'done': {
                div.innerHTML = "<div>StructuredLogViewer.Wasi.Engine finished</div>";
                window.removeEventListener('message', messageHandler);
                break;
            }
            case 'faulted': {
                div.innerHTML = `<h2 class="error">StructuredLogViewer.Wasi.Engine faulted</h2>`;
                window.removeEventListener('message', messageHandler);
                break;
            }
            case 'node': {
                div.innerHTML = `<h2>Got a node</h2>`;
                const node = ev.data as NodeReply;
                if (rootId < 0) {
                    rootId = node.nodeId;
                }
                addNodeToMap(node);
                refresh();
                break;
            }
            default:
                div.innerHTML = `<h2>Got a ${ev.data} unexpectedly`;
                break;
        }
    }


    window.addEventListener('message', messageHandler);
    vscode.postMessage({ type: 'ready' });
});
