# Feature ideas

## Webview

### Use codicons instead of emoji

- [x] Use codicons for drawing UI
- [x] ~~Figure out why there are CSP problems with fetching resources from the extension in VS Code for the Web.~~
   (Alternately, inline codicons in a `data:` uri)

### Stateless webview

- [ ] Instead of drawing nodes in the webview, just send it html
- [ ] Try not to have `NodeMapper` in the webview - delegate all state management to the document.
- [ ] Allow VS Code to dispose the webview when hidden - export tree expanded/collapsed state

### Event handlers on the render root

- [ ] Don't attach click handlers to every summary

### Rework detailed node view

- [ ] Instead of opening a fake "frame" in the webview, pop out a virtual document in VS Code.
   Maybe set some threshold for how long the string is.

### Open source documents

- [ ] the .binlog either stores the document or it has the path. Add a gesture to open one or both

## Explorer

- [x] Rename the Search overview to "Log Explorer" or something like that

### Inline search results

- [x] If there are fewer than `N` search results, show them inline in the explorer tree

### Bookmarks

- [ ] Allow pinning nodes in the webview and show those bookmarks in the explorer
- [ ] Save bookmarks in the workspace state? Hash the binlog to validate that we're in the same file.
   Create some kind of stable uri scheme for nodes (node ids are not stable)

## Engine

### Skip boring nodes; send richer summaries

- [ ] de-emphasize skipped targets like the desktop viewer
- [ ] send parent nodes for search results
- [ ] don't just use `toString` for node descriptions
