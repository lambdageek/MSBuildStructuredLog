// @ts-check
/// <reference lib="es2021" />

const path = require("path");
const fs = require("fs");
const process = require("process");

if (process.argv.length !== 4) {
  console.error("Usage: node modify-package-json.js <source-dir> <staging-dir>");
  process.exit(1);
}
const sourceDir = process.argv[2];
const stagingDir = process.argv[3];

// replace extensionDependencies with web or desktop dependencies.

const webDependencies = ["ms-vscode.wasm-wasi-core"];
const desktopDependencies = ["ms-dotnettools.vscode-dotnet-runtime"];

/**
 *
 * @param {string} packageJsonPath
 * @param {'desktop' | 'web'} kind
 * @param {object} newDependencies
 * @param {string} destDir
 */
function createPackageJson(packageJsonPath, kind, newDependencies, destDir) {
  const packageJsonString = fs.readFileSync(packageJsonPath, "utf8");

  const packageJson = JSON.parse(packageJsonString);

  packageJson.extensionDependencies = newDependencies;

  switch (kind) {
    case "desktop":
      delete packageJson.browser;
      break;
    case "web":
      delete packageJson.main;
      break;
  }

  fs.mkdirSync(destDir, { recursive: true });

  let s = JSON.stringify(packageJson, null, "\t");
  s = s.replaceAll("\n", "\r\n");
  fs.writeFileSync(path.join(destDir, "package.json"), s, "utf-8");
}

const glob = require("glob");

const manifest = "**";
const ignore = fs
  .readFileSync(path.join(sourceDir, ".vscodeignore"), "utf8")
  .split("\n")
  .map((line) => line.replace(/[\r\n]*$/, ""))
  .map((line) => line.replace(/ *$/, ""))
  .filter((line) => line.length > 0 && !line.startsWith("#"))
  .map((line) => line.replace(/\/$/, "/**"));

for (const ignoreItem of ignore) {
  console.log(`ignoring ${ignoreItem}`);
}

/**
 *
 * @param {'web' | 'desktop'} kind
 */
function stage(kind) {
  const destDir = path.join(stagingDir, kind);
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  createPackageJson(
    path.join(sourceDir, "package.json"),
    kind,
    kind === "web" ? webDependencies : desktopDependencies,
    destDir
  );
  const otherKind = kind === "web" ? "desktop" : "web";
  const stagingIgnore = ignore.concat(["package.json", `dist/${otherKind}/**`]);
  for (const item of glob.globSync(manifest, { absolute: false, dot: true, cwd: sourceDir, ignore: stagingIgnore })) {
    console.log(`copying ${item}`);
    const source = path.join(sourceDir, item);
    const dest = path.join(destDir, item);
    if (fs.statSync(source).isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
    } else {
      fs.copyFileSync(source, dest);
    }
  }
}

stage("web");
stage("desktop");
