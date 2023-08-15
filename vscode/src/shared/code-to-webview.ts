
import { Node, SearchResult } from './model';

export interface CodeToWebviewMessage {
    type: string;
}

export function isCodeToWebviewMessage(x: unknown): x is CodeToWebviewMessage {
    return (typeof (x) === 'object') && (x as CodeToWebviewMessage).type !== undefined;
}

interface CodeToWebviewEventBase extends CodeToWebviewMessage { }

export type EngineState = 'notStarted' | 'ready' | 'done' | 'faulted';

export interface CodeToWebviewEventEngineStateChange extends CodeToWebviewEventBase {
    type: 'engineStateChange';
    state: Exclude<EngineState, 'notStarted'>;
}

export interface CodeToWebviewEventInit extends CodeToWebviewEventBase {
    type: 'init';
    fsPath: string;
}

export interface CodeToWebviewEventRevealNode extends CodeToWebviewEventBase {
    type: 'revealNode';
    node: SearchResult;
}

export type CodeToWebviewEvent =
    CodeToWebviewEventEngineStateChange
    | CodeToWebviewEventInit
    | CodeToWebviewEventRevealNode
    ;

export interface CodeToWebviewReplyBase extends CodeToWebviewMessage {
    requestId: number;
}

export interface CodeToWebviewNodeReply extends CodeToWebviewReplyBase {
    type: 'node';
    node: Node;
}

export interface CodeToWebviewManyNodesReply extends CodeToWebviewReplyBase {
    type: 'manyNodes';
    nodes: Node[];
}

export interface CodeToWebviewFullTextReply extends CodeToWebviewReplyBase {
    type: 'fullText';
    fullText: string;
}

export type CodeToWebviewReply =
    CodeToWebviewNodeReply
    | CodeToWebviewManyNodesReply
    | CodeToWebviewFullTextReply
    ;