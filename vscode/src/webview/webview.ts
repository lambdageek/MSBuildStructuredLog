// This is the JS we will load into the webview

// import type { LogModel } from '../shared/model';

const vscode = acquireVsCodeApi<void>();

window.addEventListener('message', (ev) => {
    switch (ev.data.type) {
        case 'init': {
            const div = document.getElementById('main-app');
            if (!div)
                throw new Error("no main-app!");
            div.innerHTML = "<h2>Initialized!!</h2>";
            break;
        }
        default:
            break;
    }
})

vscode.postMessage({ type: 'ready' });