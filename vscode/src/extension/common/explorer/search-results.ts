import * as vscode from 'vscode';

import { Node, SearchResult } from "../../../shared/model";

import { DisposableLike } from "../../../shared/disposable";

import { SearchResultController } from "../controller";

export class SearchResultTreeItem extends vscode.TreeItem {
    private static defaultIcon = new vscode.ThemeIcon("inspect");
    constructor(unexplored: SearchResult, readonly node: Node, readonly controller: SearchResultController) {
        super(node.summary, vscode.TreeItemCollapsibleState.None);
        this.description = node.nodeKind;
        this.iconPath = SearchResultTreeItem.defaultIcon;
        this.command = {
            title: "Reveal node",
            command: "msbuild-structured-log-viewer.reveal-node",
            arguments: [this.controller, unexplored],
        };
    }
}

export async function getSearchResultTreeItem(element: SearchResult, controller: SearchResultController): Promise<SearchResultTreeItem> {
    const node = await controller.controller.document.requestNode(element.nodeId);
    const item = new SearchResultTreeItem(element, node.node, controller);
    return item;
}

export class SearchResultsTreeDataProvider implements vscode.TreeDataProvider<SearchResult>, DisposableLike {
    private readonly subscriptions: DisposableLike[] = [];
    private _onDidChangeTreeData: vscode.EventEmitter<SearchResult | undefined> = new vscode.EventEmitter<SearchResult | undefined>();
    private _controller: SearchResultController | null = null;

    dispose() {
        this.subscriptions.forEach(d => d.dispose());
        this.subscriptions.length = 0;
    }

    get controller(): SearchResultController | null {
        return this._controller;
    }

    set controller(value: SearchResultController | null) {
        vscode.commands.executeCommand('setContext', 'msbuild-structured-log-viewer.hasOverflowSearchResults', !!value);
        this._controller = value;
        this.controller?.onDidDispose(() => {
            // if the controller is disposed and we're currently showing it, clear the tree
            if (this.controller === value) {
                this.controller = null;
            }
        });
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

    getParent(_element: SearchResult): vscode.ProviderResult<SearchResult> {
        return null;
    }

    getTreeItem(element: SearchResult): Promise<vscode.TreeItem> {
        return getSearchResultTreeItem(element, this.controller!);
    }
}

