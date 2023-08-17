
export enum CodiconIconKind {
    Add = "add",
    Folder = "folder",
    Search = "search",
}

export function getIconElement(kind: CodiconIconKind, extraClasses?: string): HTMLElement {
    const span = document.createElement('span');
    span.setAttribute('class', `codicon codicon-${kind} ${extraClasses ? ' ' + extraClasses : ''}`);
    return span;
}