import { Uri } from 'vscode';
import * as vscode from 'vscode';
import { openMSBuildLogDocument, MSBuildLogDocument, WasmState } from './MSBuildLogDocument';

interface WebviewResponse {
    type: string;
}

function assertNever(_x: never): never {
    throw Error("should not happen");
}

function isWebviewResponse(x: unknown): x is WebviewResponse {
    return (typeof (x) === 'object') && (x as WebviewResponse).type !== 'undefined';
}

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
        const subscription = webviewPanel.webview.onDidReceiveMessage((e) => {
            if (e.type === 'ready') {
                MSBuildLogViewerReadonlyEditorProvider.out.info('got ready event back from webview');
                subscription.dispose();
                webviewPanel.webview.onDidReceiveMessage((e) => this.onMessage(webviewPanel, document, e));
                webviewPanel.webview.postMessage({ type: 'init' });
            }
        });
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);
    }

    getHtmlForWebview(webview: vscode.Webview): string {
        const resetCssUri = this.assetUri(webview, 'reset.css');
        const vscodeCssUri = this.assetUri(webview, 'vscode.css');
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
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

            <meta name="viewport" content="width=device-width, initial-scale=1.0">

            <link href="${resetCssUri}" rel="stylesheet" />
            <link href="${vscodeCssUri}" rel="stylesheet" />

            <title>MSBuild Log Viewer</title>
        </head>
        <body>
            <h1>Hello</h1>
            <div id="main-app"></div>
            <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>`;
        return html;
    }

    private assetUri(webview: vscode.Webview, asset: string, opts?: { kind?: string }): Uri {
        const kind = opts?.kind ?? 'assets';
        return webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, kind, asset));
    }

    onMessage(webviewPanel: vscode.WebviewPanel, document: MSBuildLogDocument, e: unknown) {
        if (isWebviewResponse(e)) {
            switch (e.type) {
                case 'ready':
                    this.postStateChange(webviewPanel.webview, document.state);
                    if (document.isLive()) {
                        const stateChangeDisposable = document.onStateChange((ev) => this.postStateChange(webviewPanel.webview, ev.state, stateChangeDisposable));
                    }
                case 'root':
                case 'node':
                    this.onNodeRequest(webviewPanel, document, e as any);
                    break;
                default:
                    MSBuildLogViewerReadonlyEditorProvider.out.warn(`unexpected response from webview ${e.type}`)
            }
        }
    }

    async onNodeRequest(webviewPanel: vscode.WebviewPanel, document: MSBuildLogDocument, e: WebviewResponse & { type: 'root' | 'node' }): Promise<void> {
        switch (e.type) {
            case 'root': {
                const node = await document.requestRoot();
                MSBuildLogViewerReadonlyEditorProvider.out.info(`posting root to webview ${JSON.stringify(node)}`);
                webviewPanel.webview.postMessage(JSON.parse(JSON.stringify(node)));
                break;
            }
            case 'node': {
                const id = (e as any).nodeId;
                const node = await document.requestNode(id);
                MSBuildLogViewerReadonlyEditorProvider.out.info(`posting node ${id} to webview ${JSON.stringify(node)}`);
                webviewPanel.webview.postMessage(JSON.parse(JSON.stringify(node)));
                break;
            }
            default:
                assertNever(e.type);
        }
    }

    postStateChange(webview: vscode.Webview, state: WasmState, disposable?: vscode.Disposable) {
        switch (state) {
            case WasmState.READY:
                webview.postMessage({ type: 'ready' });
                break;
            case WasmState.SHUTTING_DOWN:
            case WasmState.TERMINATING:
            case WasmState.EXIT_SUCCESS:
                webview.postMessage({ type: 'done' });
                disposable?.dispose(); // unsubscribe
                break;
            case WasmState.EXIT_FAILURE:
                webview.postMessage({ type: 'faulted' });
                disposable?.dispose(); // unsubscribe
                break;
            default:
                /* ignore */
                break;
        }
    }
}

