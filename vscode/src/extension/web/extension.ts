
import type { ExtensionContext } from 'vscode';

import { activateEditorProvider } from "../common/editor-provider";
import { activateSearch } from '../common/search';
import { openMSBuildLogDocumentWasi } from './MSBuildLogDocumentWasi';


export async function activate(context: ExtensionContext) {
    await activateSearch(context);
    context.subscriptions.push(await activateEditorProvider(context, openMSBuildLogDocumentWasi));
}

export function deactivate() {
}
