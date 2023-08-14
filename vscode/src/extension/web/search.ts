
import * as vscode from 'vscode';

import { activeLogViewers } from './editor-provider';
import { MSBuildLogViewerController } from './controller';

interface OverviewItemDocument {
    type: "document";
    controller: MSBuildLogViewerController;
}

function isOverviewItemDocument(x: unknown): x is OverviewItemDocument {
    return typeof x === "object" && x !== null && "type" in x && x["type"] === "document" && "controller" in x;
}

interface OverviewItemSearch {
    type: "search";
    parent: MSBuildLogViewerController;
    query: string;
}

type OverviewItem = OverviewItemDocument | OverviewItemSearch;

class OverviewTreeDataProvider implements vscode.TreeDataProvider<OverviewItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<OverviewItem | undefined> = new vscode.EventEmitter<OverviewItem | undefined>();
    constructor() {
        activeLogViewers.onViewerAdded(() => this._onDidChangeTreeData.fire(undefined));
        activeLogViewers.onViewerDisposed(() => this._onDidChangeTreeData.fire(undefined));
    }

    get onDidChangeTreeData(): vscode.Event<OverviewItem | undefined> {
        return this._onDidChangeTreeData.event;
    }

    getChildren(element?: OverviewItem): vscode.ProviderResult<OverviewItem[]> {
        if (!element) {
            return activeLogViewers.allControllers.map(d => ({ type: "document", controller: d }));
        }
        return [];
    }
    getTreeItem(element: OverviewItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        switch (element.type) {
            case "document": {
                const item = new vscode.TreeItem(
                    element.controller.document.uri,
                    vscode.TreeItemCollapsibleState.Expanded);
                item.contextValue = "document";
                return item;
            };

            case "search": {
                return new vscode.TreeItem(element.query, vscode.TreeItemCollapsibleState.None);
            }
        }
    }
}


async function registerOverview(): Promise<vscode.Disposable> {
    return vscode.window.registerTreeDataProvider("msbuild-structured-log-viewer.overview", new OverviewTreeDataProvider());
}

async function startNewSearch(uri?: vscode.Uri | OverviewItemDocument): Promise<void> {
    if (isOverviewItemDocument(uri)) {
        uri = uri.controller.document.uri;
    }
    if (uri === undefined) {
        uri = activeLogViewers.activeDocument?.uri;
        if (uri === undefined) {
            vscode.window.showErrorMessage("No active document");
            return;
        }
    }
    const fsPath = uri.fsPath;
    var input = await vscode.window.showInputBox({
        title: "Search...",
        value: "$error",
        prompt: `Enter search term for ${fsPath}`,
        placeHolder: "Enter search term",
    });
    if (input === undefined)
        return;
    vscode.commands.executeCommand('msbuild-structured-log-viewer.run-search', uri, input);
}

export async function activateSearch(context: vscode.ExtensionContext) {
    context.subscriptions.push(await registerOverview());
    context.subscriptions.push(vscode.commands.registerCommand('msbuild-structured-log-viewer.start-search', startNewSearch));

}