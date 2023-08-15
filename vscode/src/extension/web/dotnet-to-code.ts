import { Node, SearchResult } from '../../shared/model';

export interface DotnetToCodeMessage {
    type: string;
}

export interface DotnetToCodeNodeReply extends DotnetToCodeMessage {
    type: 'node';
    requestId: number;
    node: Node;
}

export interface DotnetToCodeManyNodesReply extends DotnetToCodeMessage {
    type: 'manyNodes';
    requestId: number;
    nodes: Node[];
}

export interface DotnetToCodeFullTextReply extends DotnetToCodeMessage {
    type: 'fullText';
    requestId: number;
    fullText: string;
}

export interface DotnetToCodeSearchResultsReply extends DotnetToCodeMessage {
    type: 'searchResults';
    requestId: number;
    results: SearchResult[];
}

export interface DotnetToCodeReady extends DotnetToCodeMessage {
    type: 'ready';
}

export interface DotnetToCodeDone extends DotnetToCodeMessage {
    type: 'done';
}

export type DotnetToCodeEvent =
    DotnetToCodeReady | DotnetToCodeDone;

export type DotnetToCodeReply =
    DotnetToCodeNodeReply
    | DotnetToCodeManyNodesReply
    | DotnetToCodeFullTextReply
    | DotnetToCodeSearchResultsReply
    ;

export function isDotnetToCodeMessage(x: unknown): x is DotnetToCodeMessage {
    return typeof (x) === 'object' && (x as DotnetToCodeMessage).type !== undefined;
}
