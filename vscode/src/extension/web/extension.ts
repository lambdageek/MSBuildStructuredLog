
import type { ExtensionContext } from "vscode";
//import type { LogModel } from "../../shared/model";
//import { commands, ExtensionContext, Uri, window, workspace } from 'vscode';
//import { /*ProcessOptions,*/ Wasm } from '@vscode/wasm-wasi';

import { MSBuildLogViewerReadonlyEditorProvider } from "./MSBuildLogViewerReadonlyEditorProvider";


export async function activate(context: ExtensionContext) {
    context.subscriptions.push(await MSBuildLogViewerReadonlyEditorProvider.register(context));
    /*const _wasm: Wasm = await Wasm.load();*/
    // commands.registerCommand('testbed-dotnet.run', async () => {
    // 	const pty = wasm.createPseudoterminal();
    // 	const debugOut = window.createOutputChannel('.NET WASI Hello');
    // 	const terminal = window.createTerminal({ name: '.NET WASI Hello', pty, isTransient: true });
    // 	terminal.show(true);
    // 	try {
    // 		const rootFileSystem = await wasm.createRootFileSystem([
    // 			{ kind: 'workspaceFolder' }
    // 		]);
    // 		const options: ProcessOptions = {
    // 			stdio: pty.stdio,
    // 			rootFileSystem
    // 		};
    // 		const path = Uri.joinPath(context.extensionUri, 'dist', 'dotnet-wasi-hello.wasm');
    // 		const wasiWasm = await workspace.fs.readFile(path);
    // 		const module = await WebAssembly.compile(wasiWasm);
    // 		let s = "";
    // 		for (const exp of WebAssembly.Module.exports(module)) {
    // 			s += exp.name + '\n';
    // 		}
    // 		debugOut.appendLine('WASI module exports:\n' + s + 'end of exports');
    // 		const process = await wasm.createProcess('dotnet-wasi-hello', module, options);
    // 		await process.run();
    // 	} catch (err: any) {
    // 		void window.showErrorMessage(err.message);
    // 	}
    // });
}

export function deactivate() {
}
