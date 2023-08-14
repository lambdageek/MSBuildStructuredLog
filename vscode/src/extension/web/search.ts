
import * as vscode from 'vscode';

import { activeLogViewers } from './editor-provider';
import { MSBuildLogViewerController, SearchResultController } from './controller';


interface OverviewItemDocument {
    type: "document";
    controller: MSBuildLogViewerController;
}

function isOverviewItemDocument(x: unknown): x is OverviewItemDocument {
    return typeof x === "object" && x !== null && "type" in x && x["type"] === "document" && "controller" in x;
}

interface OverviewItemSearch {
    type: "search";
    controller: SearchResultController
    query: string;
}

type OverviewItem = OverviewItemDocument | OverviewItemSearch;

class OverviewTreeDataProvider implements vscode.TreeDataProvider<OverviewItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<OverviewItem | undefined> = new vscode.EventEmitter<OverviewItem | undefined>();
    constructor() {
        activeLogViewers.onViewerAdded((controller) => {
            this._onDidChangeTreeData.fire(undefined);
            controller.onSearchAdded(() => this._onDidChangeTreeData.fire(undefined)); // FIXME: fire starting from the item for the controller
        });
        activeLogViewers.onViewerDisposed(() => this._onDidChangeTreeData.fire(undefined));
    }

    get onDidChangeTreeData(): vscode.Event<OverviewItem | undefined> {
        return this._onDidChangeTreeData.event;
    }

    getChildren(element?: OverviewItem): vscode.ProviderResult<OverviewItem[]> {
        if (!element) {
            return activeLogViewers.allControllers.map(d => ({ type: "document", controller: d }));
        }
        if (isOverviewItemDocument(element)) {
            return element.controller.searches.map(s => ({ type: "search", controller: s, query: s.query }));
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

async function runSearch(controller: MSBuildLogViewerController, query: string) {
    controller.newSearch(query);
    const uri = controller.document.uri;
    vscode.window.showInformationMessage(`Searching for ${query} in ${uri.toString()}`);
}

async function startNewSearch(uri?: vscode.Uri | OverviewItemDocument): Promise<void> {
    let controller: MSBuildLogViewerController | undefined;
    if (isOverviewItemDocument(uri)) {
        controller = uri.controller;
    } else if (uri === undefined) {
        controller = activeLogViewers.activeController;
    } else {
        controller = activeLogViewers.getController(uri);
    }
    if (controller === undefined) {
        vscode.window.showErrorMessage("No active document");
        return;
    }
    uri = controller.document.uri;
    const fsPath = uri.fsPath;
    var input = await vscode.window.showInputBox({
        title: "Search...",
        value: "$error",
        prompt: `Enter search term for ${fsPath}`,
        placeHolder: "Enter search term",
    });
    if (input === undefined)
        return;
    vscode.commands.executeCommand('msbuild-structured-log-viewer.run-search', controller, input);
}

export async function activateSearch(context: vscode.ExtensionContext) {
    context.subscriptions.push(await registerOverview());
    context.subscriptions.push(vscode.commands.registerCommand('msbuild-structured-log-viewer.start-search', startNewSearch));
    context.subscriptions.push(vscode.commands.registerCommand('msbuild-structured-log-viewer.run-search', runSearch));
}