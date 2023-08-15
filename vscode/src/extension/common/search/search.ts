
import * as vscode from 'vscode';

import { SearchResult } from '../../../shared/model';
import { activeLogViewers } from '../editor/editor-provider';
import { MSBuildLogViewerController, SearchResultController } from '../controller';
import { DisposableLike } from '../../../shared/disposable';


class SearchSideViewController implements DisposableLike {
    private readonly subscriptions: DisposableLike[] = [];
    constructor(readonly overviewTreeDataProvider: OverviewTreeDataProvider,
        readonly searchResultsTreeDataProvider: SearchResultsTreeDataProvider,
        readonly overviewTreeView: vscode.TreeView<OverviewItem>,
        readonly searchResultsTreeView: vscode.TreeView<SearchResult>) {
        this.subscriptions.push(overviewTreeDataProvider);
        this.subscriptions.push(overviewTreeView);
        this.subscriptions.push(searchResultsTreeView);
        this.subscriptions.push(vscode.commands.registerCommand('msbuild-structured-log-viewer.run-search', this.runSearch.bind(this)));
        this.subscriptions.push(vscode.commands.registerCommand('msbuild-structured-log-viewer.reveal-search-results', this.revealSearchResults.bind(this)));
    }

    dispose() {
        this.subscriptions.forEach(d => d.dispose());
        this.subscriptions.length = 0;
    }

    async revealSearchInOverview(controller: SearchResultController) {
        await this.overviewTreeView.reveal({ type: "search", controller: controller }, { select: true, focus: false });
    }

    async revealSearchResults(controller: SearchResultController, treeDataProvider: SearchResultsTreeDataProvider) {
        treeDataProvider.controller = controller;
    }

    async runSearch(controller: MSBuildLogViewerController, query: string): Promise<void> {
        const search = controller.newSearch(query);
        const uri = controller.document.uri;
        vscode.window.showInformationMessage(`Searching for ${query} in ${uri.toString()}`);
        await search.run();
        await this.revealSearchInOverview(search);
        await this.revealSearchResults(search, this.searchResultsTreeDataProvider);
        //vscode.window.showInformationMessage(`Found ${search.results.length} results for ${query} in ${uri.toString()}`);
    }
}

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
}

type OverviewItem = OverviewItemDocument | OverviewItemSearch;

class OverviewTreeDataProvider implements vscode.TreeDataProvider<OverviewItem>, DisposableLike {
    private readonly subscriptions: DisposableLike[] = [];
    private _onDidChangeTreeData: vscode.EventEmitter<OverviewItem | undefined> = new vscode.EventEmitter<OverviewItem | undefined>();
    constructor(readonly searchResultsTreeDataProvider: SearchResultsTreeDataProvider) {
        this.subscriptions.push(activeLogViewers.onViewerAdded((controller) => {
            this._onDidChangeTreeData.fire(undefined);
            controller.onSearchAdded(() => {
                this._onDidChangeTreeData.fire(undefined); // FIXME: fire starting from the item for the controller
            });
        }));
        this.subscriptions.push(activeLogViewers.onViewerDisposed(() => this._onDidChangeTreeData.fire(undefined)));
    }

    dispose() {
        this.subscriptions.forEach(d => d.dispose());
        this.subscriptions.length = 0;
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

    getParent(element: OverviewItem): vscode.ProviderResult<OverviewItem> {
        if (isOverviewItemDocument(element)) {
            return null;
        }
        return { type: "document", controller: element.controller.controller };
    }

    getTreeItem(element: OverviewItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        switch (element.type) {
            case "document": {
                const item = new vscode.TreeItem(
                    element.controller.document.uri,
                    vscode.TreeItemCollapsibleState.Expanded);
                item.iconPath = new vscode.ThemeIcon("file");
                item.contextValue = "document";
                return item;
            };

            case "search": {
                const item = new vscode.TreeItem(element.controller.query, vscode.TreeItemCollapsibleState.None);
                if (element.controller.hasResults) {
                    item.description = `Found ${element.controller.resultsLength} results`;
                }
                item.iconPath = new vscode.ThemeIcon("search");
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

    getParent(_element: SearchResult<number>): vscode.ProviderResult<SearchResult<number>> {
        return null;
    }

    getTreeItem(element: SearchResult): vscode.TreeItem | Thenable<vscode.TreeItem> {
        const item = new vscode.TreeItem(element.nodeId.toString(), vscode.TreeItemCollapsibleState.None);
        item.command = {
            title: "Reveal node",
            command: "msbuild-structured-log-viewer.reveal-node",
            arguments: [this.controller, element],
        };
        return item;
    }
}

async function registerSideView(): Promise<SearchSideViewController> {
    const searchResultsTreeDataProvider = new SearchResultsTreeDataProvider();
    const overviewTreeDataProvider = new OverviewTreeDataProvider(searchResultsTreeDataProvider);
    const overviewTreeView = vscode.window.createTreeView("msbuild-structured-log-viewer.overview", { treeDataProvider: overviewTreeDataProvider });
    const searchResultsTreeView = vscode.window.createTreeView("msbuild-structured-log-viewer.search-results", { treeDataProvider: searchResultsTreeDataProvider });
    const controller = new SearchSideViewController(overviewTreeDataProvider, searchResultsTreeDataProvider, overviewTreeView, searchResultsTreeView);
    return controller;
}

async function revealNode(controller: SearchResultController, result: SearchResult) {
    await controller.controller.revealNode(result);
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
    context.subscriptions.push(await registerSideView());
    context.subscriptions.push(vscode.commands.registerCommand('msbuild-structured-log-viewer.start-search', startNewSearch));
    context.subscriptions.push(vscode.commands.registerCommand('msbuild-structured-log-viewer.reveal-node', revealNode));
}