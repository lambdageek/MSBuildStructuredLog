export interface LogModel {
    rootNode: Node;
}
export type NodeId = number;

export interface Node {
    nodeId: NodeId;
    summary: string;
    fullyExplored?: boolean;
    abridged?: boolean;
    nodeKind: string;
    children?: NodeId[];
}

export interface FullyExploredNode extends Node {
    fullyExplored: true;
}

export function isFullyExploredNode(node: Node): node is FullyExploredNode {
    return node.fullyExplored === true;
}

export interface SearchResult<T = NodeId> {
    nodeId: T;
    ancestors: NodeId[];
}