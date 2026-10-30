# Live sessions

A person can turn an analysis into a **live session**: a public link that opens the same charts and
files in any browser, follows every change the owner makes while it lives, and is erased everywhere
one hour after the last activity. Nothing is ever uploaded unless the person asks for a link, and
everything that is uploaded is encrypted in the owner's app with a key the server never sees.

Three parts speak this protocol:

| Part | Where | Role |
|---|---|---|
| **Share service** | `packages/share-service`, a Cloudflare Worker with an R2 bucket and one Durable Object per session | Stores encrypted blobs, counts the hour, erases a session when it ends, tells viewers about new revisions |
| **Core** | `packages/daemon/internal/sharing`, in every binary | Encrypts and uploads (the owner), downloads and decrypts (a viewer); keeps which analyses are live |
| **Frontend** | `packages/ui-analyzer`, `stores/sharing` | The share button, the warning, the share panel, the online/local marks, the viewer's banner |

## Lifecycle

1. **Start.** The owner clicks *Share live*, reads the warning and confirms. The core creates a
   session on the share service, uploads every source file and the log, then publishes the first
   state. The link is `{service}/app/#/shared/{sessionId}/{key}`.
2. **Live.** Every change the owner makes to the analysis — a chart moved or merged, a color, the
   name, a source or a log added, the log mapping — is published again, a second or two after it
   settles. New files are uploaded first; files already online are never sent twice.
3. **Viewing.** Opening the link loads the web app, which joins the session: the core downloads
   and decrypts the files into the tab and creates the analysis there. A WebSocket tells the tab
   about each new revision, and the tab applies it. A viewer follows the owner: changes a viewer
   makes in their own tab are overwritten by the next revision.
4. **End.** One hour after the last activity — the owner publishing or uploading, or someone
   opening the link — the session's Durable Object alarm fires: every blob is deleted from R2, the
   object's storage is erased, and connected viewers are told the session ended. A viewer's tab then
   drops the analysis and its files. The owner can also end the session at once. The owner's app
   learns the session ended the next time it asks for its status, and from then on marks every file
   of the analysis local again.

Watching a session does not keep it alive: an open tab, the status polling of the owner and the
WebSocket are not activity.

## Encryption

- The key is 32 random bytes, used with AES-256-GCM. It travels in the link after `#`, which a
  browser never sends to a server, and is written base64url without padding (43 characters).
- Every blob is sealed as `nonce (12 random bytes) || ciphertext || tag (16 bytes)`.
- The additional data binds each blob to its place, so the server cannot swap one for another:
  - state: `rrd-analyzer/1/{sessionId}/state`
  - chunk: `rrd-analyzer/1/{sessionId}/files/{fileId}/{index}`
- Files are cut into chunks of **8 MiB** of plaintext (the last one shorter). An empty file is one
  empty chunk, so `chunkCount` is `max(1, ceil(size / 8 MiB))`.

## Identifiers

| Name | Shape | Chosen by |
|---|---|---|
| `sessionId` | 16 random bytes, base64url, 22 characters | the share service |
| `ownerToken` | 32 random bytes, base64url, 43 characters | the share service; it keeps only its SHA-256 |
| `fileId` | 16 random bytes, base64url, 22 characters | the owner's core, once per uploaded file |
| `index` | a chunk's position in its file, `0` to `65535` | the owner's core |

## The state

The plaintext of the state blob is this JSON. `files` lists the analysis' sources in the analysis'
order; sources are only ever appended, so a series keeps its identifier (`s0`, `s1`, …) on every
side.

```json
{
  "format": 1,
  "name": "checkout API, 12 March",
  "files": [{ "fileId": "…", "name": "cpu.rrd", "size": 123456, "chunkCount": 1 }],
  "canvas": [{ "seriesId": "s3", "label": "cpu user", "merged": [], "referenceLines": [] }],
  "libraryOrder": [{ "seriesId": "s3", "label": "cpu user" }],
  "seriesColors": [{ "seriesId": "s3", "label": "cpu user", "color": "#3366cc" }],
  "log": { "fileId": "…", "name": "service.ndjson", "size": 4096, "chunkCount": 1, "view": {} },
  "publishedAtMilliseconds": 1767225600000
}
```

`log` is `null` when the analysis has no log open. `view` is the frontend's own description of how
the log is read and shown (mapping, colors, hidden types, whether the track is shown); the core
carries it without reading it.

## Share service HTTP API

Everything is under `/api/sessions`. Writes carry `Authorization: Bearer {ownerToken}`; a missing
or wrong token is `403`. A session that never existed, has ended, or was ended is `404`. Bodies of
chunks and state are raw bytes (`application/octet-stream`).

