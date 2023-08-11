
import { NodeId } from "../shared/model";
import { LayoutController } from "./layout-controller";

export class SideViewController {
    private sideViewNodeId: NodeId | null = null;
    constructor(readonly sideView: HTMLDivElement, readonly layoutController: LayoutController) { }


    toggleSideview(nodeId: NodeId) {
        // if the view is currently open and showing the same node, close it
        // otherwise open it to the new node
        if (this.layoutController.sideViewOpen && this.sideViewNodeId === nodeId) {
            this.layoutController.closeSideview();
            this.sideViewNodeId = null;
        } else {
            this.layoutController.openSideview();
            this.sideViewNodeId = nodeId;
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
