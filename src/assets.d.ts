/** Asset URLs resolved by InkLayer Core's own Vite library build. */
declare module '*?url&no-inline' {
  const url: string
  export default url
}

/** Inline module Workers compiled into InkLayer Core's distributable chunks. */
declare module '*?worker&inline' {
  const WorkerFactory: {
    new (options?: WorkerOptions): Worker
  }
  export default WorkerFactory
}
