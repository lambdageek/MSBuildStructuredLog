
import { SearchResult } from '../shared/model';
import { LayoutController } from './layout-controller';
import { requestSearch } from './post-to-vs';

export class SearchController {
    constructor(readonly searchInput: HTMLInputElement, readonly searchButton: HTMLButtonElement,
        readonly searchResults: HTMLDivElement, readonly layoutController: LayoutController) {
        this.searchButton.addEventListener('click', () => this.onSearch());
        this.searchInput.addEventListener('keydown', (ev) => this.onKeyDown(ev));
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
            this.setSearchControlsActive(true);
            this.renderResults(results);
        } else {
            // toggle view to close search
            this.layoutController.closeSearchResults();
            this.searchResults.replaceChildren();
        }
    }

    renderResults(results: SearchResult[]) {
        this.searchResults.replaceChildren(document.createTextNode(`Found ${results.length} results`));
    }

    private onKeyDown(ev: KeyboardEvent) {
        if (ev.key === 'Enter') {
            this.onSearch();
            ev.preventDefault();
        }
    }
}

