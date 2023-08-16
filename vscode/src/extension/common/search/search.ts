
import * as vscode from 'vscode';

import { SearchResult } from '../../../shared/model';
import { ControllerGroup, activeLogViewers } from '../editor';
import { DocumentController, SearchResultController } from '../controller';
import { DisposableLike } from '../../../shared/disposable';

import { SearchResultsTreeDataProvider } from './search-results';

class SearchSideViewController implements DisposableLike {
    private readonly subscriptions: DisposableLike[] = [];
    constructor(readonly overviewTreeDataProvider: OverviewTreeDataProvider,
        readonly searchResultsTreeDataProvider: SearchResultsTreeDataProvider,
        readonly overviewTreeView: vscode.TreeView<OverviewItem>,
        readonly searchResultsTreeView: vscode.TreeView<SearchResult>) {
        this.subscriptions.push(overviewTreeDataProvider);
        this.subscriptions.push(overviewTreeView);
        this.subscriptions.push(searchResultsTreeDataProvider);
        this.subscriptions.push(searchResultsTreeView);
        this.subscriptions.push(vscode.commands.registerCommand('msbuild-structured-log-viewer.run-search', this.runSearch.bind(this)));
        this.subscriptions.push(vscode.commands.registerCommand('msbuild-structured-log-viewer.clear-search', this.clearSearch.bind(this)));
        this.subscriptions.push(vscode.commands.registerCommand('msbuild-structured-log-viewer.reveal-search-results', this.revealSearchResults.bind(this)));
        this.subscriptions.push(vscode.commands.registerCommand('msbuild-structured-log-viewer.reveal-node', this.revealSearchResultInEditor.bind(this)));

        this.subscriptions.push(activeLogViewers.onViewerDisposed(this.unsetSearchResultsControllerWhenEditorClosed.bind(this)));
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

    async revealSearchResultInEditor(controller: SearchResultController, result: SearchResult) {
        await controller.reveal(result);
    }

    async runSearch(controller: DocumentController, query: string): Promise<void> {
        const search = controller.newSearch(query);
        const uri = controller.document.uri;
        vscode.window.showInformationMessage(`Searching for ${query} in ${uri.toString()}`);
        await search.run();
        await this.revealSearchInOverview(search);
        await this.revealSearchResults(search, this.searchResultsTreeDataProvider);
        //vscode.window.showInformationMessage(`Found ${search.results.length} results for ${query} in ${uri.toString()}`);
    }

    async clearSearch(item: OverviewItemSearch) {
        item.controller.controller.removeSearch(item.controller);
    }

    unsetSearchResultsControllerWhenEditorClosed(closingController: ControllerGroup) {
        if (this.searchResultsTreeDataProvider.controller?.controller === closingController.documentController) {
            this.searchResultsTreeDataProvider.controller = null;
        }
    }


}

interface OverviewItemDocument {
    type: "document";
    controller: DocumentController;
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
            controller.documentController.onSearchAdded(() => {
                this._onDidChangeTreeData.fire(undefined); // FIXME: fire starting from the item for the controller
            });
            controller.documentController.onSearchRemoved(() => {
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
            return activeLogViewers.allControllers.map(d => ({ type: "document", controller: d.documentController }));
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
                item.contextValue = "search";
                return item;
            }
        }
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

async function startNewSearch(uri?: vscode.Uri | OverviewItemDocument): Promise<void> {
    let controller: DocumentController | undefined;
    if (isOverviewItemDocument(uri)) {
        controller = uri.controller;
    } else if (uri === undefined) {
        controller = activeLogViewers.activeController?.documentController;
    } else {
        controller = activeLogViewers.getController(uri)?.documentController;
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
}