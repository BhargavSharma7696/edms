# Initialization for EDMS application

This folder is the single entry point for running EDMS — clone the repo
and run one command.

## Run it

```bash
cd init
docker compose up --build
```

That's it — nothing to configure first, no `.env` file.

EDMS keeps all its data — collections, request/response history, everything
under `storage/` — in a plain folder on your machine, not hidden inside a
Docker volume: by default `../../edms-data`, a folder next to this repo.
It's created automatically the first time you run this — you don't need
to make it yourself.

**Want your data somewhere else?** Open `docker-compose.yml`, find this
line under `webserver: volumes:`, and change the left-hand side to your
own path:

```yaml
- ../../edms-data:/app/edms_root
```

Whatever you set it to gets created automatically the same way — no
manual folder setup either way.

First run takes a few minutes (Rust release build). Once it's up:

- **App:** http://localhost:3911
- **Backend API:** http://localhost:3000 (see `backend/webserver/API_REFERENCE.md`)

A one-shot `seed` container runs automatically the first time and
populates the app so it isn't empty on first look:

- 30 real, tested endpoints across 11 public APIs (JSONPlaceholder,
  httpbin, Postman Echo, Open-Meteo, PokeAPI and others), each with run
  data, history and tags
- 4 themed Collections
- 4 RepoViews (one per Collection) plus one combined by tag, with Index
  Tables
- 3 WebViews with front pages

It needs outbound internet (the backend makes the test calls) and takes
about half a minute. It only seeds an empty database, so it is safe to
leave in place on every `docker compose up`: if endpoints already exist
it does nothing. To add the demo data to a database that already has
data, run it by hand with `SEED_FORCE=1` (endpoints that already exist
for the same URL and method are reused, not duplicated):

```bash
SEED_FORCE=1 EDMS_BASE=http://localhost:3000 node init/seed.mjs
```

## Resetting

```bash
docker compose down -v
rm -rf ../backend/webserver/data
```

Your storage folder (`../../edms-data`, or wherever you pointed it) is
untouched by this — delete it yourself if you want a truly clean slate.
