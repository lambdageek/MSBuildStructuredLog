
import type { ExtensionContext } from 'vscode';

import { activateEditorProvider } from "./editor-provider";
import { activateSearch } from './search';


export async function activate(context: ExtensionContext) {
    await activateSearch(context);
    context.subscriptions.push(await activateEditorProvider(context));
}

export function deactivate() {
}
