import { NodeId } from '../../shared/model';

export interface CodeToDotnetCommandBase {
    requestId: number;
    command: string;
}

export interface CodeToDotnetRootCommand extends CodeToDotnetCommandBase {
    command: 'root';
}

export interface CodeToDotnetNodeCommand extends CodeToDotnetCommandBase {
    command: 'node';
    nodeId: NodeId;
}

export interface CodeToDotnetManyNodesCommand extends CodeToDotnetCommandBase {
    command: 'manyNodes';
    nodeId: NodeId;
    count: number;
}

export interface CodeToDotnetSummarizeNodeCommand extends CodeToDotnetCommandBase {
    command: 'summarizeNode';
    nodeId: NodeId;
}

export interface CodeToDotnetNodeFullTextCommand extends CodeToDotnetCommandBase {
    command: 'nodeFullText';
    nodeId: NodeId;
}

export interface CodeToDotnetSearchCommand extends CodeToDotnetCommandBase {
    command: 'search';
    query: string;
}

export interface CodeToDotnetGetNodeAncestorsCommand extends CodeToDotnetCommandBase {
    command: 'getNodeAncestors';
    nodeId: NodeId;
}

export type CodeToDotnetCommand =
    CodeToDotnetRootCommand
    | CodeToDotnetNodeCommand
    | CodeToDotnetManyNodesCommand
    | CodeToDotnetSummarizeNodeCommand
    | CodeToDotnetNodeFullTextCommand
    | CodeToDotnetSearchCommand
    | CodeToDotnetGetNodeAncestorsCommand
    ;