| Method and path | Who | Activity | Answer |
|---|---|---|---|
| `POST /api/sessions` | owner | starts the hour | `201 { sessionId, ownerToken, expiresAtMilliseconds }` |
| `PUT /api/sessions/{id}/files/{fileId}/chunks/{index}` | owner | yes | `204` |
| `PUT /api/sessions/{id}/state` | owner | yes | `200 { revision, expiresAtMilliseconds }`, and every viewer is told |
| `GET /api/sessions/{id}/state` | viewer | yes | `200` the sealed state, headers `X-Session-Revision` and `X-Session-Expires-At` (milliseconds); `409` before the first state |
| `GET /api/sessions/{id}/files/{fileId}/chunks/{index}` | viewer | no | `200` the sealed chunk; `404` when it is not there |
| `GET /api/sessions/{id}` | anyone | no | `200 { revision, expiresAtMilliseconds }` |
| `GET /api/sessions/{id}/live` (WebSocket upgrade) | viewer | no | messages below |
| `DELETE /api/sessions/{id}` | owner | ends it | `204` |

Revisions count from `1`, the first state published. Uploading a chunk that already exists
replaces it. Limits, all refused with `413`: a chunk of more than `8 MiB + 28` bytes, a state of more
than `4 MiB`, a session holding more than `256 MiB` across its chunks, more than `256` files, or more
chunks than one per file plus the 32 full chunks its bytes can fill (`288`).
Malformed identifiers or indexes are `400`. Creating sessions is rate limited per client address
(`429`).

WebSocket messages, all JSON:

```json
{ "kind": "revision", "revision": 4, "expiresAtMilliseconds": 1767229200000 }
{ "kind": "renewed", "expiresAtMilliseconds": 1767229200000 }
{ "kind": "expired" }
```

`renewed` is sent when opening the link moves the expiry forward by at least a sixtieth of the
inactivity window (a minute, for the hour): reads right after the owner's last change leave it where
that change put it. `expired` is sent just before the socket is closed
with code `1000` because the session ended. Joining a socket for a session that does not exist
answers `404` and opens nothing.

## Core surface

The core speaks to the share service at the address it was built with: `SHARE_SERVICE_URL` at
build time (`-X …/internal/shared/shareservice.URL=…`) for the desktop and browser builds, and
`-share-service` for the development server. Without one, `GET /api/build` answers
`sharesSessions: false`, every route below answers `503`, and the frontend shows no share button.

| Route | Desktop binding | Answer |
|---|---|---|
| `GET /api/sessions` | `ListSessions()` | every live session this app owns, `SessionStatus[]`; sessions the service no longer knows are forgotten first |
| `POST /api/analyses/{id}/session` body `SessionPublication` | `StartSession(analysisID, publication)` | `201 SessionStatus` |
| `PUT /api/analyses/{id}/session` body `SessionPublication` | `PublishSession(analysisID, publication)` | `200 SessionStatus` |
| `GET /api/analyses/{id}/session` | `SessionStatus(analysisID)` | `200 SessionStatus`, `404` when the analysis is not live |
| `DELETE /api/analyses/{id}/session` | `EndSession(analysisID)` | `204` |
| `POST /api/shared-sessions` body `{ sessionId, key }` | — | `201 JoinedSession` |
| `POST /api/shared-sessions/{sessionId}/refresh` | — | `200 JoinedSession` |
| `DELETE /api/shared-sessions/{sessionId}` | — | `204`, the analysis and its files gone from the tab |

The last three exist only where files can be kept in memory: the browser edition. Elsewhere they
answer `501`.

Failures: `404` the session or analysis is gone, `400` a malformed link, `422` a link whose key does
not open the session or a source that cannot be read or is not an RRD database or dump, `413` the
session would be too large, `429` the share service is refusing new sessions for now, `502` the share
service could not be reached or answered something unexpected, `503` sharing is not configured.
The desktop bindings fail with the same statuses: the window's error formatter rejects a call with
`{ status, message }` instead of the message alone, so the page tells these failures apart the same
way in every edition.

```ts
type SessionPublication = {
  log: null | {
    name: string;
    content?: string;   // left out when the log is the one already published
    view: unknown;
  };
};

type SessionStatus = {
  analysisId: string;
  sessionId: string;
  link: string;
  revision: number;
  expiresAtMilliseconds: number;
  files: { name: string; path: string; online: boolean }[];  // the analysis' sources, in order
  log: null | { name: string; online: boolean };
};

type JoinedSession = {
  sessionId: string;
  analysisId: string;
  revision: number;
  expiresAtMilliseconds: number;
  liveUrl: string;     // wss://…/api/sessions/{sessionId}/live
  changed: boolean;    // a refresh that found nothing newer answers false
  log: null | {
    fileId: string;
    name: string;
    content?: string;   // left out when it is the log (same fileId) the previous answer carried
    view: unknown;
  };
};
```

A publication with no `content` for a log the session does not hold yet, or whose name differs
from the one published, is a `400`, and so is a `view` that is not JSON. Starting an analysis that
is already live publishes onto the same session, so the link already handed out keeps working.
A join carries the log's `content`, and a refresh carries it only when the log is a new one: the
frontend holds the text of the one before, and the core keeps no copy of it.

## Deploying the share service

See `packages/share-service/README.md`. In short: one R2 bucket, the Worker with its Durable Object
binding, the static site of `packages/ui-landing` served from the same Worker, and a lifecycle rule
on the bucket that deletes anything under `sessions/` after one day, in case an alarm never ran.
