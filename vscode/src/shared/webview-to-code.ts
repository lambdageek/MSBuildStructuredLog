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
    nodeId: number;
}

export type WebviewToCodeRequest =
    WebviewToCodeRootRequest
    | WebviewToCodeNodeRequest
    ;

export interface WebviewToCodeReplyReady {
    type: 'ready';
}

export type WebviewToCodeReply = WebviewToCodeReplyReady;