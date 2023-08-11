
export class LayoutController {
    _sideViewOpen: boolean = false;
    _searchResultsOpen: boolean = false;
    constructor(readonly gridColumnParent: HTMLDivElement, readonly sideView: HTMLDivElement, readonly renderRoot: HTMLDivElement, readonly searchResults: HTMLDivElement) { }

    get sideViewOpen() {
        return this._sideViewOpen;
    }

    get searchResultsOpen() {
        return this._searchResultsOpen;
    }

    private classForState() {
        if (this.sideViewOpen && this.searchResultsOpen) {
            return 'side-view-open search-results-open';
        } else if (this.sideViewOpen) {
            return 'side-view-open search-results-closed';
        } else if (this.searchResultsOpen) {
            return 'side-view-closed search-results-open';
        } else {
            return 'side-view-closed search-results-closed';
        }
    }

    closeSideview() {
        this._sideViewOpen = false;
        this.gridColumnParent.setAttribute('class', this.classForState());
        this.sideView.style.display = 'none';
    }

    openSideview() {
        this._sideViewOpen = true;
        this.gridColumnParent.setAttribute('class', this.classForState());
        this.sideView.style.display = 'block';
    }

    closeSearchResults() {
        this._searchResultsOpen = false;
        this.gridColumnParent.setAttribute('class', this.classForState());
        this.searchResults.style.display = 'none';
    }

    openSearchResults() {
        this._searchResultsOpen = true;
        this.gridColumnParent.setAttribute('class', this.classForState());
        this.searchResults.style.display = 'block';
    }
}

