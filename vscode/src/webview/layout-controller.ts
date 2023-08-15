
export class LayoutController {
    _sideViewOpen: boolean = false;
    constructor(readonly gridColumnParent: HTMLDivElement, readonly sideView: HTMLDivElement, readonly renderRoot: HTMLDivElement) { }

    get sideViewOpen() {
        return this._sideViewOpen;
    }

    private classForState() {
        if (this.sideViewOpen) {
            return 'side-view-open';
        } else {
            return 'side-view-closed';
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
}

