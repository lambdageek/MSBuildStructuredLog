
export namespace extension {
    export const publisher = 'lambdageek';
    export const name = 'msbuild-structured-log-viewer';
    export const id = `${publisher}.${name}`;
}
// contexts.  keep in sync with package.json
export namespace context {
    export const hasFocus = `${extension.name}.hasFocus`;
    export const isOpen = `${extension.name}.isOpen`;
    export const hasOverflowSearchResults = `${extension.name}.hasOverflowSearchResults`;
}

// commands.  keep in sync with package.json
export namespace command {
    export const startSearch = `${extension.name}.start-search`;
    export const revealDocumentInOverview = `${extension.name}.reveal-document-in-overview`;
    export const runSearch = `${extension.name}.run-search`;
    export const clearSearch = `${extension.name}.clear-search`;
    export const revealSearchResults = `${extension.name}.reveal-search-results`;
    export const revealNode = `${extension.name}.reveal-node`;
}
// views.  keep in sync with package.json
export namespace view {
    export const explorer = `${extension.name}.explorer`;
    export const searchResults = `${extension.name}.search-results`;
}

// document types.  keep in sync with package.json
export namespace viewType {
    export const editor = `${extension.name}.binlog`;
}