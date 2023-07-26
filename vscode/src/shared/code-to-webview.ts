
import { Node } from './model';

export interface CodeToWebviewMessage {
    type: string;
}

export function isCodeToWebviewMessage(x: unknown): x is CodeToWebviewMessage {
    return (typeof (x) === 'object') && (x as CodeToWebviewMessage).type !== undefined;
}

interface CodeToWebviewEventBase extends CodeToWebviewMessage { }

export interface CodeToWebviewEventReady extends CodeToWebviewEventBase {
    type: 'ready';
}

export interface CodeToWebviewEventDone extends CodeToWebviewEventBase {
    type: 'done';
}

export interface CodeToWebviewEventFaulted extends CodeToWebviewEventBase {
    type: 'faulted';
}

export interface CodeToWebviewEventInit extends CodeToWebviewEventBase {
    type: 'init';
    fsPath: string;
}

export type CodeToWebviewEvent =
    CodeToWebviewEventDone
    | CodeToWebviewEventFaulted
    | CodeToWebviewEventReady
    | CodeToWebviewEventInit
    ;

export interface CodeToWebviewReplyBase extends CodeToWebviewMessage {
    requestId: number;
}

export interface CodeToWebviewNodeReply extends CodeToWebviewReplyBase {
    type: 'node';
    node: Node;
}

export type CodeToWebviewReply =
    CodeToWebviewNodeReply
    ;