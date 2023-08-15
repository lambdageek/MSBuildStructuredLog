import * as vscode from 'vscode';
import { MSBuildLogViewerController } from '../controller';

class ActiveViewsImpl {
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

export type ActiveViews = InstanceType<typeof ActiveViewsImpl>;

export let activeLogViewers: ActiveViews = new ActiveViewsImpl();
