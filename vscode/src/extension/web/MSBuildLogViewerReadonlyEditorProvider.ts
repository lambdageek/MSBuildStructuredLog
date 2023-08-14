import { Uri } from 'vscode';
import * as vscode from 'vscode';

import { openMSBuildLogDocument, MSBuildLogDocument } from './MSBuildLogDocument';
import { MSBuildLogViewer } from './viewer';
import { MSBuildLogViewerController } from './controller';


export class MSBuildLogViewerReadonlyEditorProvider implements vscode.CustomReadonlyEditorProvider<MSBuildLogDocument> {
    private static _activeWebviewPanel: vscode.WebviewPanel | undefined;
    private static _activeDocument: MSBuildLogDocument | undefined;

    public static get activeWebviewPanel(): vscode.WebviewPanel | undefined {
        return MSBuildLogViewerReadonlyEditorProvider._activeWebviewPanel;
    }

    public static get activeDocument(): MSBuildLogDocument | undefined {
        return MSBuildLogViewerReadonlyEditorProvider._activeDocument;
    };

    public static async register(context: vscode.ExtensionContext): Promise<vscode.Disposable> {
        const logOutputChannelName = 'MSBuild Log View';
        const out = vscode.window.createOutputChannel(logOutputChannelName, { log: true });
        //await vscode.commands.executeCommand('workbench.action.setLogLevel', logOutputChannelName, 'Trace');
        if (typeof process === 'object') {
            out.info(`node version ${process.version}`);
        }

        context.subscriptions.push(vscode.commands.registerCommand('msbuild-structured-log-viewer.run-search', async (uri: Uri, query: string) => {
            // FIXME: how to get the document from the URI?
            // FIXME: when to unset?
            vscode.commands.executeCommand('setContext', 'msbuild-structured-log-search-results-visible', true);
            vscode.window.showInformationMessage(`Searching for ${query} in ${uri.toString()}`);
        }));

        return vscode.window.registerCustomEditorProvider(MSBuildLogViewerReadonlyEditorProvider.viewType,
            new MSBuildLogViewerReadonlyEditorProvider(context, out),
            {
                webviewOptions: {
                    enableFindWidget: true,
                    retainContextWhenHidden: true /* FIXME: don't do this */
                }
            }
        );
    }

    public static readonly viewType = 'msbuild-structured-log.base';

    constructor(private readonly context: vscode.ExtensionContext, readonly out: vscode.LogOutputChannel) { }

    async openCustomDocument(uri: Uri, _openContext: vscode.CustomDocumentOpenContext, _token: vscode.CancellationToken): Promise<MSBuildLogDocument> {
        return await openMSBuildLogDocument(this.context, uri, this.out);
    }

    async resolveCustomEditor(document: MSBuildLogDocument, webviewPanel: vscode.WebviewPanel, _token: vscode.CancellationToken): Promise<void> {
        const viewer = new MSBuildLogViewer(this.context, webviewPanel, this.out);
        MSBuildLogViewerReadonlyEditorProvider._activeWebviewPanel = webviewPanel;
        MSBuildLogViewerReadonlyEditorProvider._activeDocument = document;
        webviewPanel.onDidChangeViewState((e) => {
            if (e.webviewPanel.active) {
                MSBuildLogViewerReadonlyEditorProvider._activeWebviewPanel = webviewPanel;
                MSBuildLogViewerReadonlyEditorProvider._activeDocument = document;
            } else if (MSBuildLogViewerReadonlyEditorProvider._activeWebviewPanel === e.webviewPanel) {
                MSBuildLogViewerReadonlyEditorProvider._activeWebviewPanel = undefined;
                MSBuildLogViewerReadonlyEditorProvider._activeDocument = undefined;
            }
        });
        webviewPanel.onDidDispose(() => {
            if (MSBuildLogViewerReadonlyEditorProvider._activeWebviewPanel === webviewPanel) {
                MSBuildLogViewerReadonlyEditorProvider._activeWebviewPanel = undefined;
                MSBuildLogViewerReadonlyEditorProvider._activeDocument = undefined;
            }
        });
        const controller = new MSBuildLogViewerController(this.context, document, viewer, this.out);
        await viewer.prepare(document.uri,
            (e, documentReady) => controller.onContentLoaded(e, documentReady)
        );
    }

}

