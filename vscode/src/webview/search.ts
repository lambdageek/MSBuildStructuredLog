
import { SearchResult, FullyExploredNode } from '../shared/model';
import { LayoutController } from './layout-controller';
import { requestSearch } from './post-to-vs';
import { NodeMapper } from './node-mapper';

export class SearchController {
    constructor(readonly nodeMapper: NodeMapper, readonly searchInput: HTMLInputElement, readonly searchButton: HTMLButtonElement,
        readonly searchResults: HTMLDivElement, readonly layoutController: LayoutController) {
        this.searchButton.addEventListener('click', () => this.onSearch());
        this.searchInput.addEventListener('keydown', (ev) => this.onSearchInputKeyDown(ev));
    }

    onSearchResultSelected: (result: SearchResult<FullyExploredNode>) => any = () => { };

    clearSearchResults() {
        this.searchResults.replaceChildren();
    }

    onReady() {
        this.setSearchControlsActive(true);
    }

    private setSearchControlsActive(enable: boolean) {
        this.searchInput.disabled = !enable;
        this.searchButton.disabled = !enable;
    }

    private async onSearch() {
        const text = this.searchInput.value;
        if (text) {
            // toggle view to open search
            this.searchResults.replaceChildren(document.createTextNode(`Searching for ${text}...`));
            this.layoutController.openSearchResults();
            this.setSearchControlsActive(false);
            const results = await requestSearch(text);
            const resultSummary = await this.summarizeResults(results);
            this.setSearchControlsActive(true);
            this.renderResults(resultSummary);
        } else {
            // toggle view to close search
            this.layoutController.closeSearchResults();
            this.searchResults.replaceChildren();
        }
    }

    // ensure that the node in the results is fully explored
    summarizeResult(result: SearchResult): Promise<SearchResult<FullyExploredNode>> {
        return this.nodeMapper.fullyExpore(result.nodeId).then((n) => ({ ...result, nodeId: n }));
    }

    summarizeResults(results: SearchResult[]): Promise<SearchResult<FullyExploredNode>[]> {
        return Promise.all(results.map((result) => this.summarizeResult(result)));
    }

    renderResults(results: SearchResult<FullyExploredNode>[]) {
        const ul = document.createElement('ul');
        ul.setAttribute('class', 'search-results');
        ul.setAttribute('tabindex', '0');
        for (const result of results) {
            const li = document.createElement('li');
            li.setAttribute('class', 'search-result');
            li.setAttribute('tabindex', '-1');
            const text = document.createTextNode(`Node with id=${result.nodeId.nodeId} of kind ${result.nodeId.nodeKind}`);
            li.appendChild(text);
            li.addEventListener('click', () => {
                this.onSearchResultSelected(result);
            });
            ul.appendChild(li);
        }
        this.searchResults.replaceChildren(ul);
    }

    private onSearchInputKeyDown(ev: KeyboardEvent) {
        if (ev.key === 'Enter') {
            this.onSearch();
            ev.preventDefault();
        }
    }
}

