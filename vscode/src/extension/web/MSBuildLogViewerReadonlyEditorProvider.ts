import { Uri } from 'vscode';
import * as vscode from 'vscode';

import { assertNever } from '../../shared/assert-never';
import { WasmState } from './wasm/engine';
import { openMSBuildLogDocument, MSBuildLogDocument } from './MSBuildLogDocument';

import { CodeToWebviewEvent, CodeToWebviewNodeReply, CodeToWebviewReply } from '../../shared/code-to-webview';

import { isWebviewToCodeMessage, WebviewToCodeRequest, WebviewToCodeReply } from '../../shared/webview-to-code';


export class MSBuildLogViewerReadonlyEditorProvider implements vscode.CustomReadonlyEditorProvider<MSBuildLogDocument> {
    static out: vscode.LogOutputChannel;
    public static async register(context: vscode.ExtensionContext): Promise<vscode.Disposable> {
        const logOutputChannelName = 'MSBuild Log View';
        MSBuildLogViewerReadonlyEditorProvider.out = vscode.window.createOutputChannel(logOutputChannelName, { log: true });
        //await vscode.commands.executeCommand('workbench.action.setLogLevel', logOutputChannelName, 'Trace');
        if (typeof process === 'object') {
            MSBuildLogViewerReadonlyEditorProvider.out.info(`node version ${process.version}`);
        }

        return vscode.window.registerCustomEditorProvider(MSBuildLogViewerReadonlyEditorProvider.viewType,
            new MSBuildLogViewerReadonlyEditorProvider(context),
            {
                webviewOptions: {
                    retainContextWhenHidden: true /* FIXME: don't do this */
                }
            }
        );
    }

    public static readonly viewType = 'msbuild-structured-log.base';

    constructor(private readonly context: vscode.ExtensionContext) { }

    async openCustomDocument(uri: Uri, _openContext: vscode.CustomDocumentOpenContext, _token: vscode.CancellationToken): Promise<MSBuildLogDocument> {
        return await openMSBuildLogDocument(this.context, uri, MSBuildLogViewerReadonlyEditorProvider.out);
    }

