import {
    Event,
    EventEmitter,
    ExtensionContext,
    LogOutputChannel,
    WebviewPanel,
    Webview,
    Uri,
    workspace
} from "vscode";
import { DisposableLike } from "../../../shared/disposable";

import { assertNever } from "../../../shared/assert-never";

import { WebviewToCodeRequest, WebviewToCodeReply, isWebviewToCodeMessage, WebviewToCodeContentLoaded, WebviewToCodeCommand } from "../../../shared/webview-to-code";

import { CodeToWebviewEvent, CodeToWebviewReply } from "../../../shared/code-to-webview";

import * as constants from "../constants";

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export class MSBuildLogViewer implements DisposableLike {
    readonly disposables: DisposableLike[]
    constructor(readonly context: ExtensionContext, readonly webviewPanel: WebviewPanel, readonly out?: LogOutputChannel) {
        this.disposables = [];
        this.disposables.push(this._onWebviewReply = new EventEmitter<WebviewToCodeReply>());
        this.disposables.push(this._onWebviewRequest = new EventEmitter<WebviewToCodeRequest | WebviewToCodeCommand>());
    }

    private readonly _onWebviewReply: EventEmitter<WebviewToCodeReply>;

    private readonly _onWebviewRequest: EventEmitter<WebviewToCodeRequest | WebviewToCodeCommand>;

    get onWebviewReply(): Event<WebviewToCodeReply> {
        return this._onWebviewReply.event;
    }

    get onWebviewRequest(): Event<WebviewToCodeRequest | WebviewToCodeCommand> {
        return this._onWebviewRequest.event;
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
        this.disposables.length = 0;
    }

    async prepare(uri: Uri, onContentLoaded: (e: WebviewToCodeContentLoaded, documentReady: () => void) => void): Promise<void> {
        this.webviewPanel.webview.options = {
            enableScripts: true,
            enableCommandUris: [constants.command.startSearch]
        };
        const fsPath = uri.fsPath;
        const subscription = this.webviewPanel.webview.onDidReceiveMessage((e: WebviewToCodeContentLoaded) => {
            onContentLoaded(e, () => {
                subscription.dispose();
                this.webviewPanel.webview.onDidReceiveMessage((e) => this.onMessage(e));
                this.postToWebview({ type: 'init', fsPath });
            });
        });
        this.webviewPanel.webview.html = await this.getHtmlForWebview(this.webviewPanel.webview, uri, fsPath);
    }
    async getHtmlForWebview(webview: Webview, _uri: Uri, documentFilePath: string): Promise<string> {
        const scriptContent = await this.assetContent('webview.js', { kind: 'dist/webview' });
        // we embedded codicon in here
        const webviewCssContent = await this.assetContent('webview.css', { kind: 'dist/webview' });
        const nonce = getNonce();
        const html = /* html */ `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">

            <!--
            Use a content security policy to only allow loading images from https or from our extension directory,
            and only allow scripts that have a specific nonce.
            -->
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src data:; img-src ${webview.cspSource} blob:; style-src 'nonce-${nonce}' ${webview.cspSource} https:; script-src 'nonce-${nonce}';">

            <meta name="viewport" content="width=device-width, initial-scale=1.0">

            <style nonce="${nonce}">${webviewCssContent}</style>

            <title>MSBuild Log Viewer</title>
        </head>
        <body>
            <div id="content">
                <div id="grid-column-parent">
                    <div id="logview-root-node"></div>
                    <div id="side-view"></div>
                    <div id="status-line">Starting binlog viewer for ${documentFilePath}...</div>
                </div>
            </div>
            <script nonce="${nonce}">${scriptContent}</script>
        </body>
        </html>`;
        return html;
    }

    private async assetContent(assetFile: string, opts?: { kind?: string }): Promise<string> {
        const kind = opts?.kind ?? 'assets';
        const path = Uri.joinPath(this.context.extensionUri, kind, assetFile);
        const bytes = await workspace.fs.readFile(path);
        const decoder = new TextDecoder('utf-8');
        return decoder.decode(bytes);
    }

    private onMessage(e: WebviewToCodeRequest | WebviewToCodeReply | WebviewToCodeCommand) {
        if (isWebviewToCodeMessage(e)) {
            switch (e.type) {
                case 'ready':
                    this._onWebviewReply.fire(e);
                    break;
                case 'root':
                case 'node':
                case 'manyNodes':
                case 'summarizeNode':
                case 'nodeFullText':
                    this._onWebviewRequest.fire(e);
                    break;
                case 'nodeFullTextNoReply':
                    this._onWebviewRequest.fire(e);
                    break;
                case 'nodeBookmark':
                    this._onWebviewRequest.fire(e);
                    break
                default:
                    this.out?.warn(`unexpected response from webview ${(e as any).type}`)
                    assertNever(e);
            }
        }
    }

    postToWebview(message: CodeToWebviewEvent | CodeToWebviewReply) {
        this.webviewPanel.webview.postMessage(message);
    }
}