export interface LogModel {
    rootNode: Node;
}
export type NodeId = number;

export interface Node {
    nodeId: NodeId;
    summary: string;
    fullyExplored?: boolean;
    nodeKind: string;
    children?: [NodeId];
}
