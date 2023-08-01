import { Uri } from 'vscode';
import * as vscode from 'vscode';

import { openMSBuildLogDocument, MSBuildLogDocument } from './MSBuildLogDocument';
import { MSBuildLogViewer } from './viewer';
import { MSBuildLogViewerController } from './controller';

export class MSBuildLogViewerReadonlyEditorProvider implements vscode.CustomReadonlyEditorProvider<MSBuildLogDocument> {
    public static async register(context: vscode.ExtensionContext): Promise<vscode.Disposable> {
        const logOutputChannelName = 'MSBuild Log View';
        const out = vscode.window.createOutputChannel(logOutputChannelName, { log: true });
        //await vscode.commands.executeCommand('workbench.action.setLogLevel', logOutputChannelName, 'Trace');
        if (typeof process === 'object') {
            out.info(`node version ${process.version}`);
        }

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
        const controller = new MSBuildLogViewerController(this.context, document, viewer, this.out);
        await viewer.prepare(document.uri.fsPath,
            (e, documentReady) => controller.onContentLoaded(e, documentReady)
        );
    }

}

