# Changes

## vNext

- Bookmarks
- set `extensionKind: ["workspace", "ui"]` so that codespaces prefer to install the extension in the workspace. Installing in the browser runs into cross-origin isolation problems on Github Codespaces.

## v0.0.2

- Fix typos
- Use a proper nonce in the webview
- use dynamic `require()` instead of `await import()` in polyfills.
  If you had *v0.0.1* installed, you may need to manually uninstall the extension and reinstall it.
  Otherwise there are JS errors from the extension host when you try to open a `.binlog`

## v0.0.1

- Publish to Marketplace as a preview
