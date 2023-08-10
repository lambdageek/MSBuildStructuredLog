
import { NodeId } from "../shared/model";

export class SideViewController {
    private sideViewOpen: false | { nodeId: NodeId } = false;
    constructor(readonly sideView: HTMLDivElement, readonly gridColumnParent: HTMLDivElement) { }

    closeSideview() {
        this.gridColumnParent.setAttribute('class', 'side-view-closed');
        this.sideView.style.display = 'none';
        this.sideViewOpen = false;
    }

    toggleSideview(nodeId: NodeId) {
        // if the view is currently open and showing the same node, close it
        // otherwise open it to the new node
        if (this.sideViewOpen && this.sideViewOpen.nodeId === nodeId) {
            this.closeSideview();
        } else {
            this.gridColumnParent.setAttribute('class', 'side-view-open');
            this.sideView.style.display = 'block';
            this.sideViewOpen = { nodeId };
        }
    }

    async setContent(nodeId: NodeId, text?: string): Promise<void> {
        if (!text) {
            this.sideView.innerHTML = `<p>Showing details for Node ${nodeId}</p>`;
        } else {
            const pre = document.createElement('pre');
            pre.setAttribute('class', 'side-view-full-text');
            pre.appendChild(document.createTextNode(text));
            this.sideView.replaceChildren(pre);
        }
    }
}
