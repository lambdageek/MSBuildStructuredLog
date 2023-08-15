import { Node, SearchResult } from '../../shared/model';

export interface WasmToCodeMessage {
    type: string;
}

export interface WasmToCodeNodeReply extends WasmToCodeMessage {
    type: 'node';
    requestId: number;
    node: Node;
}

export interface WasmToCodeManyNodesReply extends WasmToCodeMessage {
    type: 'manyNodes';
    requestId: number;
    nodes: Node[];
}

export interface WasmToCodeFullTextReply extends WasmToCodeMessage {
    type: 'fullText';
    requestId: number;
    fullText: string;
}

export interface WasmToCodeSearchResultsReply extends WasmToCodeMessage {
    type: 'searchResults';
    requestId: number;
    results: SearchResult[];
}

export interface WasmToCodeReady extends WasmToCodeMessage {
    type: 'ready';
}

export interface WasmToCodeDone extends WasmToCodeMessage {
    type: 'done';
}

export type WasmToCodeEvent =
    WasmToCodeReady | WasmToCodeDone;

export type WasmToCodeReply =
    WasmToCodeNodeReply
    | WasmToCodeManyNodesReply
    | WasmToCodeFullTextReply
    | WasmToCodeSearchResultsReply
    ;

export function isWasmToCodeMessage(x: unknown): x is WasmToCodeMessage {
    return typeof (x) === 'object' && (x as WasmToCodeMessage).type !== undefined;
}
