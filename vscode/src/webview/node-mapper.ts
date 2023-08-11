import { NodeId, Node, FullyExploredNode, isFullyExploredNode } from "../shared/model";

export class NodeMapper {
    private readonly map = new Map<NodeId, Node>();

    public requestNodeSummary: (nodeId: NodeId) => Promise<void> = () => { throw new Error('requestNodeSummary not set'); };

    add(node: Node) {
        const fullyExplored = node.fullyExplored ?? false;
        if (fullyExplored || !this.map.has(node.nodeId))
            this.map.set(node.nodeId, node);
    }

    find(nodeId: NodeId): Node | undefined {
        return this.map.get(nodeId);
    }

    async fullyExpore(nodeId: NodeId): Promise<FullyExploredNode> {
        let node = this.find(nodeId);
        if (node !== undefined && isFullyExploredNode(node)) {
            return node;
        }

        await this.requestNodeSummary(nodeId);
        node = this.find(nodeId);
        if (node === undefined || !isFullyExploredNode(node))
            throw new Error(`Failed to fully explore node ${nodeId}`);
        return node;
    }
}
