import { Uri } from 'vscode';
import * as vscode from 'vscode';

import { AbstractMSBuildLogDocument, MSBuildLogDocumentFactory } from '../document';
import { MSBuildLogViewer } from './viewer';
import { EditorController, DocumentController } from '../controller';
import { activeLogViewers } from './active-views';

class EditorProvider implements vscode.CustomReadonlyEditorProvider<AbstractMSBuildLogDocument> {

    public static async register(context: vscode.ExtensionContext, documentFactory: MSBuildLogDocumentFactory): Promise<vscode.Disposable> {
        const logOutputChannelName = 'MSBuild Log View';
        const out = vscode.window.createOutputChannel(logOutputChannelName, { log: true });
        //await vscode.commands.executeCommand('workbench.action.setLogLevel', logOutputChannelName, 'Trace');
        if (typeof process === 'object') {
            out.info(`node version ${process.version}`);
        }

        return vscode.window.registerCustomEditorProvider(EditorProvider.viewType,
            new EditorProvider(context, documentFactory, out),
            {
                webviewOptions: {
                    // enableFindWidget: true,
                    retainContextWhenHidden: true /* FIXME: don't do this */
                }
            }
        );
    }

    public static readonly viewType = 'msbuild-structured-log.base';

    constructor(private readonly context: vscode.ExtensionContext, private readonly documentFactory: MSBuildLogDocumentFactory, readonly out: vscode.LogOutputChannel) { }

    async openCustomDocument(uri: Uri, _openContext: vscode.CustomDocumentOpenContext, _token: vscode.CancellationToken): Promise<AbstractMSBuildLogDocument> {
        return await this.documentFactory(this.context, uri, this.out);
    }

    async resolveCustomEditor(document: AbstractMSBuildLogDocument, webviewPanel: vscode.WebviewPanel, _token: vscode.CancellationToken): Promise<void> {
        const viewer = new MSBuildLogViewer(this.context, webviewPanel, this.out);
        const documentController = new DocumentController(this.context, document, this.out);
        const editorController = new EditorController(viewer, documentController, this.out);
        activeLogViewers.add({ editorController, documentController });
        await viewer.prepare(document.uri,
            (e, documentReady) => editorController.onContentLoaded(e, documentReady)
        );
    }

}

export async function activateEditorProvider(context: vscode.ExtensionContext, documentFactory: MSBuildLogDocumentFactory): Promise<vscode.Disposable> {
    context.subscriptions.push(activeLogViewers.onFirstViewerOpened((_controller) => {
        vscode.commands.executeCommand('setContext', 'msbuild-structured-log-viewer-isOpen', true);
    }));
    context.subscriptions.push(activeLogViewers.onLastViewerClosed((_controller) => {
        vscode.commands.executeCommand('setContext', 'msbuild-structured-log-viewer-isOpen', false);
    }));
    return await EditorProvider.register(context, documentFactory);
}