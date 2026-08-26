# Load PDFs

Use `core.load()` for PDFs from URLs or local files, including password-protected documents. For URLs, Core can also negotiate HTTP Range automatically.

> [!TIP] TIP
> Your UI chooses the source and presents progress or errors; Core owns the loading task and document lifecycle.

## Load a URL

```ts
await core.load({
  url: '/documents/review.pdf',
  range: 'auto'
})
```

`range: 'auto'` probes HTTP Range support and downloads large PDFs in byte chunks when possible. It falls back to a full request only when the server confirms that ranges are unsupported—not for ordinary network failures.

## Load a local file

```ts
const file = fileInput.files?.[0]
if (file) {
  await core.load({ data: new Uint8Array(await file.arrayBuffer()) })
}
```

Core does not own the file picker. The bytes are released when the document is replaced or the instance is destroyed.

## Send headers and credentials

```ts
await core.load({
  url: '/api/documents/42.pdf',
  range: 'auto',
  headers: { Authorization: `Bearer ${token}` },
  credentials: 'include'
})
```

Do not copy source URLs, authorization headers, or PDF contents into visible error messages or telemetry.

## Show loading progress

```ts
const stopProgress = core.viewer.subscribe(event => {
  if (event.type === 'loadProgress') {
    updateProgress(event.progress.percentage, event.progress.phase)
  }
})
```

The phase is `probing`, `downloading`, or `parsing`. When the total is unknown, `percentage` is `null`; a Range-backed document can become ready before every byte has arrived. Call `stopProgress()` during the same unmount cleanup that destroys `core`.

## Ask for a password

```ts
const stopPassword = core.viewer.subscribe(event => {
  if (event.type !== 'passwordRequired') return
  openPasswordDialog({
    reason: event.request.reason,
    submit: password => core.viewer.submitPassword(event.request.requestId, password),
    cancel: () => core.viewer.cancelPassword(event.request.requestId)
  })
})
```

After an incorrect password, update the existing dialog with the new request instead of opening another one. Core never stores the password in snapshots or errors. Call `stopPassword()` during unmount cleanup.

## Cancel or replace a load

```ts
await core.cancelLoad()
await core.load(nextSource)
```

A newer load wins and stale work cannot replace it. See [Error recovery](../error-recovery.md) to turn structured loading errors into product messages.
