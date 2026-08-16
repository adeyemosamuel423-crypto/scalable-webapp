# StreamHive — Architecture & Scalability Notes

These notes are written to directly support the COM769 Coursework 2 slide
deck (technical solution overview, advanced features, limitations/scalability
assessment) and the Coursework 1 log.

## 1. Component separation and statelessness

The backend (`Express`) holds no in-process session state — every request
carries its own JWT, and uploaded files are streamed straight through to
object storage rather than cached on the container's local disk beyond a
short-lived temp file. This means multiple backend replicas could sit behind
a load balancer with no sticky-session requirement, which is the core
precondition for horizontal auto-scaling on any cloud platform (ECS/EKS
service auto scaling, Azure App Service scale-out rules, OpenStack Heat
autoscaling groups).

## 2. Object storage instead of local disk

Video files and thumbnails are never persisted on the backend container's
filesystem. They are pushed to MinIO, an S3-API-compatible object store.
Because the AWS SDK's S3 API and the MinIO client are interface-compatible,
swapping `MINIO_ENDPOINT` for a real AWS S3 endpoint (and switching
credentials) is the only change needed to move this component to production
object storage — no application code changes required. This also means
container restarts/redeploys never lose media.

## 3. Database as a managed, poolable dependency

PostgreSQL is accessed through a connection pool (`pg.Pool`) sized to 20
connections per backend instance rather than one connection per request.
In a horizontally-scaled deployment this pool size, combined with
PgBouncer/RDS Proxy in front of a managed Postgres instance, is what stops
connection exhaustion as backend replica count grows — a limitation worth
naming explicitly in the coursework write-up (see §5).

## 4. Caching layer

Redis caches the two hottest read paths — the dashboard (`/api/videos/dashboard`)
and search/browse (`/api/videos`) — with a short TTL (15–20s). This is a
deliberately conservative TTL that favours freshness over raw throughput,
appropriate for a small demo dataset; a production deployment serving high
read volume would likely raise the TTL and pair it with active
cache-invalidation on write (already implemented: uploads, ratings and
comments call `cacheInvalidate` to bust the relevant cache keys immediately).

## 5. Known limitations (for the "assessment of limitations" slides)

- **No CDN / edge caching for video bytes.** Playback is proxied through the
  Express backend and MinIO rather than served from a CDN edge. In
  production this would be fronted by CloudFront/Azure CDN pointed directly
  at the object storage bucket, removing the backend from the video-byte
  hot path entirely.
- **Single Postgres instance, no read replicas.** All reads and writes hit
  one database. A read-heavy production deployment would add read replicas
  for the dashboard/search queries.
- **No autoscaling configured in this local Docker Compose setup.**
  Compose runs exactly one replica of each service; the codebase is written
  to support horizontal scaling (see §1) but the orchestration here is
  intentionally the simplest thing that demonstrates the pattern locally.
  A production deployment would define autoscaling policies (target CPU/
  request-latency) in the chosen cloud platform's container service.
- **No CI/CD pipeline included in this bundle.** Coursework 1 covers build/
  integration/test pipelines separately: the intended pairing is a
  GitHub Actions / GitLab CI pipeline that runs `docker build` for both
  images, runs any test suite, and pushes to a container registry before
  deployment.
- **Media conversion is synchronous and minimal.** Thumbnail extraction runs
  inline during the upload request using ffmpeg. A production system would
  offload this to an async queue/worker (or a managed service like AWS
  Elemental MediaConvert) so upload requests return immediately and
  transcoding/thumbnailing happens out-of-band.
- **Basic content moderation only.** Sentiment analysis on comments is
  informational (displayed as a badge) rather than enforced — no automatic
  hiding/flagging of negative or abusive content is implemented.

## 6. Advanced features implemented

1. **Media conversion** — `backend/src/utils/media.js` uses `fluent-ffmpeg`
   to probe video duration and extract a thumbnail frame on every upload.
2. **Sentiment analysis (cognitive service pattern)** — `backend/src/utils/sentiment.js`
   scores every comment and stores/display a positive/neutral/negative label,
   in the same shape a managed cognitive service call would return.
3. **Caching for scalability** — Redis-backed caching with active
   invalidation, described in §4.
4. **Authentication & role-based access control** — JWT-based auth
   distinguishing `creator` and `consumer` roles at the middleware layer
   (`backend/src/middleware/auth.js`).

## 7. Suggested containerised vs. hosted-cloud comparison (for slides 3–6)

The brief recommends appraising both a containerised and a hosted/cloud-native
design. This project is containerised (Docker Compose) for local
demonstrability, but every component was deliberately chosen for its
managed-cloud equivalent:

| This project | Hosted/cloud-native equivalent |
|---|---|
| nginx container | S3 static site + CloudFront, or Azure Static Web Apps |
| Express container(s) | AWS App Runner / ECS Fargate / Azure App Service |
| Postgres container | Amazon RDS / Azure Database for PostgreSQL |
| MinIO container | Amazon S3 / Azure Blob Storage |
| Redis container | Amazon ElastiCache / Azure Cache for Redis |

Trade-off to discuss in the slides: the containerised approach gives full
control and zero cloud cost during development/marking, at the expense of
needing to manage scaling, patching and HA manually; the hosted approach
trades that operational burden for usage-based cost and platform lock-in.
