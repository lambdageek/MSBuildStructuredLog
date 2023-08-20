export interface LogModel {
    rootNode: Node;
}
export type NodeId = number;

// Node comes from the document, NodeDecoration is the state of the node in the UI
export interface Node {
    nodeId: NodeId;
    summary: string;
    abridged?: boolean;
    nodeKind: string;
    children?: NodeId[];
}

export interface NodeDecoration {
    nodeId: NodeId;
    fullyExplored: boolean;
    bookmarked: boolean;
}

export interface SearchResult<T = NodeId> {
    nodeId: T;
    ancestors: NodeId[];
}