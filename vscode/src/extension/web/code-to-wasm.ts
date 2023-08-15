import { NodeId } from '../../shared/model';

export interface CodeToWasmCommandBase {
    requestId: number;
    command: string;
}

export interface CodeToWasmRootCommand extends CodeToWasmCommandBase {
    command: 'root';
}

export interface CodeToWasmNodeCommand extends CodeToWasmCommandBase {
    command: 'node';
    nodeId: NodeId;
}

export interface CodeToWasmManyNodesCommand extends CodeToWasmCommandBase {
    command: 'manyNodes';
    nodeId: NodeId;
    count: number;
}

export interface CodeToWasmSummarizeNodeCommand extends CodeToWasmCommandBase {
    command: 'summarizeNode';
    nodeId: NodeId;
}

export interface CodeToWasmNodeFullTextCommand extends CodeToWasmCommandBase {
    command: 'nodeFullText';
    nodeId: NodeId;
}

export interface CodeToWasmSearchCommand extends CodeToWasmCommandBase {
    command: 'search';
    query: string;
}

export type CodeToWasmCommand =
    CodeToWasmRootCommand
    | CodeToWasmNodeCommand
    | CodeToWasmManyNodesCommand
    | CodeToWasmSummarizeNodeCommand
    | CodeToWasmNodeFullTextCommand
    | CodeToWasmSearchCommand
    ;

