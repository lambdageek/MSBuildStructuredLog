
import { NodeId, Node, SearchResult, NodeDecoration } from "../shared/model";

import { NodeMapper } from "./node-mapper";
import { NodeRequester, requestBookmarkStateChanged, requestRevealNodeFullText } from "./post-to-vs";

import { CodiconIconKind, getIconElement, replaceIconElement } from "./icon";

const nodeIcon: { [key: string]: CodiconIconKind } = {
    "AddItem": CodiconIconKind.GitPullRequestCreate,
    "Build": CodiconIconKind.Wrench,
    "CscTask": CodiconIconKind.SymbolClass,
    "CopyTask": CodiconIconKind.Files,
    "EntryTarget": CodiconIconKind.PlayCircle,
    "Error": CodiconIconKind.Warning,
    "Folder": CodiconIconKind.Folder,
    "Import": CodiconIconKind.DiffAdded,
    "Item": CodiconIconKind.SymbolVariable,
    "Message": CodiconIconKind.SymbolText,
    "Metadata": CodiconIconKind.SymbolEnumMember,
    "NoImport": CodiconIconKind.DiffIgnored,
    "Note": CodiconIconKind.Note,
    "Parameter": CodiconIconKind.SymbolField,
    "Project": CodiconIconKind.Project,
    "ProjectEvaluation": CodiconIconKind.SymbolRuler,
    "Property": CodiconIconKind.Tag,
    "RemoveItem": CodiconIconKind.GitPullRequestClosed,
    "Target": CodiconIconKind.Target,
    "Task": CodiconIconKind.Tasklist,
    "TimedNode": CodiconIconKind.Watch,
};

