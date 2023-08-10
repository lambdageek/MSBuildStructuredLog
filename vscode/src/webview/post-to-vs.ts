
import * as req from '../shared/webview-to-code';
import { NodeId } from '../shared/model';
import { CodeToWebviewReply, CodeToWebviewNodeReply, CodeToWebviewManyNodesReply } from '../shared/code-to-webview';

import { SyncRequestDispatch } from '../shared/sync-request';

import { addNodeToMap } from './node-mapper';

const vscode = acquireVsCodeApi<void>();

export function postToVs(message: req.WebviewToCodeContentLoaded | req.WebviewToCodeRequest | req.WebviewToCodeReply) {
    vscode.postMessage(message);
}

const requestDispatch = new SyncRequestDispatch<CodeToWebviewReply>();

export function satisfyRequest(requestId: number, reply: CodeToWebviewReply) {
    requestDispatch.satisfy(requestId, reply);
}


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

export async function requestNodeSummary(nodeId: NodeId): Promise<void> {
    const [requestId, promise] = requestDispatch.promiseReply<CodeToWebviewManyNodesReply>();
    postToVs({ type: 'summarizeNode', nodeId, requestId });
    const nodes = await promise;
    for (const node of nodes.nodes) {
        addNodeToMap(node);
    }
}

export async function requestRoot(): Promise<NodeId> {
    const [requestId, promise] = requestDispatch.promiseReply<CodeToWebviewNodeReply>();
    postToVs({ type: 'root', requestId });
    const node = await promise;
    addNodeToMap(node.node);
    return node.node.nodeId;
}
