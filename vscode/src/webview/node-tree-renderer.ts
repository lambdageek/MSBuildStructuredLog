
import { NodeId, Node, FullyExploredNode, SearchResult } from "../shared/model";

import { NodeMapper } from "./node-mapper";
import { NodeRequester, requestFullText } from "./post-to-vs";

import { SideViewController } from "./side-view";

import { CodiconIconKind, getIconElement } from "./icon";

function nodeKindToCodicon(nodeKind: string): CodiconIconKind | null {
    switch (nodeKind) {
        case "Folder": return CodiconIconKind.Folder;
        default: return null;
    }
}

class HoverButtons {
    private lastHoveredSummary: HTMLParagraphElement | null = null;

    constructor(readonly nodeMapper: NodeMapper, readonly renderer: NodeTreeRenderer) { }

    installEventHandlers(renderRoot: HTMLElement) {
        renderRoot.addEventListener('mouseover', this.addHoverButtonsOnMouseover.bind(this));
    }

    addHoverButtonsOnMouseover(ev: MouseEvent) {
        const target = ev.target as HTMLElement;
        if (target.tagName == 'P' && target.dataset.nodeId && this.lastHoveredSummary !== target) {
            const prevHoveredSummary = this.lastHoveredSummary;
            this.lastHoveredSummary = target as HTMLParagraphElement;
            this.addHoverButtons(target as HTMLParagraphElement, target.dataset.nodeId);

            if (prevHoveredSummary) {
                this.removeHoverButtons(prevHoveredSummary);
            }
        }
    };

    addHoverButtons(target: HTMLParagraphElement, nodeIdData: string) {
        const nodeId = parseInt(nodeIdData);
        const node = this.nodeMapper.find(nodeId);
        //target.classList.add('hovering'); for debugging
        if (target.querySelector('.bookmark-widget') === null) {
            this.renderer.addBookmarkWidget(target as HTMLParagraphElement, node!);
        }
    }

    removeHoverButtons(prevTarget: HTMLParagraphElement) {
        const prevNodeId = parseInt(prevTarget.dataset.nodeId!);
        const prevNode = this.nodeMapper.find(prevNodeId);
        //prevTarget.classList.remove('hovering');
        if (prevNode === undefined || !prevNode.bookmarked) {
            prevTarget.removeChild(prevTarget.querySelector('.bookmark-widget')!);
        }
    }


}

interface FeatureFlags {
    bookmarks: boolean;
}

export class NodeTreeRenderer {
    private rootId: NodeId = -1;

    private readonly hoverButtons: HoverButtons;
    constructor(readonly nodeRequester: NodeRequester, readonly renderRoot: HTMLDivElement, readonly sideViewController: SideViewController, readonly features?: FeatureFlags) {
        if (features?.bookmarks) {
            this.hoverButtons = new HoverButtons(nodeRequester.nodeMapper, this);
            this.hoverButtons.installEventHandlers(renderRoot);
        } else {
            this.hoverButtons = null!;
        }
    }

    private highlightedNode: NodeId = -1;
    private openPath: NodeId[] = [];

    clearHighlight() {
        this.renderRoot.querySelectorAll('.highlighted').forEach((elem) => {
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
                spyglassSpan.setAttribute('class', 'spyglass codicon codicon-search');
                spyglassSpan.appendChild(document.createTextNode(/*' 🔍'*/'  '));
                nodeSummaryAbridged.appendChild(spyglassSpan);
                nodeSummaryAbridged.addEventListener('click', async () => this.onClickAbridgedDetails(node));
            }
            const nodeSummary = document.createElement('p');
            nodeSummary.dataset.nodeId = `${node.nodeId}`;
            const isHighlighted = this.highlightedNode === node.nodeId ? ' highlighted' : '';
            nodeSummary.setAttribute('class', `nodeSummary node-kind-${node.nodeKind}${isHighlighted}`);
            const icon = nodeKindToCodicon(node.nodeKind);
            if (icon) {
                nodeSummary.appendChild(getIconElement(icon, 'nodeKind'));
            } else {
                const nodeKindSpan = document.createElement('span');
                nodeKindSpan.setAttribute('class', 'nodeKind');
                nodeKindSpan.appendChild(document.createTextNode(node.nodeKind));
                nodeSummary.appendChild(nodeKindSpan);
            }
            nodeSummary.appendChild(document.createTextNode(node.summary));

            if (this.features?.bookmarks && node.bookmarked) {
                this.addBookmarkWidget(nodeSummary, node);
            }

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
        this.renderRoot.querySelector(`[data-node-id="${result.nodeId.nodeId}"]`)?.scrollIntoView();
    }

    toggleBookmark(node: Node) {
        // TODO this.nodeRequester.toggleBookmark
        if (node.bookmarked) {
            this.nodeMapper.bookmark(node.nodeId, false);
        } else {
            this.nodeMapper.bookmark(node.nodeId, true);
        }
    }

    setBookmarkWidgetContent(widget: HTMLSpanElement, bookmarked: boolean) {
        const text = bookmarked ? '🔖' : '📍';
        widget.replaceChildren(document.createTextNode(text));
    }

    addBookmarkWidget(target: HTMLParagraphElement, node: Node) {
        const bookmarkWidget = document.createElement('span');
        bookmarkWidget.classList.add('bookmark-widget');
        if (node.bookmarked) {
            bookmarkWidget.classList.add('bookmarked');
        }
        this.setBookmarkWidgetContent(bookmarkWidget, node.bookmarked ?? false);
        bookmarkWidget.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            this.toggleBookmark(node);
            this.setBookmarkWidgetContent(bookmarkWidget, node.bookmarked ?? false);
        });
        target.appendChild(bookmarkWidget);
    }


}
