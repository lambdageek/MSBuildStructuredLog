// This is the JS we will load into the webview

// import type { LogModel } from '../shared/model';

const vscode = acquireVsCodeApi<void>();

vscode.postMessage({ type: 'ready' });