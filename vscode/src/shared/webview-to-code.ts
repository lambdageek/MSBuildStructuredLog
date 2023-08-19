import { NodeId } from './model';

export interface WebviewToCodeMessage {
    type: string;
}

export function isWebviewToCodeMessage(x: unknown): x is WebviewToCodeMessage {
    return (typeof (x) === 'object') && (x as WebviewToCodeMessage).type !== undefined;
}

export interface WebviewToCodeRequestBase extends WebviewToCodeMessage {
    requestId: number;
}

export interface WebviewToCodeRootRequest extends WebviewToCodeRequestBase {
    type: 'root';
}

export interface WebviewToCodeNodeRequest extends WebviewToCodeRequestBase {
    type: 'node';
    nodeId: NodeId;
}

export interface WebviewToCodeManyNodesRequest extends WebviewToCodeRequestBase {
    type: 'manyNodes';
    nodeId: NodeId;
    count: number;
}

export interface WebviewToCodeNodeSummaryRequest extends WebviewToCodeRequestBase {
    type: 'summarizeNode';
    nodeId: NodeId;
}

export interface WebviewToCodeNodeFullTextRequest extends WebviewToCodeRequestBase {
    type: 'nodeFullText';
    nodeId: NodeId;
}

export interface WebviewToCodeNodeFullTextCommand {
    type: 'nodeFullTextNoReply';
    nodeId: NodeId;
}

export type WebviewToCodeRequest =
    WebviewToCodeRootRequest
    | WebviewToCodeNodeRequest
    | WebviewToCodeManyNodesRequest
    | WebviewToCodeNodeSummaryRequest
    | WebviewToCodeNodeFullTextRequest
    ;

export interface WebviewToCodeReplyReady {
    type: 'ready';
}

export interface WebviewToCodeContentLoaded extends WebviewToCodeMessage {
    type: 'contentLoaded';
}

export type WebviewToCodeReply = WebviewToCodeReplyReady;

export type WebviewToCodeCommand = WebviewToCodeNodeFullTextCommand;