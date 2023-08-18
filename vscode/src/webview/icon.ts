
export enum CodiconIconKind {
    Add = "add",
    DiffAdded = "diff-added",
    DiffIgnored = "diff-ignored",
    Error = "error",
    Files = "files",
    FileSymlinkFile = "file-symlink-file",
    Folder = "folder",
    GitPullRequestClosed = "git-pull-request-closed",
    GitPullRequestCreate = "git-pull-request-create",
    Note = "note",
    Output = "output",
    Pin = "pin",
    Pinned = "pinned",
    PlayCircle = "play-circle",
    Project = "project",
    Search = "search",
    SymbolClass = "symbol-class",
    SymbolEnumMember = "symbol-enum-member",
    SymbolField = "symbol-field",
    SymbolRuler = "symbol-ruler",
    SymbolText = "symbol-text",
    SymbolVariable = "symbol-variable",
    Tag = "tag",
    Tasklist = "tasklist",
    Target = "target",
    Warning = "warning",
    Wrench = "wrench",
    Watch = "watch",
}

export function getIconElement(kind: CodiconIconKind, extraClasses?: string): HTMLElement {
    const span = document.createElement('span');
    span.setAttribute('class', `codicon codicon-${kind} ${extraClasses ? ' ' + extraClasses : ''}`);
    return span;
}