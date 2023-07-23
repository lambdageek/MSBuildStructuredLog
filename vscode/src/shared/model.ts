export interface LogModel {
    rootNode: Node;
}

export interface Node {
    id: number;
    children: Node[];
}
