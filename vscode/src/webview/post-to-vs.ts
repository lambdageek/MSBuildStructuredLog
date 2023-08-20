
import * as req from '../shared/webview-to-code';
import { NodeId } from '../shared/model';
import { CodeToWebviewReply, CodeToWebviewNodeReply, CodeToWebviewManyNodesReply } from '../shared/code-to-webview';

import { SyncRequestDispatch } from '../shared/sync-request';

import { NodeMapper } from './node-mapper';

const vscode = acquireVsCodeApi<void>();

export function postToVs(message: req.WebviewToCodeContentLoaded | req.WebviewToCodeRequest | req.WebviewToCodeReply | req.WebviewToCodeCommand) {
    vscode.postMessage(message);
}

const requestDispatch = new SyncRequestDispatch<CodeToWebviewReply>();

export function satisfyRequest(requestId: number, reply: CodeToWebviewReply) {
    requestDispatch.satisfy(requestId, reply);
}

export class NodeRequester {
    constructor(readonly nodeMapper: NodeMapper) { }

    async requestNodeSummary(nodeId: NodeId): Promise<void> {
        const [requestId, promise] = requestDispatch.promiseReply<CodeToWebviewManyNodesReply>();
        postToVs({ type: 'summarizeNode', nodeId, requestId });
        const nodes = await promise;
        for (const node of nodes.nodes) {
            this.nodeMapper.add(node);
        }
    }

    async requestRoot(): Promise<NodeId> {
        const [requestId, promise] = requestDispatch.promiseReply<CodeToWebviewNodeReply>();
        postToVs({ type: 'root', requestId });
        const node = await promise;
        this.nodeMapper.add(node.node);
        return node.node.nodeId;
    }
}

export async function requestRevealNodeFullText(nodeId: NodeId): Promise<void> {
    postToVs({ type: 'nodeFullTextNoReply', nodeId });
}

export async function requestBookmarkStateChanged(nodeId: NodeId, bookmarked: boolean): Promise<void> {
    postToVs({ type: 'nodeBookmark', nodeId, bookmarked });
}