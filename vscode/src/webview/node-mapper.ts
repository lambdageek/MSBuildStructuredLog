import { NodeId, Node } from "../shared/model";

const nodeMap = new Map<NodeId, Node>();

export function addNodeToMap(node: Node) {
    const fullyExplored = node.fullyExplored ?? false;
    if (fullyExplored || !nodeMap.has(node.nodeId))
        nodeMap.set(node.nodeId, node);
}

export function findNode(nodeId: NodeId): Node | undefined {
    return nodeMap.get(nodeId);
}