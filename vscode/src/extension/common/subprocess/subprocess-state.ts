
/* application logic is responsible for changing state to READY and SHUTTING_DOWN
* based on interactinos with the app.
*/
export enum SubprocessState {
    LOADED,
    STARTED,
    READY,
    SHUTTING_DOWN,
    TERMINATING,
    EXIT_SUCCESS,
    EXIT_FAILURE,
}

export interface SubprocessStateChangeEvent {
    state: SubprocessState;
}


export function subprocessIsLive(state: SubprocessState): boolean {
    switch (state) {
        case SubprocessState.SHUTTING_DOWN:
        case SubprocessState.TERMINATING:
        case SubprocessState.EXIT_SUCCESS:
        case SubprocessState.EXIT_FAILURE:
            return false;
        default:
            return true;
    }
}
