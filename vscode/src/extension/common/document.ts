import { Uri } from 'vscode';
import * as vscode from 'vscode';

import { NodeId } from '../../shared/model';
import { DisposableLike } from '../../shared/disposable';
import { SyncRequestDispatch } from '../../shared/sync-request';

import {
    DotnetToCodeReply, DotnetToCodeEvent, DotnetToCodeNodeReply, DotnetToCodeManyNodesReply, DotnetToCodeFullTextReply, DotnetToCodeSearchResultsReply,
    isDotnetToCodeMessage,
} from './dotnet-to-code';
import { CodeToDotnetCommand } from './code-to-dotnet';

import { SubprocessState, SubprocessStateChangeEvent, subprocessIsLive } from './subprocess/subprocess-state';
import { assertNever } from '../../shared/assert-never';


export abstract class AbstractMSBuildLogDocument implements vscode.CustomDocument {
    disposables: DisposableLike[] = [];
    readonly _requestDispatch: SyncRequestDispatch<DotnetToCodeReply>;
    constructor(readonly uri: Uri, readonly out: vscode.LogOutputChannel) {
        this.disposables.push(this._requestDispatch = new SyncRequestDispatch<DotnetToCodeReply>());
    }

    abstract get state(): SubprocessState;
    isLive(): boolean { return subprocessIsLive(this.state); }
    abstract get onStateChange(): vscode.Event<SubprocessStateChangeEvent>;

    dispose() {
        this.disposables.forEach(d => d.dispose());
        this.disposables.length = 0;
    }

    protected formatCommand(c: CodeToDotnetCommand): string {
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

    abstract postCommand(c: CodeToDotnetCommand): Promise<void>;

    async requestRoot(): Promise<DotnetToCodeNodeReply> {
        const [requestId, replyPromise] = this._requestDispatch.promiseReply<DotnetToCodeNodeReply>();
        this.out.info(`requested root id=${requestId}`);
        await this.postCommand({ requestId, command: 'root' });
        const n = await replyPromise;
        if (n.type != 'node')
            throw Error(`expected reply type 'node', but got ${n.type}`);
        this.out.info(`god root id=${requestId} nodeId=${n.node.nodeId}`);
        return n;
    }

    async requestNode(nodeId: NodeId): Promise<DotnetToCodeNodeReply> {
        const [requestId, replyPromise] = this._requestDispatch.promiseReply<DotnetToCodeNodeReply>();
        this.out.info(`requested node id=${requestId} nodeId=${nodeId}`);
        await this.postCommand({ requestId, command: 'node', nodeId });
        const n = await replyPromise;
        if (n.type != 'node')
            throw Error(`expected reply type 'node', but got ${n.type}`);
        this.out.info(`got node requestId=${requestId} nodeId=${n.node.nodeId}`);
        return n;
    }

    async requestManyNodes(nodeId: NodeId, count: number): Promise<DotnetToCodeManyNodesReply> {
        const [requestId, replyPromise] = this._requestDispatch.promiseReply<DotnetToCodeManyNodesReply>();
        this.out.info(`requested id=${requestId}  ${count} nodes starting from nodeId=${nodeId}`);
        await this.postCommand({ requestId, command: 'manyNodes', nodeId, count });
        const n = await replyPromise;
        if (n.type != 'manyNodes')
            throw Error(`expected reply type 'node', but got ${n.type}`);
        this.out.info(`got many nodes requestId=${requestId} nodes.length=${n.nodes.length}`);
        return n;
    }

    async requestNodeSummary(nodeId: NodeId): Promise<DotnetToCodeManyNodesReply> {
        const [requestId, replyPromise] = this._requestDispatch.promiseReply<DotnetToCodeManyNodesReply>();
        this.out.info(`requested id=${requestId} node summary`);
        await this.postCommand({ requestId, command: 'summarizeNode', nodeId });
        const n = await replyPromise;
        if (n.type != 'manyNodes')
            throw Error(`expected reply type 'manyNodes', but got ${n.type}`);
        this.out.info(`got many nodes requestId=${requestId} nodes.length=${n.nodes.length}`);
        return n;
    }

    async requestNodeFullText(nodeId: NodeId): Promise<DotnetToCodeFullTextReply> {
        const [requestId, replyPromise] = this._requestDispatch.promiseReply<DotnetToCodeFullTextReply>();
        this.out.info(`requested id=${requestId} full text`);
        await this.postCommand({ requestId, command: 'nodeFullText', nodeId });
        const n = await replyPromise;
        if (n.type != 'fullText')
            throw Error(`expected reply type 'fullText', but got ${n.type}`);
        this.out.info(`got full text requestId=${requestId} fullText.length=${n.fullText.length}`);
        return n;
    }

    async requestSearch(query: string): Promise<DotnetToCodeSearchResultsReply> {
        const [requestId, replyPromise] = this._requestDispatch.promiseReply<DotnetToCodeSearchResultsReply>();
        this.out.info(`requested id=${requestId} search for ${query}`);
        await this.postCommand({ requestId, command: 'search', query });
        const n = await replyPromise;
        if (n.type != 'searchResults')
            throw Error(`expected reply type 'searchResults', but got ${n.type}`);
        this.out.info(`got search results requestId=${requestId} results.length=${n.results.length}`);
        return n;
    }

    abstract subprocessChangedApplicationState(newState: SubprocessState): void;

    gotStdOut(v: unknown) {
        this.out.info(`received from engine process: ${v}`);
        if (isDotnetToCodeMessage(v)) {
            const value = v as DotnetToCodeReply | DotnetToCodeEvent;
            switch (value.type) {
                case 'ready':
                    this.out.info(`engine process signalled Ready`);
                    this.subprocessChangedApplicationState(SubprocessState.READY);
                    break;
                case 'done':
                    this.out.info(`engine process signalled Done`);
                    this.subprocessChangedApplicationState(SubprocessState.SHUTTING_DOWN);
                    break;
                case 'node':
                case 'manyNodes':
                    const nodeReply = value as DotnetToCodeReply;
                    const requestId = nodeReply.requestId;
                    this._requestDispatch.satisfy(requestId, nodeReply);
                    break;
                case 'fullText':
                    const fullTextReply = value as DotnetToCodeFullTextReply;
                    const fullTextRequestId = fullTextReply.requestId;
                    this._requestDispatch.satisfy(fullTextRequestId, fullTextReply);
                    break;
                case 'searchResults':
                    const searchResultsReply = value as DotnetToCodeSearchResultsReply;
                    const searchResultsRequestId = searchResultsReply.requestId;
                    this._requestDispatch.satisfy(searchResultsRequestId, searchResultsReply);
                    break;
                default:
                    assertNever(value);
                    this.out.warn(`received unknown message from engine: ${(<any>value).type}`);
                    break;
            }
        }
    }
    gotStdErr(value: string) {
        this.out.error(value);
    }


}

export type MSBuildLogDocumentFactory = (context: vscode.ExtensionContext, uri: Uri, out: vscode.LogOutputChannel) => Promise<AbstractMSBuildLogDocument>