    async resolveCustomEditor(document: MSBuildLogDocument, webviewPanel: vscode.WebviewPanel, _token: vscode.CancellationToken): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
            /*enableCommandUris: true*/
        };
        const subscription = webviewPanel.webview.onDidReceiveMessage((e: WebviewToCodeReply) => {
            if (e.type === 'ready') {
                MSBuildLogViewerReadonlyEditorProvider.out.info('got ready event back from webview');
                subscription.dispose();
                webviewPanel.webview.onDidReceiveMessage((e: WebviewToCodeRequest | WebviewToCodeReply) => this.onMessage(webviewPanel, document, e));
                this.postToWebview(webviewPanel.webview, { type: 'init', fsPath: document.uri.fsPath });
            }
        });
        webviewPanel.webview.html = await this.getHtmlForWebview(webviewPanel.webview, document.uri.fsPath);
    }

    async getHtmlForWebview(webview: vscode.Webview, documentFilePath: string): Promise<string> {
        const resetCssContent = await this.assetContent('reset.css');
        const vscodeCssContent = await this.assetContent('vscode.css');
        const logviewerCssContent = await this.assetContent('logviewer.css');
        const resetCssUri = this.assetUri(webview, 'reset.css');
        const vscodeCssUri = this.assetUri(webview, 'vscode.css');
        const logviewerCssUri = this.assetUri(webview, 'logviewer.css');
        const scriptContent = await this.assetContent('webview.js', { kind: 'dist/webview' });
        const scriptUri = this.assetUri(webview, 'webview.js', { kind: 'dist/webview' });
        const nonce = "ABCDEF123";// FIXME
        const html = /* html */ `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">

            <!--
            Use a content security policy to only allow loading images from https or from our extension directory,
            and only allow scripts that have a specific nonce.
            -->
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob:; style-src 'nonce-${nonce}' ${webview.cspSource} https:; script-src 'nonce-${nonce}';">

            <meta name="viewport" content="width=device-width, initial-scale=1.0">

            <!-- link href="${resetCssUri}" rel="stylesheet" / -->
            <!-- link href="${vscodeCssUri}" rel="stylesheet" / -->
            <!-- link href="${logviewerCssUri}" rel="stylesheet" / -->
            <style nonce="${nonce}">${resetCssContent}</style>
            <style nonce="${nonce}">${vscodeCssContent}</style>
            <style nonce="${nonce}">${logviewerCssContent}</style>

            <title>MSBuild Log Viewer</title>
        </head>
        <body>
            <div id="main-app">Starting binlog viewer for ${documentFilePath}...</div>
            <div id="logview-root-node"></div>
            <!-- script nonce="${nonce}" src="${scriptUri}" --><!-- /script -->
            <script nonce="${nonce}">${scriptContent}</script>
        </body>
        </html>`;
        return html;
    }

    private assetUri(webview: vscode.Webview, asset: string, opts?: { kind?: string }): Uri {
        const kind = opts?.kind ?? 'assets';
        return webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, kind, asset));
    }

    private async assetContent(assetFile: string, opts?: { kind?: string }): Promise<string> {
        const kind = opts?.kind ?? 'assets';
        const path = Uri.joinPath(this.context.extensionUri, kind, assetFile);
        const bytes = await vscode.workspace.fs.readFile(path);
        const decoder = new TextDecoder('utf-8');
        return decoder.decode(bytes);
    }

    onMessage(webviewPanel: vscode.WebviewPanel, document: MSBuildLogDocument, e: WebviewToCodeRequest | WebviewToCodeReply) {
        if (isWebviewToCodeMessage(e)) {
            switch (e.type) {
                case 'ready':
                    this.postStateChange(webviewPanel.webview, document.state);
                    if (document.isLive()) {
                        const stateChangeDisposable = document.onStateChange((ev) => this.postStateChange(webviewPanel.webview, ev.state, stateChangeDisposable));
                    }
                    break;
                case 'root':
                case 'node':
                    this.onNodeRequest(webviewPanel, document, e);
                    break;
                default:
                    MSBuildLogViewerReadonlyEditorProvider.out.warn(`unexpected response from webview ${(e as any).type}`)
                    assertNever(e);
            }
        }
    }

    async onNodeRequest(webviewPanel: vscode.WebviewPanel, document: MSBuildLogDocument, e: WebviewToCodeRequest): Promise<void> {
        switch (e.type) {
            case 'root': {
                const requestId = e.requestId;
                const node = await document.requestRoot();
                const reply: CodeToWebviewNodeReply = {
                    type: 'node',
                    requestId,
                    ...node.node,
                };
                MSBuildLogViewerReadonlyEditorProvider.out.info(`posting root to webview ${JSON.stringify(reply)}`);
                this.postToWebview(webviewPanel.webview, reply);
                break;
            }
            case 'node': {
                const requestId = e.requestId;
                const id = e.nodeId;
                const node = await document.requestNode(id);
                const reply: CodeToWebviewNodeReply = {
                    type: 'node',
                    requestId,
                    ...node.node,
                }
                MSBuildLogViewerReadonlyEditorProvider.out.info(`posting node ${id} to webview ${JSON.stringify(reply)}`);
                this.postToWebview(webviewPanel.webview, reply);
                break;
            }
            default:
                assertNever(e);
        }
    }

    postToWebview(webview: vscode.Webview, message: CodeToWebviewEvent | CodeToWebviewReply) {
        webview.postMessage(message);
    }

    postStateChange(webview: vscode.Webview, state: WasmState, disposable?: vscode.Disposable) {
        switch (state) {
            case WasmState.LOADED:
            case WasmState.STARTED:
                /* ignore */
                break;
            case WasmState.READY:
                this.postToWebview(webview, { type: 'ready' });
                break;
            case WasmState.SHUTTING_DOWN:
            case WasmState.TERMINATING:
            case WasmState.EXIT_SUCCESS:
                this.postToWebview(webview, { type: 'done' });
                disposable?.dispose(); // unsubscribe
                break;
            case WasmState.EXIT_FAILURE:
                this.postToWebview(webview, { type: 'faulted' });
                disposable?.dispose(); // unsubscribe
                break;
            default:
                assertNever(state);
                break;
        }
    }
}

