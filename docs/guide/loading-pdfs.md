# Load PDFs

Use the same `core.load()` method for a URL, local file bytes, password-protected documents, and automatic HTTP Range loading. Your UI chooses the source and presents progress or errors; Core owns the loading task and document lifecycle.

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

Core does not own the file picker. The bytes become part of the current document generation and are released when the document is replaced or the instance is destroyed.

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
const stop = core.viewer.subscribe(event => {
  if (event.type === 'loadProgress') {
    updateProgress(event.progress.percentage, event.progress.phase)
  }
})
```

The phase is `probing`, `downloading`, or `parsing`. Unknown totals use `null`; a Range-backed document can become ready before every byte has arrived.

## Ask for a password

```ts
core.viewer.subscribe(event => {
  if (event.type !== 'passwordRequired') return
  openPasswordDialog({
    reason: event.request.reason,
    submit: password => core.viewer.submitPassword(event.request.id, password),
    cancel: () => core.viewer.cancelPassword(event.request.id)
  })
})
```

Keep the same dialog open after an incorrect password and submit again with the new request state. Core never stores the password in snapshots or errors.

## Cancel or replace a load

```ts
await core.cancelLoad()
await core.load(nextSource)
```

A newer load wins and stale work cannot replace it. Map structured outcomes to product messages using [Error recovery](../error-recovery.md).
