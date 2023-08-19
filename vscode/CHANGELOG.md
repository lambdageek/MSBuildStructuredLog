# Changes

## vNext

- Bookmarks

## v0.0.4

- Use VS Code icons for build log items, instead of emoji
- Show upto 10 search results per search inline in the Log Explorer
- Only show the Search Results view when there are 10 or more results in the selected search
- If a search is running for a long time, show a "Searching..." message in the Log Explorer
- Detailed information is now displayed in a normal text document tab in VS Code, not in an overlay inside the binlog document

## v0.0.3

- set `extensionKind: ["workspace", "ui"]` so that codespaces prefer to install the extension in the workspace. Installing in the browser runs into cross-origin isolation problems on Github Codespaces.

## v0.0.2

- Fix typos
- Use a proper nonce in the webview
- use dynamic `require()` instead of `await import()` in polyfills.
  If you had *v0.0.1* installed, you may need to manually uninstall the extension and reinstall it.
  Otherwise there are JS errors from the extension host when you try to open a `.binlog`

## v0.0.1

- Publish to Marketplace as a preview
