
export type ResponseCallback<R> = (reply: R | PromiseLike<R>) => any;

interface PromiseControl<R> {
    resolve(reply: R | PromiseLike<R>): any;
    reject(reason?: any): any;
}

export class SyncRequestDispatch<R = any> {
    private readonly _requestDispatch: Map<number, PromiseControl<R>>;
    private _nextRequestId: number;
    constructor() {
        this._nextRequestId = 0;
        this._requestDispatch = new Map<number, PromiseControl<R>>();
    }

    satisfy(requestId: number, reply: R): void {
        const callbacks = this._requestDispatch.get(requestId);
        if (callbacks !== undefined) {
            this._requestDispatch.delete(requestId);
            queueMicrotask(() => callbacks.resolve(reply));
        }
    }

    promiseReply<S extends R = R>(): [number, Promise<S>] {
        const requestId = this._nextRequestId++;
        const promise = new Promise<S>((resolve, reject) => {
            this._requestDispatch.set(requestId, { resolve, reject });
        });
        return [requestId, promise];
    }

    dispose() {
        for (const v of this._requestDispatch.values()) {
            v.reject('disposing SyncRequestDispatch');
        }
        this._requestDispatch.clear();
    }
}