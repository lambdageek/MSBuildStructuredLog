
import type { ExtensionContext } from "vscode";

import { MSBuildLogViewerReadonlyEditorProvider } from "./MSBuildLogViewerReadonlyEditorProvider";


export async function activate(context: ExtensionContext) {
    context.subscriptions.push(await MSBuildLogViewerReadonlyEditorProvider.register(context));
}

export function deactivate() {
}
