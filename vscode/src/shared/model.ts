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

export interface SearchResult {
    nodeId: NodeId;
    ancestors: NodeId[];
}