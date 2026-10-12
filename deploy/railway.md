# Railway / Railpack

Deploy this repository directly as one `intercode` service, Root Directory `/`,
builder Railpack. Do not select `/server`: the root Railpack plan builds both apps.
It installs the frontend and backend from their separate lockfiles, builds Vite
and starts `node server/src/index.js`. Node 22 is used for the build and runtime.

Set `PORT=8090`, `DATA_DIR=/data`, `STATIC_DIR=/app/dist`, `NODE_ENV=production`.
Attach a persistent volume at `/data`, use `/api/healthz` as the deployment
healthcheck, keep one replica and disable sleep. The server serves the frontend,
API and WebSocket from one origin; leave `VITE_API_BASE` and `VITE_WS_BASE` unset.
Optionally add `VITE_APP_NAME=MyInterview` to the Railway service's Variables to
customize the name in the page header and browser tab title (default: `IntQst`). This frontend setting
is read at build time; rebuild/redeploy after changes. The build step explicitly
includes `VITE_APP_NAME` in its cache dependencies, preserving Railpack's generated
defaults, as described in the [Railpack documentation](https://railpack.com/architecture/secrets).
Restore `sessions/`, `docs/` and `telemetry/` before starting a migrated deployment.

The parent `myserver-stack` repository provides Railway IaC and the public gateway
for intqst.ru. Railway terminates HTTPS; the gateway forwards HTTP/WebSocket to
`intercode.railway.internal:8090`. Alternatively expose this service directly using
a Railway/custom domain targeting port 8090. Publish these files to this repository
and grant the Railway GitHub App access before deploying.

The existing split VPS deployment remains available. Build the frontend with
`docker build -f Dockerfile.vps -t intercode-web .`; Compose and GitHub Actions
use this filename so Railway does not automatically select the VPS Dockerfile.
The backend-only Dockerfile remains at `server/Dockerfile`.
