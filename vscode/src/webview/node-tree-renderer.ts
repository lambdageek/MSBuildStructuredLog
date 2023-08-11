
import { NodeId, Node, FullyExploredNode, SearchResult } from "../shared/model";

import { NodeRequester, requestFullText } from "./post-to-vs";

import { SideViewController } from "./side-view";

export class NodeTreeRenderer {
    private rootId: NodeId = -1;
    constructor(readonly nodeRequester: NodeRequester, readonly renderRoot: HTMLDivElement, readonly sideViewController: SideViewController) { }

    private highlightedNode: NodeId = -1;
    private openPath: NodeId[] = [];

    clearHighlight() {
        document.querySelectorAll('.highlighted').forEach((elem) => {
            elem.classList.remove('highlighted');
        });
        this.highlightedNode = -1;
        this.openPath = [];
    }

    highlight(ancestors: NodeId[], result: SearchResult<FullyExploredNode>) {
        const nodeId = result.nodeId.nodeId;
        this.highlightedNode = nodeId;
        this.openPath = ancestors;
    }

    setRootId(nodeId: NodeId) {
        this.rootId = nodeId;
    }

    get nodeMapper() {
        return this.nodeRequester.nodeMapper;
    }

    refresh() {
        if (this.rootId != -1) {
            this.renderRoot.replaceChildren();
            this.renderRoot.setAttribute('class', 'treeNode');
            this.paintNode(this.rootId, this.renderRoot, 'open');
        }
    }

    paintNode(nodeId: NodeId, container: HTMLElement, open?: 'open' | undefined) {
        const node = this.nodeMapper.find(nodeId);
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
                if (open === 'open' || this.openPath.includes(nodeId)) {
                    details.setAttribute('open', '');
                }
                const fullyExplored = node.fullyExplored ?? false;
                container.appendChild(details);
                if (!fullyExplored) {
                    details.addEventListener('toggle', async (ev) => {
                        if (details.getAttribute('open') === '') {
                            ev.preventDefault();
                            await this.nodeRequester.requestNodeSummary(nodeId);
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
            nodeSummary.dataset.nodeId = `${node.nodeId}`;
            const isHighlighted = this.highlightedNode === node.nodeId ? ' highlighted' : '';
            nodeSummary.setAttribute('class', `nodeSummary node-kind-${node.nodeKind}${isHighlighted}`);
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
        await this.nodeRequester.requestNodeSummary(nodeId);
        container.removeChild(button);
        this.paintNode(nodeId, container);
    }

    async onClickAbridgedDetails(node: Node): Promise<void> {
        const text = await requestFullText(node.nodeId); // FIXME: cache replies
        this.sideViewController.toggleSideview(node.nodeId);
        await this.sideViewController.setContent(node.nodeId, text);
    }

    private async ensureExplored(nodeIds: NodeId[]): Promise<void> {
        await Promise.all(nodeIds.map(async (nodeId) => {
            await this.nodeMapper.fullyExpore(nodeId);
        }));
    }

    async selectSearchResult(result: SearchResult<FullyExploredNode>): Promise<void> {
        const ancestors = result.ancestors;
        await this.ensureExplored(ancestors);
        this.highlight(ancestors, result);
        this.refresh();
        document.querySelector(`[data-node-id="${result.nodeId.nodeId}"]`)?.scrollIntoView();
    }

}
