import * as vscode from 'vscode';
import { DocumentController, EditorController } from '../controller';

export interface ControllerGroup {
    documentController: DocumentController;
    editorController: EditorController;
}

class ActiveViewsImpl {
    private _activeController: ControllerGroup | undefined;
    private _allControllers: ControllerGroup[] = [];
    private _onFirstViewerOpened: vscode.EventEmitter<ControllerGroup> = new vscode.EventEmitter<ControllerGroup>();
    private _onLastViewerClosed: vscode.EventEmitter<ControllerGroup> = new vscode.EventEmitter<ControllerGroup>();
    private _onViewerAdded: vscode.EventEmitter<ControllerGroup> = new vscode.EventEmitter<ControllerGroup>();
    private _onViewerDisposed: vscode.EventEmitter<ControllerGroup> = new vscode.EventEmitter<ControllerGroup>();

    constructor() { }

    get activeController(): ControllerGroup | undefined {
        return this._activeController;
    }

    get activeWebviewPanel(): vscode.WebviewPanel | undefined {
        return this._activeController?.editorController.viewer.webviewPanel;
    }

    get onFirstViewerOpened(): vscode.Event<ControllerGroup> {
        return this._onFirstViewerOpened.event;
    }
    get onLastViewerClosed(): vscode.Event<ControllerGroup> {
        return this._onLastViewerClosed.event;
    }

    get onViewerAdded(): vscode.Event<ControllerGroup> {
        return this._onViewerAdded.event;
    }

    get onViewerDisposed(): vscode.Event<ControllerGroup> {
        return this._onViewerDisposed.event;
    }

    get allControllers(): ControllerGroup[] {
        return [...this._allControllers];
    }

    getController(uri: vscode.Uri): ControllerGroup | undefined {
        return this._allControllers.find(c => c.documentController.document.uri.toString() === uri.toString());
    }

    add(controller: ControllerGroup) {
        const first = this._allControllers.length === 0;
        const webviewPanel = controller.editorController.viewer.webviewPanel;
        this._activeController = controller;
        if (webviewPanel.active)
            vscode.commands.executeCommand('setContext', 'msbuild-structured-log-viewer.hasFocus', true);
        this._allControllers.push(controller);
        webviewPanel.onDidChangeViewState((e) => {
            if (e.webviewPanel.active) {
                vscode.commands.executeCommand('setContext', 'msbuild-structured-log-viewer.hasFocus', true);
                this._activeController = controller;
            } else if (this.activeWebviewPanel === e.webviewPanel) {
                this._activeController = undefined;
                vscode.commands.executeCommand('setContext', 'msbuild-structured-log-viewer.hasFocus', false);
            }
        });
        webviewPanel.onDidDispose(() => {
            if (this.activeWebviewPanel === webviewPanel) {
                this._activeController = undefined;
                vscode.commands.executeCommand('setContext', 'msbuild-structured-log-viewer.hasFocus', false);
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

export type ActiveViews = InstanceType<typeof ActiveViewsImpl>;

export let activeLogViewers: ActiveViews = new ActiveViewsImpl();
