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

- [x] Instead of opening a fake "frame" in the webview, pop out a virtual document in VS Code.
   Maybe set some threshold for how long the string is.

### Breadcrumbs

- [ ] Navigate to ancestors of highlighted node

### Open source documents

- [ ] the .binlog either stores the document or it has the path. Add a gesture to open one or both

## Explorer

- [x] Rename the Search overview to "Log Explorer" or something like that

### Inline search results

- [x] If there are fewer than `N` search results, show them inline in the explorer tree

### Bookmarks

- [x] Allow pinning nodes in the webview and show those bookmarks in the explorer
- [ ] Allow unpinning bookmarks from the explorer
- [ ] Save bookmarks in the workspace state? Hash the binlog to validate that we're in the same file.
   Create some kind of stable uri scheme for nodes (node ids are not stable)

### Hierarchical search results

- [ ] Reuse engine's logic for including some context ancestor nodes in search results (eg conaining Project for a Task)

## Engine

### Keep up with upstream

- [ ] Upstream the WASI changes and depend on a nuget package

### Skip boring nodes; send richer summaries

- [x] de-emphasize skipped targets like the desktop viewer

### Cleaner display

- [ ] don't just use `toString` for node descriptions
- [ ] be more aggressive about sending abridged nodes (for example very long property values aren't abridged right now)

## Common

### Cleanup

- [ ] Remove unused messages
- [ ] Maybe make a uniform mechanism for batching requests
- [x] Split out hacks from `Node`: `bookmarked` and `fullyExplored` (and `ancestores`) are controller state, not model
- [ ] Rename `SearchResult` since it's re-used for bookmarks, too

### Create generic .NET desktop/wasi base extension

Make it easier to create other .NET-based desktop+web extensions by pulling out the common functionality of launching
a process and interacting with it.
