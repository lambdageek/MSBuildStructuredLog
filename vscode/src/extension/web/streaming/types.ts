export type ChunkListener<T> = (chunk: T) => any;
export type ChunkListenerAndStream<T> = [ChunkListener<T>, ReadableStream<T>];
export type ByteChunkListener = ChunkListener<Uint8Array>;

