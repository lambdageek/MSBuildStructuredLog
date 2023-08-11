
import { NodeId, Node } from "../shared/model";

import { findNode } from "./node-mapper";

import { requestNodeSummary, requestFullText } from "./post-to-vs";

import { SideViewController } from "./side-view";

export class NodeTreeRenderer {
    private rootId: NodeId = -1;
    constructor(readonly renderRoot: HTMLDivElement, readonly sideViewController: SideViewController) { }

    setRootId(nodeId: NodeId) {
        this.rootId = nodeId;
    }

    refresh() {
        if (this.rootId != -1) {
            this.renderRoot.setAttribute('class', 'treeNode');
            this.paintNode(this.rootId, this.renderRoot, 'open');
        }
    }

    paintNode(nodeId: NodeId, container: HTMLElement, open?: 'open' | undefined) {
        const node = findNode(nodeId);
        if (node === undefined) {
            const button = document.createElement('button');
            button.setAttribute('type', 'button');
            button.addEventListener('click', () => this.onClickMissingNode(nodeId, container, button));
            button.textContent = `${nodeId}`;
            container.appendChild(button);
        } else {
            let childrenDest = container;
            let summaryDest = container;
            if (node.children && node.children.length > 0) {
                const details = document.createElement('details');
                if (open === 'open') {
                    details.setAttribute('open', '');
                }
                const fullyExplored = node.fullyExplored ?? false;
                container.appendChild(details);
                if (!fullyExplored) {
                    details.addEventListener('toggle', async (ev) => {
                        if (details.getAttribute('open') === '') {
                            ev.preventDefault();
                            await requestNodeSummary(nodeId);
                            container.removeChild(details);
                            this.paintNode(nodeId, container, 'open');
                        }
                    }, { once: true });
                }
                summaryDest = document.createElement('summary');
                details.appendChild(summaryDest);
                childrenDest = details;
            }
            let nodeSummaryAbridged: HTMLSpanElement | null = null;
            if (node.abridged) {
                nodeSummaryAbridged = document.createElement('span');
                nodeSummaryAbridged.setAttribute('class', 'nodeSummaryAbridged');
                const spyglassSpan = document.createElement('span');
                spyglassSpan.setAttribute('class', 'spyglass');
                spyglassSpan.appendChild(document.createTextNode(' 🔍'));
                nodeSummaryAbridged.appendChild(spyglassSpan);
                nodeSummaryAbridged.addEventListener('click', async () => this.onClickAbridgedDetails(node));
            }
            const nodeSummary = document.createElement('p');
            nodeSummary.setAttribute('class', `nodeSummary node-kind-${node.nodeKind}`);
            nodeSummary.innerHTML = `<span class='nodeKind'>${node.nodeKind}</span>${node.summary}`;
            if (nodeSummaryAbridged) {
                nodeSummary.appendChild(nodeSummaryAbridged);
            }
            summaryDest.appendChild(nodeSummary);
            if ((node.fullyExplored ?? false) && node.children && node.children.length > 0) {
                for (let i = 0; i < node.children.length; i++) {
                    const childBox = document.createElement('div');
                    childBox.setAttribute('class', 'treeNode');
                    childrenDest.appendChild(childBox);
                    this.paintNode(node.children[i], childBox);
                }
            }
        }
    }

    async onClickMissingNode(nodeId: NodeId, container: HTMLElement, button: HTMLButtonElement) {
        await requestNodeSummary(nodeId);
        container.removeChild(button);
        this.paintNode(nodeId, container);
    }

    async onClickAbridgedDetails(node: Node): Promise<void> {
        const text = await requestFullText(node.nodeId); // FIXME: cache replies
        this.sideViewController.toggleSideview(node.nodeId);
        await this.sideViewController.setContent(node.nodeId, text);
    }


}
