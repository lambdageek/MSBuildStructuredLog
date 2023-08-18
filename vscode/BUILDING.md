# Building and hacking

## Testing the WASI version

### Prerequisites

1. Install .NET 8 Preview 6 or later.
2. Install the upstream WASI SDK for your platform <https://github.com/WebAssembly/wasi-sdk/releases>
3. Set the environment variable `WASI_SDK_PATH` to the location of the SDK
3. Install the `wasi-experimental` workload: `dotnet workload install wasi-experimental`
4. Install Node.js and NPM

### Building and testing

1. `cd vscode`
2. `npm install`
   This should download and install the JS prerequisites
3. `npm run build`
   This will build the C# component `src/StructuredLogViewer.VsCode.Engine` for both desktop (targeting .NET 7) and WASI (targeting .NET 8).
   It will also build and bundle the TypeScript code and CSS.
4. To test the browser version of the plugin running locally: `npm run test-browser`.
   This will download `vscode-test-web` and open a new Chromium instance with a local copy of VS Code for Web with the extension already loaded.  By default the `test-browser` script opens the current directory as a workspace.  Click on `vscode/example/example.binlog`.
   In the `MSBuild Log View` output window you should see a message near the top that it is using the "WASI engine"
5. To test on <https://insiders.vscode.dev>, follow the instructions [Test your web extension on vscode.dev](https://code.visualstudio.com/api/extension-guides/web-extensions#test-your-web-extension-in-vscode.dev) to set up a certificates.  Then run `npm run test-web` (you may need to adjust the paths to the certificates) and go to <https://insiders.vscode.dev/> and open this GitHub repo (or another workspace with .binlog files) and then open the Command Palette and run the command `Developer: Install Extension from Location...` and paste in the URL from the `npm run test-web` output.
