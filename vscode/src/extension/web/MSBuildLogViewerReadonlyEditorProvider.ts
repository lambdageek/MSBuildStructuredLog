import { Uri } from 'vscode';
import * as vscode from 'vscode';

class MSBuildLogDocument implements vscode.CustomDocument {
    constructor(readonly uri: Uri) {
    }

    dispose() {
    }
}

export class MSBuildLogViewerReadonlyEditorProvider implements vscode.CustomReadonlyEditorProvider<MSBuildLogDocument> {
    static out: vscode.LogOutputChannel;
    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        MSBuildLogViewerReadonlyEditorProvider.out = vscode.window.createOutputChannel('MSBuild Log View', { log: true });

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

    constructor(private readonly _context: vscode.ExtensionContext) {

    }

    openCustomDocument(uri: Uri, _openContext: vscode.CustomDocumentOpenContext, _token: vscode.CancellationToken): MSBuildLogDocument | Thenable<MSBuildLogDocument> {
        return new MSBuildLogDocument(uri);
    }

    async resolveCustomEditor(document: MSBuildLogDocument, webviewPanel: vscode.WebviewPanel, _token: vscode.CancellationToken): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
            /*enableCommandUris: true*/
        };
        const subscription = webviewPanel.webview.onDidReceiveMessage((e) => {
            if (e.type === 'ready') {
                MSBuildLogViewerReadonlyEditorProvider.out.appendLine('got ready event back from webview');
                subscription.dispose();
                webviewPanel.webview.onDidReceiveMessage((e) => this.onMessage(document, e));
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
        return webview.asWebviewUri(Uri.joinPath(this._context.extensionUri, kind, asset));
    }

    onMessage(_document: MSBuildLogDocument, _e: any) {

    }
}