function nodeKindToCodicon(nodeKind: string): CodiconIconKind | null {
    return nodeIcon[nodeKind] ?? null;
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
            this.renderer.addBookmarkWidget(target as HTMLParagraphElement, node!.nodeId);
        }
    }

    removeHoverButtons(prevTarget: HTMLParagraphElement) {
        const prevNodeId = parseInt(prevTarget.dataset.nodeId!);
        const prevNode = this.nodeMapper.findDecoration(prevNodeId);
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
    constructor(readonly nodeRequester: NodeRequester, readonly renderRoot: HTMLDivElement, readonly features?: FeatureFlags) {
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

    highlight(ancestors: NodeId[], result: SearchResult<Node>) {
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

    addMissingNodeWidget(nodeId: NodeId, container: HTMLElement) {
        const button = document.createElement('button');
        button.setAttribute('type', 'button');
        button.addEventListener('click', () => this.onClickMissingNode(nodeId, container, button));
        button.textContent = `${nodeId}`;
        container.appendChild(button);
    }

    addAbridgedDetailsWidget(nodeSummary: HTMLParagraphElement, node: Node) {
        const nodeSummaryAbridged: HTMLSpanElement = document.createElement('span');
        nodeSummaryAbridged.setAttribute('class', 'nodeSummaryAbridged');
        const spyglassSpan = document.createElement('span');
        spyglassSpan.setAttribute('class', 'spyglass codicon codicon-search');
        spyglassSpan.appendChild(document.createTextNode(/*' 🔍'*/'  '));
        nodeSummaryAbridged.appendChild(spyglassSpan);
        nodeSummaryAbridged.addEventListener('click', async () => this.onClickAbridgedDetails(node));

        nodeSummary.appendChild(nodeSummaryAbridged);
    }

    addNodeSummary(node: Node, nodeDecoration?: NodeDecoration): HTMLParagraphElement {
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
        if (node.abridged) {
            this.addAbridgedDetailsWidget(nodeSummary, node);
        }
        if (this.features?.bookmarks && nodeDecoration?.bookmarked) {
            this.addBookmarkWidget(nodeSummary, node.nodeId);
        }
        if (node.isLowRelevance) {
            nodeSummary.classList.add('node-lowRelevance');
        }
        return nodeSummary;
    }

    paintNode(nodeId: NodeId, container: HTMLElement, open?: 'open' | undefined) {
        const node = this.nodeMapper.find(nodeId);
        const nodeDecoration = this.nodeMapper.findDecoration(nodeId);
        if (node === undefined) {
            this.addMissingNodeWidget(nodeId, container);
        } else {
            const nodeSummary = this.addNodeSummary(node, nodeDecoration);

            let summaryDest = container;
            if (node.children && node.children.length > 0) {
                const details = document.createElement('details');
                if (open === 'open' || this.openPath.includes(nodeId)) {
                    details.setAttribute('open', '');
                }
                container.appendChild(details);
                summaryDest = document.createElement('summary');
                details.appendChild(summaryDest);
                const fullyExplored = nodeDecoration?.fullyExplored ?? false;
                if (!fullyExplored) {
                    details.addEventListener('toggle', async (ev) => {
                        if (details.getAttribute('open') === '') {
                            ev.preventDefault();
                            await this.nodeRequester.requestNodeSummary(nodeId);
                            container.removeChild(details);
                            this.paintNode(nodeId, container, 'open');
                        }
                    }, { once: true });
                } else {
                    const childrenDest = details;
                    for (const childNodeId of node.children) {
                        const childBox = document.createElement('div');
                        childBox.setAttribute('class', 'treeNode');
                        childrenDest.appendChild(childBox);
                        this.paintNode(childNodeId, childBox);
                    }
                }
            }

            summaryDest.appendChild(nodeSummary);
        }
    }

    async onClickMissingNode(nodeId: NodeId, container: HTMLElement, button: HTMLButtonElement) {
        await this.nodeRequester.requestNodeSummary(nodeId);
        container.removeChild(button);
        this.paintNode(nodeId, container);
    }

    async onClickAbridgedDetails(node: Node): Promise<void> {
        await requestRevealNodeFullText(node.nodeId);
        //const text = await requestFullText(node.nodeId); // FIXME: cache replies
        // this.sideViewController.toggleSideview(node.nodeId);
        //await this.sideViewController.setContent(node.nodeId, text);
    }

    private async ensureExplored(nodeIds: NodeId[]): Promise<void> {
        await Promise.all(nodeIds.map(async (nodeId) => {
            await this.nodeMapper.fullyExpore(nodeId);
        }));
    }

    async selectSearchResult(result: SearchResult<Node>): Promise<void> {
        const ancestors = result.ancestors;
        await this.ensureExplored(ancestors);
        this.highlight(ancestors, result);
        this.refresh();
        this.renderRoot.querySelector(`[data-node-id="${result.nodeId.nodeId}"]`)?.scrollIntoView();
    }

    toggleBookmark(nodeId: NodeId) {
        // TODO this.nodeRequester.toggleBookmark
        const decoration = this.nodeMapper.findDecoration(nodeId);
        const wasBookmarked = decoration?.bookmarked ?? false;
        this.nodeMapper.bookmark(nodeId, !wasBookmarked);
        requestBookmarkStateChanged(nodeId, !wasBookmarked);
    }

    addBookmarkWidget(target: HTMLParagraphElement, nodeId: NodeId) {
        const decoration = this.nodeMapper.findDecoration(nodeId);
        const bookmarked = decoration?.bookmarked ?? false;
        const pin = bookmarked ? CodiconIconKind.Pinned : CodiconIconKind.Pin;
        const bookmarkWidget = getIconElement(pin, 'bookmark-widget');
        if (bookmarked) {
            bookmarkWidget.classList.add('bookmarked');
        }
        bookmarkWidget.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const decoration = this.nodeMapper.findDecoration(nodeId);
            const bookmarked = decoration?.bookmarked ?? false;
            const [oldKind, newKind] = bookmarked ? [CodiconIconKind.Pinned, CodiconIconKind.Pin] : [CodiconIconKind.Pin, CodiconIconKind.Pinned];
            replaceIconElement(bookmarkWidget, oldKind, newKind);
            this.toggleBookmark(nodeId);
        });
        target.appendChild(bookmarkWidget);
    }


}
