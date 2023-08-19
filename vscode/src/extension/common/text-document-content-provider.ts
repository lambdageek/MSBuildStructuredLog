import * as vscode from 'vscode';

import { NodeId } from '../../shared/model';

import * as constants from './constants';
import { activeLogViewers } from './editor';
import { DocumentController } from './controller';

// TODO: do something better than this
const documents: vscode.Uri[] = [];

function getOrAssignId(uri: vscode.Uri): number {
    const index = documents.indexOf(uri);
    if (index >= 0) {
        return index;
    } else {
        documents.push(uri);
        return documents.length - 1;
    }
}

function lookupId(id: number): vscode.Uri | undefined {
    if (id < documents.length) {
        return documents[id];
    } else {
        return undefined;
    }
}

//function base64ToBytes(base64: string): Uint8Array {
//    const binString = atob(base64);
//    const bytes = [...binString].map((m: string) => m.codePointAt(0) as number);
//    return Uint8Array.from(bytes);
//}

// function bytesToBase64(bytes: Uint8Array): string {
//     const binString = Array.from(bytes, (x) => String.fromCodePoint(x)).join("");
//     return btoa(binString);
// }

// function uriToBase64(uri: vscode.Uri): string {
//     const enc = new TextEncoder();
//     const bytes = enc.encode(uri.toString());
//     if (typeof navigator !== 'undefined') {
//         return bytesToBase64(bytes);
//     } else {
//         return Buffer.from(bytes).toString('base64');
//     }
// }

// function base64ToUri(base64: string): vscode.Uri {
//     const dec = new TextDecoder();
//     if (typeof navigator !== 'undefined') {
//         return vscode.Uri.parse(dec.decode(base64ToBytes(base64)), true);
//     } else {
//         const buf = Buffer.from(base64, 'base64');
//         const str = dec.decode(buf);

//         const uri = vscode.Uri.parse(str, true);
//         return uri;
//     }
// }

class SnippetContentProvider implements vscode.TextDocumentContentProvider {
    constructor(_context: vscode.ExtensionContext) { }

    async provideTextDocumentContent(uri: vscode.Uri, _token: vscode.CancellationToken): Promise<string | null> {
        //const base64DocumentUri = uri.authority;
        //const documentUri = base64ToUri(base64DocumentUri);
        const documentUri = lookupId(Number.parseInt(uri.authority));
        if (!documentUri) {
            return null;
        }
        const nodeId = Number.parseInt(uri.query); // TODO: do we need a better query scheme?
        const documentController = activeLogViewers.getController(documentUri);
        if (!documentController) {
            return null;
        }
        // TODO: add a cache in the controller
        const reply = await documentController.documentController.document.requestNodeFullText(nodeId);
        const fullText = `Detailed ${decodeURIComponent(uri.fragment)}\nFrom ${documentUri.toString()}\n\n${reply.fullText}`;
        return fullText;
    }
}

export async function revealNodeFullText(documentController: DocumentController, nodeId: NodeId) {
    //const uri = vscode.Uri.parse(`${constants.uri.snippetScheme}://${uriToBase64(documentController.document.uri)}/?${nodeId}`, true);
    const node = await documentController.document.requestNode(nodeId);
    const descriptivePath = encodeURIComponent(`${documentController.document.uri.path.split('/').pop()}.details.txt`);
    const fragment = encodeURIComponent(`${node.node.nodeKind} - ${node.node.summary}`)
    let uri = vscode.Uri.parse(`${constants.uri.snippetScheme}://${getOrAssignId(documentController.document.uri)}/`, true);
    uri = uri.with({
        path: `/${descriptivePath}`,
        query: nodeId.toString(),
        fragment: fragment
    })
    let doc = await vscode.workspace.openTextDocument(uri); // calls back into the provider
    await vscode.window.showTextDocument(doc, { preview: true });
}

export async function activateTextDocumentContentProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(constants.uri.snippetScheme, new SnippetContentProvider(context)));
}