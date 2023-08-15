import { Uri } from 'vscode';
import * as vscode from 'vscode';

import { NodeId } from '../../shared/model';
import { DisposableLike } from '../../shared/disposable';
import { SyncRequestDispatch } from '../../shared/sync-request';

import {
    WasmToCodeReply, WasmToCodeNodeReply, WasmToCodeManyNodesReply, WasmToCodeFullTextReply, WasmToCodeSearchResultsReply,
} from './wasm-to-code';
import { CodeToWasmCommand } from './code-to-wasm';

import { SubprocessState, SubprocessStateChangeEvent } from './subprocess/subprocess-state';
import { assertNever } from '../../shared/assert-never';


export abstract class AbstractMSBuildLogDocument implements vscode.CustomDocument {
    disposables: DisposableLike[] = [];
    readonly _requestDispatch: SyncRequestDispatch<WasmToCodeReply>;
    constructor(readonly uri: Uri, readonly out: vscode.LogOutputChannel) {
        this.disposables.push(this._requestDispatch = new SyncRequestDispatch<WasmToCodeReply>());
    }

    abstract get state(): SubprocessState;
    abstract isLive(): boolean;
    abstract get onStateChange(): vscode.Event<SubprocessStateChangeEvent>;

    dispose() {
        this.disposables.forEach(d => d.dispose());
        this.disposables.length = 0;
    }

    protected formatCommand(c: CodeToWasmCommand): string {
        let requestId = c.requestId;
        let command = c.command;
        let extra: string = '';
        switch (c.command) {
            case 'root':
                break;
            case 'node':
                extra = `${c.nodeId}\n`;
                break;
            case 'manyNodes':
                extra = `${c.nodeId}\n${c.count}\n`;
                break;
            case 'summarizeNode':
                extra = `${c.nodeId}\n`;
                break;
            case 'nodeFullText':
                extra = `${c.nodeId}\n`;
                break;
            case 'search':
                extra = `${c.query}\n`; // FIXME: escape query?
                break;
            default:
                assertNever(c);
                break;
        }
        return `${requestId}\n${command}\n${extra}`;
    }

    abstract postCommand(c: CodeToWasmCommand): Promise<void>;

    async requestRoot(): Promise<WasmToCodeNodeReply> {
        const [requestId, replyPromise] = this._requestDispatch.promiseReply<WasmToCodeNodeReply>();
        this.out.info(`requested root id=${requestId}`);
        await this.postCommand({ requestId, command: 'root' });
        const n = await replyPromise;
        if (n.type != 'node')
            throw Error(`expected reply type 'node', but got ${n.type}`);
        this.out.info(`god root id=${requestId} nodeId=${n.node.nodeId}`);
        return n;
    }

    async requestNode(nodeId: NodeId): Promise<WasmToCodeNodeReply> {
        const [requestId, replyPromise] = this._requestDispatch.promiseReply<WasmToCodeNodeReply>();
        this.out.info(`requested node id=${requestId} nodeId=${nodeId}`);
        await this.postCommand({ requestId, command: 'node', nodeId });
        const n = await replyPromise;
        if (n.type != 'node')
            throw Error(`expected reply type 'node', but got ${n.type}`);
        this.out.info(`got node requestId=${requestId} nodeId=${n.node.nodeId}`);
        return n;
    }

    async requestManyNodes(nodeId: NodeId, count: number): Promise<WasmToCodeManyNodesReply> {
        const [requestId, replyPromise] = this._requestDispatch.promiseReply<WasmToCodeManyNodesReply>();
        this.out.info(`requested id=${requestId}  ${count} nodes starting from nodeId=${nodeId}`);
        await this.postCommand({ requestId, command: 'manyNodes', nodeId, count });
        const n = await replyPromise;
        if (n.type != 'manyNodes')
            throw Error(`expected reply type 'node', but got ${n.type}`);
        this.out.info(`got many nodes requestId=${requestId} nodes.length=${n.nodes.length}`);
        return n;
    }

    async requestNodeSummary(nodeId: NodeId): Promise<WasmToCodeManyNodesReply> {
        const [requestId, replyPromise] = this._requestDispatch.promiseReply<WasmToCodeManyNodesReply>();
        this.out.info(`requested id=${requestId} node summary`);
        await this.postCommand({ requestId, command: 'summarizeNode', nodeId });
        const n = await replyPromise;
        if (n.type != 'manyNodes')
            throw Error(`expected reply type 'manyNodes', but got ${n.type}`);
        this.out.info(`got many nodes requestId=${requestId} nodes.length=${n.nodes.length}`);
        return n;
    }

    async requestNodeFullText(nodeId: NodeId): Promise<WasmToCodeFullTextReply> {
        const [requestId, replyPromise] = this._requestDispatch.promiseReply<WasmToCodeFullTextReply>();
        this.out.info(`requested id=${requestId} full text`);
        await this.postCommand({ requestId, command: 'nodeFullText', nodeId });
        const n = await replyPromise;
        if (n.type != 'fullText')
            throw Error(`expected reply type 'fullText', but got ${n.type}`);
        this.out.info(`got full text requestId=${requestId} fullText.length=${n.fullText.length}`);
        return n;
    }

    async requestSearch(query: string): Promise<WasmToCodeSearchResultsReply> {
        const [requestId, replyPromise] = this._requestDispatch.promiseReply<WasmToCodeSearchResultsReply>();
        this.out.info(`requested id=${requestId} search for ${query}`);
        await this.postCommand({ requestId, command: 'search', query });
        const n = await replyPromise;
        if (n.type != 'searchResults')
            throw Error(`expected reply type 'searchResults', but got ${n.type}`);
        this.out.info(`got search results requestId=${requestId} results.length=${n.results.length}`);
        return n;
    }

}

