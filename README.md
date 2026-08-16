# StreamHive

A scalable, cloud-native video sharing web application — built for
**COM769 (79672) Scalable Advanced Software Solutions, Coursework 2**.

StreamHive is a TikTok-style platform: creators upload short videos with
metadata, consumers browse/search/watch/comment/rate them, and a dashboard
surfaces the latest uploads. It runs as a set of Docker containers so it can
be developed and demonstrated entirely on a local machine, while every
component (object storage, database, cache) is built against APIs that map
1:1 onto managed cloud services — meaning the same code can be re-pointed at
a real cloud platform (AWS/Azure/OpenStack) with only configuration changes.

## Architecture

```
                     ┌─────────────────────┐
   Browser  ───────► │  frontend (nginx)    │  static HTML/CSS/JS
                     │  :8080                │  + reverse proxy /api → backend
                     └──────────┬───────────┘
                                │
                     ┌──────────▼───────────┐
                     │  backend (Node/      │  REST API, JWT auth,
                     │  Express) :4000       │  media conversion, sentiment
                     └───┬─────────┬────────┘
                         │         │
              ┌──────────▼──┐   ┌──▼───────────┐   ┌────────────────┐
              │  postgres   │   │  minio (S3)   │   │  redis (cache) │
              │  :5432      │   │  :9000/:9001  │   │  :6379         │
              └─────────────┘   └───────────────┘   └────────────────┘
```

| Layer | Technology | Maps to (cloud) |
|---|---|---|
| Static hosting | nginx serving `frontend/public` | S3 static website / CloudFront, Azure Static Web Apps |
| REST backend | Node.js + Express | Elastic Beanstalk / ECS / App Service / OpenStack VM |
| Relational persistence | PostgreSQL | RDS / Azure Database for PostgreSQL |
| Object/block storage | MinIO (S3-compatible API) | AWS S3 / Azure Blob Storage |
| Caching (scalability) | Redis | ElastiCache / Azure Cache for Redis |
| Auth | JWT (bcrypt-hashed passwords, role-based access control) | Cognito / Azure AD B2C (swap-in compatible) |
| Media conversion (advanced feature) | ffmpeg thumbnail + duration extraction on upload | AWS Elemental MediaConvert |
| Cognitive service (advanced feature) | Sentiment analysis on comments | AWS Comprehend / Azure Text Analytics |

## Requirement coverage (Task 1)

- **Creator accounts** — enrolled only via an authenticated `/api/auth/register-creator`
  endpoint (no public sign-up surface for creators, per the brief). A demo
  creator is auto-seeded on first boot (see below).
- **Creator uploads** — title, publisher, producer, genre, age rating,
  description; file streamed to object storage; thumbnail auto-generated.
- **Consumer accounts** — public sign-up, browse/search, play, comment, rate.
- **Dashboard** — latest videos, cached in Redis.
- **Static HTML hosting talking to a REST backend** — nginx + Express, wired
  through a reverse proxy.
- **Persistence via scalable hosted DB + object storage** — Postgres + MinIO.
- **Auth & access control** — JWT + role checks (`creator` vs `consumer`).
- **Caching** — Redis caches dashboard and search results.
- **Advanced features** — ffmpeg media conversion (thumbnails/duration) and
  sentiment analysis (cognitive-service-style) on comments.

## Running locally with Docker

**Requirements:** Docker Desktop (or Docker Engine + Compose plugin). No
other local dependencies are needed — Node, Postgres, MinIO and Redis all
run inside containers.

```bash
# from the project root
docker compose up --build
```

First boot will:
1. Start Postgres, Redis and MinIO and wait for them to become healthy.
2. Start the backend, which creates the database schema, the MinIO bucket,
   and seeds a demo creator account.
3. Start the nginx frontend.

Once everything is up:

| Service | URL |
|---|---|
| Web app | http://localhost:8080 |
| REST API (direct) | http://localhost:4000/api/health |
| MinIO console | http://localhost:9001 (login: `streamhive` / `streamhive_secret`) |

**Demo creator login:** `creator@streamhive.local` / `CreatorPass123!`
(auto-created on first startup — see `SEED_CREATOR_EMAIL` / `SEED_CREATOR_PASSWORD`
in `.env.example` to change it).

To create additional creator accounts, log in as the seed creator and call:

```bash
curl -X POST http://localhost:4000/api/auth/register-creator \
  -H "Authorization: Bearer <creator JWT from /api/auth/login>" \
  -H "Content-Type: application/json" \
  -d '{"email":"newcreator@example.com","password":"Passw0rd!","display_name":"New Creator"}'
```

To stop everything:

```bash
docker compose down          # keep data
docker compose down -v       # wipe database/object storage/cache volumes too
```

## Running without Docker (development)

```bash
cd backend
npm install
# requires a locally running Postgres, Redis and MinIO, or point the
# PGHOST / REDIS_HOST / MINIO_ENDPOINT env vars at remote instances
npm run dev
```

Serve `frontend/public` with any static file server and update `API_BASE`
in `frontend/public/js/api.js` if the backend isn't behind the same origin.

## Project structure

```
video-share-app/
├── docker-compose.yml       # orchestrates all 5 containers
├── .env.example             # copy to .env to customise credentials
├── backend/
│   ├── Dockerfile           # node:20-slim + ffmpeg
│   ├── package.json
│   ├── db/init.sql          # schema, applied automatically on startup
│   └── src/
│       ├── server.js        # express app bootstrap
│       ├── config/          # postgres / minio / redis clients
│       ├── middleware/      # jwt auth, role guard, multer upload
│       ├── controllers/     # auth, video, comment business logic
│       ├── routes/          # express routers
│       └── utils/           # ffmpeg media conversion, sentiment analysis
├── frontend/
│   ├── Dockerfile           # nginx:alpine
│   ├── nginx.conf           # static hosting + /api reverse proxy
│   └── public/
│       ├── index.html       # dashboard / browse / search
│       ├── login.html / signup.html
│       ├── upload.html      # creator upload + "my uploads"
│       ├── video.html       # watch, rate, comment
│       ├── css/style.css
│       └── js/               # api.js, auth.js, dashboard.js, upload.js, video.js
└── docs/
    └── ARCHITECTURE.md      # scalability discussion for the writeup
```

## REST API summary

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | – | Consumer sign-up |
| POST | `/api/auth/login` | – | Log in (either role) |
| POST | `/api/auth/register-creator` | creator | Provision a new creator |
| GET | `/api/auth/me` | any | Current user |
| GET | `/api/videos/dashboard` | – | Latest videos (cached) |
| GET | `/api/videos?q=&genre=&page=&limit=` | – | Search/browse (cached) |
| GET | `/api/videos/mine` | creator | Creator's own uploads |
| GET | `/api/videos/:id` | optional | Video detail + my rating |
| GET | `/api/videos/:id/stream` | – | Range-request video playback |
| GET | `/api/videos/:id/thumbnail` | – | Thumbnail image |
| POST | `/api/videos` | creator | Upload (multipart, field `video`) |
| POST | `/api/videos/:id/rate` | consumer | Rate 1–5 stars |
| GET | `/api/videos/:id/comments` | – | List comments |
| POST | `/api/videos/:id/comments` | consumer | Post a comment (sentiment auto-scored) |

## Notes for the coursework write-up

`docs/ARCHITECTURE.md` expands on the scalability rationale (caching,
statelessness of the backend, object-storage streaming, horizontal scaling
of the Express service) that you can draw on for the 6-page CW1 log and the
CW2 slide deck's technical-solution and limitations sections.
