// this should create the dist directory
//@ts-check
const esbuild = require("esbuild");

/**
 * @typedef {import('esbuild').BuildOptions} BuildOptions
 */

/** @type BuildOptions */
const sharedWebOptions = {
  bundle: true,
  external: ["vscode"],
  target: "es2020",
  platform: "browser",
  sourcemap: true,
};

/** @type BuildOptions */
const webOptions = {
  entryPoints: ["src/extension/web/extension.ts"],
  outfile: "dist/web/extension.js",
  format: "cjs",
  ...sharedWebOptions,
};

/** @type BuildOptions */
const sharedDesktopOptions = {
  bundle: true,
  external: ["vscode"],
  target: "es2020",
  platform: "node",
  sourcemap: true,
};

/** @type BuildOptions */
const desktopOptions = {
  entryPoints: ["src/extension/web/extension.ts"],
  outfile: "dist/desktop/extension.js",
  format: "cjs",
  ...sharedDesktopOptions,
};

/** @type BuildOptions */
const sharedWebviewOptions = {
  bundle: true,
  external: [],
  target: "es2020",
  platform: "browser",
  sourecemap: true,
};

/** @type BuildOptions */
const webviewOptions = {
  entryPoints: ["src/webview/webview.ts"],
  outfile: "dist/webview/webview.js",
  format: "cjs",
  ...sharedWebviewOptions,
};

function createContexts() {
  return Promise.all([esbuild.context(webOptions), esbuild.context(desktopOptions), esbuild.context(webviewOptions)]);
}

createContexts()
  .then((contexts) => {
    if (process.argv[2] === "--watch") {
      const promises = [];
      for (const context of contexts) {
        promises.push(context.watch());
      }
      return Promise.all(promises).then(() => {
        return undefined;
      });
    } else {
      const promises = [];
      for (const context of contexts) {
        promises.push(context.rebuild());
      }
      Promise.all(promises)
        .then(async () => {
          for (const context of contexts) {
            await context.dispose();
          }
        })
        .then(() => {
          return undefined;
        })
        .catch(console.error);
    }
  })
  .catch(console.error);
