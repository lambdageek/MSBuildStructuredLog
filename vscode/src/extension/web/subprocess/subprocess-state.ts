
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

