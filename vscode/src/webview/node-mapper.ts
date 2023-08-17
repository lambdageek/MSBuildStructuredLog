import { NodeId, Node, FullyExploredNode, isFullyExploredNode } from "../shared/model";

export class NodeMapper {
    private readonly map = new Map<NodeId, Node>();

    public requestNodeSummary: (nodeId: NodeId) => Promise<void> = () => { throw new Error('requestNodeSummary not set'); };

    add(node: Node) {
        const fullyExplored = node.fullyExplored ?? false;
        const prev = this.map.get(node.nodeId);
        if (fullyExplored || prev === undefined) {
            this.map.set(node.nodeId, node);
            // FIXME: do we really want the source of truth in here?
            if (prev?.bookmarked) {
                node.bookmarked = true;
            }
        }
    }

    find(nodeId: NodeId): Node | undefined {
        return this.map.get(nodeId);
    }

    bookmark(nodeId: NodeId, bookmarked: boolean) {
        const node = this.find(nodeId);
        if (node === undefined) {
            return;
        }
        node.bookmarked = bookmarked;
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
