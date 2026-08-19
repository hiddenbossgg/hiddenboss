# hiddenboss

A free, open-source alternative to Braacket and start.gg leagues. Pull in your tournaments from
start.gg, parry.gg, challonge, and sleet.gg, work out which entrants are the same person, and
publish rankings.

> Early development. Tier 0 — import a tournament and rank it — is partly built. See
> [`docs/platform-adapters.md`](docs/platform-adapters.md) for the architecture and
> [`CLAUDE.md`](CLAUDE.md) for working conventions.

## Running it locally

**Requirements:** Node 24 (`.nvmrc` pins 24.11.1) and Docker.

Docker Desktop must be running before `docker compose up -d db` — on Windows/Mac it does not start
itself, and `docker compose` fails with a daemon-connection error (or the worker logs an
`ECONNREFUSED` connecting to Postgres) if it's not.

```bash
nvm use                       # Node 24 — the framework refuses to install on 22
npm install
docker compose up -d db       # Postgres on :5432, plus a hiddenboss_test database
cp .env.example .env          # then set APP_KEY (node ace generate:key)
node ace migration:run
node ace db:seed              # creates a login and a league to work with
```

Then run **two** processes:

```bash
npm run dev                   # http://localhost:3333
node ace queue:work           # background worker — imports do nothing without it
```

The worker is not optional. Clicking **Import** queues a job; with no worker running the import
sits at `queued` forever and the page gives no clue why.

Seeded login: **dev@hiddenboss.test** / **password**, with a league at `/dev-league`.

### Try an import

The quickest path needs no UI, no worker, and no API key:

```bash
printf 'name,placement\nAlice,1\nBob,2\nCarol,3\n' > /tmp/entrants.csv
printf 'entrant_a,entrant_b,score_a,score_b\nAlice,Bob,3,1\nBob,Carol,3,0\n' > /tmp/sets.csv

node ace import:event dev-league my-weekly \
  --entrants=/tmp/entrants.csv --sets=/tmp/sets.csv --name="My Weekly"
```

This runs the import synchronously and prints what happened, which makes it the fastest way to
debug an adapter.

To import from start.gg instead, add a personal access token at
`/dev-league/credentials` (create one at start.gg → Developer Settings), then either paste a
event link at `/dev-league/imports` or run:

```bash
node ace import:event dev-league https://www.start.gg/tournament/<slug>/event/<event>
```

### Where things are

| URL                    | What                                |
| ---------------------- | ----------------------------------- |
| `/signup`, `/login`    | accounts                            |
| `/leagues`             | leagues you administer              |
| `/:league`             | public league home                  |
| `/:league/settings`    | league settings                     |
| `/:league/imports`     | paste an event link, watch progress |
| `/:league/credentials` | per-platform API keys               |

## Checks

```bash
npm run lint
npm run typecheck
node ace test
```

Tests need the `hiddenboss_test` database, which `docker compose up -d db` creates on first run.
They require no API keys and no network: platform adapters are tested against recorded fixtures.

## Contributing a platform

Write an adapter under `app/lib/platforms/<key>/`, test it through `runAdapter()`, and register it.
Nothing outside that directory should need to change. Read
[`docs/platform-adapters.md`](docs/platform-adapters.md) first.
