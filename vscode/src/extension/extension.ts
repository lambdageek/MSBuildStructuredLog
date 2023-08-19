
import type { ExtensionContext } from 'vscode';
import * as vscode from 'vscode';

import { activateEditorProvider } from "./common/editor";
import { activateSearch } from './common/explorer';
import { openMSBuildLogDocumentWasi } from './web/MSBuildLogDocumentWasi';
import { openMSBuildLogDocumentDesktopFactory } from './desktop/MSBuildLogDocumentDesktop';

function isWeb(): boolean {
    return typeof navigator !== 'undefined'; // on non-Web, extensions run in an extension host, which is a node environment
}

async function acquireDotNetRuntime(): Promise<string> {
    const res: any = await vscode.commands.executeCommand('dotnet.acquire', { version: '7.0', requestingExtensionId: 'lambdageek.msbuild-structuredlog-viewer' });
    return res.dotnetPath;
}

export async function activate(context: ExtensionContext) {
    await activateSearch(context);
    if (!isWeb()) {
        // await vscode.commands.executeCommand('dotnet.showAcquisitionLog');
        const dotnetPath = await acquireDotNetRuntime();
        context.subscriptions.push(await activateEditorProvider(context, openMSBuildLogDocumentDesktopFactory(dotnetPath)));
    } else {
        context.subscriptions.push(await activateEditorProvider(context, openMSBuildLogDocumentWasi));
    }
}

export function deactivate() {
}
