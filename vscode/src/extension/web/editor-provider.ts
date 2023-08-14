import { Uri } from 'vscode';
import * as vscode from 'vscode';

import { openMSBuildLogDocument, MSBuildLogDocument } from './MSBuildLogDocument';
import { MSBuildLogViewer } from './viewer';
import { MSBuildLogViewerController } from './controller';


class ActiveViews {
    private _activeController: MSBuildLogViewerController | undefined;
    private _allControllers: MSBuildLogViewerController[] = [];
    private _onFirstViewerOpened: vscode.EventEmitter<MSBuildLogViewerController> = new vscode.EventEmitter<MSBuildLogViewerController>();
    private _onLastViewerClosed: vscode.EventEmitter<MSBuildLogViewerController> = new vscode.EventEmitter<MSBuildLogViewerController>();
    private _onViewerAdded: vscode.EventEmitter<MSBuildLogViewerController> = new vscode.EventEmitter<MSBuildLogViewerController>();
    private _onViewerDisposed: vscode.EventEmitter<MSBuildLogViewerController> = new vscode.EventEmitter<MSBuildLogViewerController>();

    constructor() { }

    get activeController(): MSBuildLogViewerController | undefined {
        return this._activeController;
    }

    get activeWebviewPanel(): vscode.WebviewPanel | undefined {
        return this._activeController?.viewer.webviewPanel;
    }

    get onFirstViewerOpened(): vscode.Event<MSBuildLogViewerController> {
        return this._onFirstViewerOpened.event;
    }
    get onLastViewerClosed(): vscode.Event<MSBuildLogViewerController> {
        return this._onLastViewerClosed.event;
    }

    get onViewerAdded(): vscode.Event<MSBuildLogViewerController> {
        return this._onViewerAdded.event;
    }

    get onViewerDisposed(): vscode.Event<MSBuildLogViewerController> {
        return this._onViewerDisposed.event;
    }

    get allControllers(): MSBuildLogViewerController[] {
        return [...this._allControllers];
    }

    getController(uri: vscode.Uri): MSBuildLogViewerController | undefined {
        return this._allControllers.find(c => c.document.uri.toString() === uri.toString());
    }

    add(controller: MSBuildLogViewerController) {
        const first = this._allControllers.length === 0;
        const webviewPanel = controller.viewer.webviewPanel;
        this._activeController = controller;
        this._allControllers.push(controller);
        webviewPanel.onDidChangeViewState((e) => {
            if (e.webviewPanel.active) {
                this._activeController = controller;
            } else if (this.activeWebviewPanel === e.webviewPanel) {
                this._activeController = undefined;
            }
        });
        webviewPanel.onDidDispose(() => {
            if (this.activeWebviewPanel === webviewPanel) {
                this._activeController = undefined;
            }
            this._allControllers.splice(this._allControllers.indexOf(controller), 1);
            this._onViewerDisposed.fire(controller);
            if (this._allControllers.length === 0) {
                this._onLastViewerClosed.fire(controller);
            }
        });
        if (first) {
            this._onFirstViewerOpened.fire(controller);
        }
        this._onViewerAdded.fire(controller);
    }

}

export let activeLogViewers: ActiveViews = new ActiveViews();

class EditorProvider implements vscode.CustomReadonlyEditorProvider<MSBuildLogDocument> {

    public static async register(context: vscode.ExtensionContext): Promise<vscode.Disposable> {
        const logOutputChannelName = 'MSBuild Log View';
        const out = vscode.window.createOutputChannel(logOutputChannelName, { log: true });
        //await vscode.commands.executeCommand('workbench.action.setLogLevel', logOutputChannelName, 'Trace');
        if (typeof process === 'object') {
            out.info(`node version ${process.version}`);
        }

        return vscode.window.registerCustomEditorProvider(EditorProvider.viewType,
            new EditorProvider(context, out),
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
        activeLogViewers.add(controller);
        await viewer.prepare(document.uri,
            (e, documentReady) => controller.onContentLoaded(e, documentReady)
        );
    }

}

export async function activateEditorProvider(context: vscode.ExtensionContext): Promise<vscode.Disposable> {
    context.subscriptions.push(activeLogViewers.onFirstViewerOpened((_controller) => {
        vscode.commands.executeCommand('setContext', 'msbuild-structured-log-viewer-isOpen', true);
    }));
    context.subscriptions.push(activeLogViewers.onLastViewerClosed((_controller) => {
        vscode.commands.executeCommand('setContext', 'msbuild-structured-log-viewer-isOpen', false);
    }));
    return await EditorProvider.register(context);
}