
import type { ExtensionContext } from 'vscode';
import * as vscode from 'vscode';

import { MSBuildLogViewerReadonlyEditorProvider } from "./MSBuildLogViewerReadonlyEditorProvider";


export async function activate(context: ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('msbuild-structured-log-viewer.start-search', async (uri?: vscode.Uri) => {
        if (uri === undefined) {
            uri = MSBuildLogViewerReadonlyEditorProvider.activeDocument?.uri;
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
    }));
    context.subscriptions.push(await MSBuildLogViewerReadonlyEditorProvider.register(context));
}

export function deactivate() {
}
