import { NodeId, Node, NodeDecoration } from "../shared/model";



export class NodeMapper {
    private readonly mapNode = new Map<NodeId, Node>();
    private readonly mapDecoration = new Map<NodeId, NodeDecoration>();

    add(node: Node) {
        this.mapNode.set(node.nodeId, node);
    }

    updateDecoration(nodeId: NodeId, newDecoration: Partial<NodeDecoration>) {
        const prevDecoration = this.mapDecoration.get(nodeId);
        const mergedDecoration = {
            nodeId: nodeId,
            fullyExplored: newDecoration.fullyExplored ?? prevDecoration?.fullyExplored ?? false,
            bookmarked: newDecoration.bookmarked ?? prevDecoration?.bookmarked ?? false,
        }
        this.mapDecoration.set(nodeId, mergedDecoration);
    }

    find(nodeId: NodeId): Node | undefined {
        return this.mapNode.get(nodeId);
    }

    findDecoration(nodeId: NodeId): NodeDecoration | undefined {
        return this.mapDecoration.get(nodeId);
    }

    bookmark(nodeId: NodeId, bookmarked: boolean) {
        this.updateDecoration(nodeId, { bookmarked })
    }
}
