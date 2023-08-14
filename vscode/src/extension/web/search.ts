
import * as vscode from 'vscode';

import { SearchResult } from '../../shared/model';
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
    controller: SearchResultController;
    query: string;
}

type OverviewItem = OverviewItemDocument | OverviewItemSearch;

class OverviewTreeDataProvider implements vscode.TreeDataProvider<OverviewItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<OverviewItem | undefined> = new vscode.EventEmitter<OverviewItem | undefined>();
    constructor(readonly searchResultsTreeDataProvider: SearchResultsTreeDataProvider) {
        activeLogViewers.onViewerAdded((controller) => {
            this._onDidChangeTreeData.fire(undefined);
            controller.onSearchAdded(() => {
                this._onDidChangeTreeData.fire(undefined); // FIXME: fire starting from the item for the controller
            });
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
            return element.controller.searches.map(s => {
                return { type: "search", controller: s, query: s.query };
            });
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
                const item = new vscode.TreeItem(element.query, vscode.TreeItemCollapsibleState.None);
                item.command = {
                    title: "Reveal search results",
                    command: "msbuild-structured-log-viewer.reveal-search-results",
                    arguments: [element.controller, this.searchResultsTreeDataProvider],
                };
                return item;
            }
        }
    }
}

class SearchResultsTreeDataProvider implements vscode.TreeDataProvider<SearchResult> {
    private _onDidChangeTreeData: vscode.EventEmitter<SearchResult | undefined> = new vscode.EventEmitter<SearchResult | undefined>();
    private _controller: SearchResultController | null = null;
    private _onControllerChanged = new vscode.EventEmitter<SearchResultController | null>();
    constructor() {
    }

    get controller(): SearchResultController | null {
        return this._controller;
    }

    set controller(value: SearchResultController | null) {
        this._controller = value;
        this._onControllerChanged.fire(value);
        this._onDidChangeTreeData.fire(undefined);
    }

    get onDidChangeTreeData(): vscode.Event<SearchResult | undefined> {
        return this._onDidChangeTreeData.event;
    }

    getChildren(element?: SearchResult): vscode.ProviderResult<SearchResult[]> {
        if (!this.controller)
            return [];
        if (!element) {
            return this.controller.results;
        }
        return []
    }

    getTreeItem(element: SearchResult): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return new vscode.TreeItem(element.nodeId.toString(), vscode.TreeItemCollapsibleState.None);
    }
}

async function registerOverview(): Promise<vscode.Disposable[]> {
    let subscriptions: vscode.Disposable[] = [];
    const searchResultsTreeDataProvider = new SearchResultsTreeDataProvider();
    subscriptions.push(vscode.window.registerTreeDataProvider("msbuild-structured-log-viewer.search-results", searchResultsTreeDataProvider));
    subscriptions.push(vscode.window.registerTreeDataProvider("msbuild-structured-log-viewer.overview", new OverviewTreeDataProvider(searchResultsTreeDataProvider)));
    return subscriptions;
}

async function runSearch(controller: MSBuildLogViewerController, query: string) {
    const search = controller.newSearch(query);
    const uri = controller.document.uri;
    vscode.window.showInformationMessage(`Searching for ${query} in ${uri.toString()}`);
    await search.run();
    vscode.window.showInformationMessage(`Found ${search.results.length} results for ${query} in ${uri.toString()}`);

}

async function revealSearchResults(controller: SearchResultController, treeDataProvider: SearchResultsTreeDataProvider) {
    treeDataProvider.controller = controller;
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
    context.subscriptions.push(... await registerOverview());
    context.subscriptions.push(vscode.commands.registerCommand('msbuild-structured-log-viewer.start-search', startNewSearch));
    context.subscriptions.push(vscode.commands.registerCommand('msbuild-structured-log-viewer.run-search', runSearch));
    context.subscriptions.push(vscode.commands.registerCommand('msbuild-structured-log-viewer.reveal-search-results', revealSearchResults));
}