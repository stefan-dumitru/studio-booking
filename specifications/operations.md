# Operations & Runtime Requirements

The other spec files describe what the app _does_. This one describes how it behaves as a
_running system_ — which is where most of "high-performance and scalable" actually lives.

Most of this file is gated. A local-only project or a prototype with no real users can answer
almost none of it and lose nothing; the same project once it's deployed and holding data someone
cares about needs most of it. The two ungated sections — **Concurrency & Write Correctness** and
**Query Efficiency** — apply the moment more than one person uses the app at once, and both are
far cheaper to decide now than to retrofit.

Fill in what you have real answers for. `[TODO]` is fine; a guessed number here is worse than a
blank, because it will get designed against.

**Gate status for this project:** the app runs locally today but is expected to be deployed soon, so
every section below is filled rather than skipped. The specific hosting target is undecided and is
marked `[TODO]` where it matters.

## Availability & Recovery

> **Skip unless** someone other than you depends on this app being up, or it holds data that
> would genuinely hurt to lose.

**Gate fires** — the studio's members depend on it, and losing the schedule means the whiteboard
comes back.

- Uptime/availability target: **99.5%**, roughly 3.5 hours of unavailability a month. Business hours
  matter far more than nights; the studio's opening hours are when this is real.
- Acceptable planned-maintenance downtime, and when it can happen: Outside every resource's opening
  window — in practice late night. Since opening hours are per-resource and admin-editable, "safe"
  means after the latest `close_time` across all non-archived resources. A deploy that takes under a
  minute needs no announcement; anything longer should be mentioned in the group chat, because the
  app itself cannot notify anyone (no notifications is a non-goal).
- Backup frequency, and how much data loss is tolerable (RPO): **Nightly backup, 24-hour RPO.** Up to
  a day of bookings can be lost. Practically, that means members may need to re-book a day's worth,
  which is annoying but not catastrophic — and the admin can reconstruct from the group chat, as
  they do today.
  - Mechanism: a nightly `pg_dump` to storage off the database host, retained 30 days, or the
    managed provider's equivalent. `[TODO]` — which, since the hosting target is undecided.
- How long a full restore may take (RTO), and whether a restore has ever actually been tested:
  **Target RTO: 4 hours.** No restore has been tested — the app doesn't exist yet. **An untested
  backup is not a backup**, so a documented restore dry-run into a scratch database is a deployment
  checklist item, not a "someday" task. `[TODO]` until it's been done once.

## Observability

Distinct from `security.md`'s audit logging: that answers "who changed record X," this answers
"why is the app broken right now."

- Structured application logging — what gets logged, in what format, and where it goes: **Structured
  JSON to stdout**, one line per request, via `pino` with `pino-http`. stdout is the destination;
  whatever runs the process collects it. Nothing writes log files from inside the app — that would
  break the statelessness rule below.
  - Per request: timestamp, level, method, path (the route pattern, not the interpolated URL),
    status, duration in ms, authenticated user id, and a **correlation id** generated per request and
    returned to the client in an `X-Request-Id` header. That id is what a user quotes from a 500
    error screen (`ui-guidelines.md` > Feedback & Error States), which only works if it appears in
    both places.
  - Errors log the full stack server-side; the client gets the generic message and the correlation
    id, never the detail (`CLAUDE.md` > Security Baseline).
  - Log level from `LOG_LEVEL`, defaulting to `info` in production and `debug` locally.
- A health check endpoint, and what it actually verifies: **`GET /api/health`** runs
  `SELECT 1` against the pool with a short timeout and returns `200 {status:'ok', db:'ok'}` or
  `503 {status:'degraded', db:'unreachable'}`. It verifies the database is reachable, not merely
  that the process is alive — a Node process that can't reach Postgres is useless and should fail
  its check. It requires no authentication and returns no version or environment detail.
- Metrics worth tracking: Request rate, error rate (4xx and 5xx separately — a rising 409 rate on
  `POST /api/bookings` means contention, not a bug, and confusing the two will send you hunting for
  the wrong thing), p50/p95 latency per route, and database pool utilisation. No metrics backend is
  chosen; these are derivable from the structured logs to begin with. `[TODO]` if that stops being
  enough.
- Error tracking / alerting: **Sentry**, initialised on the backend and the frontend, with the DSN
  from the environment.
  - Actively notify on: any 5xx, an unhandled rejection or uncaught exception, `/api/health` failing
    twice consecutively, and a failed mail send (which blocks registrations — see External
    Integrations).
  - Record but don't notify on: 4xx responses, including 409 slot conflicts and 403 cancellation
    refusals. Those are the app working.
  - **Sentry must be configured to scrub PII before send.** `sendDefaultPii: false`, plus a
    `beforeSend` hook that strips request bodies and redacts the fields listed below. Given GDPR
    scope, shipping user emails to a third party by default is exactly the wrong default.
- Which fields must be redacted or masked in operational logs: `password`, `passwordConfirm`, any
  `token` or `code` query parameter or body field, the session cookie, `Authorization` headers, and
  `email` (masked to `a***@example.com`, since a support question usually only needs the domain).
  Request bodies are **not** logged by default; specific fields are logged where needed. IP is logged
  for auth routes only, which is where it has a security purpose — and it's personal data, so it
  inherits the retention `[TODO]` in `security.md`.

## Environments & Configuration

- Which environments exist, and how closely staging mirrors prod: **Local and production only. There
  is no staging.** You test locally, then deploy. The honest consequence: production is where
  surprises happen, so the automated test suite is carrying weight a staging environment would
  otherwise share. That's a reason to hold Phase gates properly rather than a reason to skip them.
- How configuration and secrets differ per environment: All configuration through environment
  variables, validated **once at boot** by a schema in `server/src/config.ts` — the process refuses
  to start on a missing or malformed value rather than failing at 3am on the first request that needs
  it. `.env` is gitignored (`CLAUDE.md` > Security Baseline); `.env.example` is committed with every
  key present and every value blank or obviously fake.
  - `DATABASE_URL`, `SESSION_SECRET`, `SMTP_URL` (or discrete host/port/user/pass), `MAIL_FROM`,
    `APP_BASE_URL` (used to build verification and reset links — never derived from the `Host`
    header, which is attacker-controlled), `SENTRY_DSN`, `LOG_LEVEL`, `NODE_ENV`, `BCRYPT_COST`,
    `SESSION_TTL`, `STUDIO_TIME_ZONE` (defaulting to `Europe/Bucharest`).
  - Local development uses a console mail transport, so the whole verification flow is exercisable
    with no provider account. Production requires a real `SMTP_URL` and boot fails without one.
- How a release ships, and how it gets rolled back when it's wrong: `[TODO]` — the hosting target
  isn't chosen. The requirements it has to satisfy, whatever it turns out to be: migrations run
  before the new code starts; the previous version can be redeployed without a database change
  (which is what the expand/contract rule below buys); and a rollback path is exercised once before
  the first real deploy.

## Database Migrations

> **Skip unless** this app is deployed somewhere with data you can't simply recreate. Until
> then, dropping and rebuilding the schema is a legitimate strategy — say so here explicitly, so
> it's a decision rather than an omission.

**Gate fires** on the strength of "deployed soon". Even before deployment, migrations are written
properly from the first commit, so the eventual deploy isn't a rewrite.

- How schema changes ship: **`node-pg-migrate`**, numbered SQL-first migration files in
  `server/migrations/`, run by `npm run migrate:up` as a deploy step before the new code starts.
  Never auto-run at application boot — two app instances booting simultaneously would race.
  - **Expand/contract** for anything that would otherwise break the running version: add the new
    column or index, ship code that writes both, backfill, ship code that reads the new one, drop the
    old in a later migration. There's no staging environment to catch a breaking migration, which
    makes this discipline worth more here than it would be otherwise.
  - New indexes on `bookings` or `booking_slots` use `CREATE INDEX CONCURRENTLY` once there's real
    data — a plain `CREATE INDEX` takes a write lock, and a lock on `booking_slots` means nobody can
    book.
- Is every migration reversible, and if not, what's the recovery plan? **Every migration ships a
  `down`**, and the `up`/`down` round-trip is tested against a scratch database in CI (Phase 0).
  Genuinely irreversible changes — dropping a column with data in it — are the exception, and where
  one is unavoidable it's split so the destructive half ships separately, after the release it
  supports has proven itself. Recovery for those is the nightly backup and the 24-hour RPO above.
- How large-table backfills are handled so they don't lock the table or time out: In **batches of a
  few thousand rows** by primary key with a short pause between, in its own migration or a one-off
  script — never a single `UPDATE` across the whole table. `bookings` is the only table that will
  ever be big enough to care. At current projected volumes this is precautionary, which is the right
  time to decide it.

## Background Jobs & Queues

> **Skip unless** this app does work outside a request — scheduled tasks, queued jobs, anything
> that keeps running after the response is sent. `performance.md` decides _what_ runs async;
> this decides how it behaves when it fails.

**Gate fires, narrowly.** Exactly one job exists: the retention purge. **There is no queue, no
worker process, and no job table** — a queue for one nightly job is infrastructure for its own sake.
Email is sent inline, not queued (see External Integrations).

- The job: **`npm run purge:bookings`**, a standalone Node script in `server/src/jobs/purge.ts`,
  invoked by **system cron on the host** — deliberately not `node-cron` inside the Express process,
  which would fire once per app instance the moment there's more than one.
  - Deletes `bookings` whose `ends_at` is more than 12 months old (cascading `booking_slots`), and
    `email_tokens` older than 30 days. Writes one `job.purge` audit row with the counts.
  - Runs in batches (see backfills above) so it can't hold a long lock on `bookings`.
  - `[TODO]` — the cron schedule, once the hosting target is known. Late night, outside every
    resource's opening window.
- Retry policy and maximum attempts per job type: **None — the job does not retry.** It's idempotent
  and runs nightly; a failed run is simply caught by the next one, and a night of un-purged rows
  harms nothing. Retrying inside the script would risk compounding whatever caused the failure.
- Where permanently-failed jobs go, and who looks at them: There is no dead-letter queue. A non-zero
  exit is logged as JSON to stdout and reported to Sentry, which notifies. Two consecutive failures
  are worth investigating; one is not.
- Delivery guarantee — at-least-once or exactly-once? **At-least-once, and the handler is
  idempotent.** Running the purge twice in one night deletes nothing extra, because the second run
  finds nothing matching. This is the property that makes "no retry logic" a safe choice rather than
  a lazy one.
- How a stuck or silently-failing job gets detected: The `job.purge` audit row is the heartbeat — no
  row for a given night means the job didn't complete. `[TODO]` — nothing actively checks for a
  missing row today, so detection is currently "an admin notices". A small weekly check is worth
  adding if the retention rule ever becomes a compliance commitment rather than good hygiene.

## External Integrations

> **Skip unless** this app calls a third-party service — payments, email, storage, maps, an
> internal API owned by someone else.

**Gate fires.** Two third parties: an SMTP provider and Sentry. Both were deliberate additions
during the interview, and both are the kind of dependency that's easy to forget is a dependency.

- Which services this app depends on, and what happens to the user experience when each one is down:
  - **SMTP provider** (via Nodemailer). Used by registration, verification resend, and password
    reset. **Sent inline during the request, failing loudly** — this was an explicit choice over
    queueing.
    - When it's down: **registration fails and no account is created.** The mail send happens
      _inside_ the registration transaction's boundary in the sense that a failed send rolls the
      account creation back, so there is no half-created account that can never be verified and can
      never re-register (the email would already be taken). This is the specific failure mode the
      inline choice has to get right, and it gets its own test.
    - Password reset behaves the same: the request fails and the user sees an error telling them to
      try again shortly.
    - **Existing members are entirely unaffected** — login, browsing and booking touch no external
      service. Only the front door closes.
    - The accepted trade: a flaky provider blocks signups, and a slow one makes registration slow
      (which is why `performance.md` exempts that route from the write budget). Revisit by adding a
      job table if it ever actually hurts.
  - **Sentry.** Used for error reporting only. When it's down, the app is unaffected — the SDK fails
    silently and drops events. It must never be in a request's critical path, and a Sentry outage
    must never surface to a user.
  - **Postgres** is not a third-party integration; it's the app's database. When it's unreachable,
    `/api/health` returns 503 and every route fails — see Availability.
- Timeout and retry policy per integration — never an unbounded wait:
  - SMTP: **10-second connection and send timeout**, no retry inside the request. A user retrying the
    form is the retry.
  - Sentry: the SDK's own short timeout, fire-and-forget, never awaited.
  - Postgres: statement timeout of **5 seconds** on the pool, so a pathological query can't pin a
    connection indefinitely.
- Whether repeated failures trip a circuit breaker / degrade gracefully, or keep retrying: **No
  circuit breaker.** With one mail call per registration and no retries, there's nothing to break the
  circuit on — the failure is already bounded and already visible to the user. Adding one would be
  machinery without a purpose.
- Whether integration failures surface to the user immediately or get queued and retried silently:
  **Immediately and explicitly**, for mail. Silently and invisibly, for Sentry. Those are the only
  two cases.

## Concurrency & Write Correctness

The bug class that only appears under real load, and the hardest to retrofit. This section is the
heart of the app: the problem being solved is literally double-booking.

- Two users editing the same record at once: optimistic locking, explicit locking, or last-write-wins?
  - **Bookings: none of the above, because bookings are never edited.** A booking is created and
    cancelled, never updated in place (`data-model.md`). Conflict is prevented at creation by a
    database constraint, not by a locking strategy.
  - **Resources and resource types: last-write-wins, accepted deliberately.** One admin exists. Two
    admins editing the same resource simultaneously is not a realistic scenario, and an optimistic
    version column would be machinery guarding against nothing. If a second admin is ever added and
    this turns out to matter, a `version` column plus a `WHERE version = $n` guard is the retrofit —
    noted so the decision is visible rather than accidental.
  - **User role and status changes:** serialised by the "at least one active admin" check, which runs
    inside the transaction with `SELECT ... FOR UPDATE` on the admin rows. Without the lock, two
    concurrent demotions could each see another admin still present and leave the studio with none.
- **The double-booking guarantee, stated precisely.** Two members tapping the same free slot at the
  same instant is resolved by a **`PRIMARY KEY (resource_id, slot_start)` on `booking_slots`**.
  - A check-then-insert in application code does **not** work and must not be relied on — under the
    default `READ COMMITTED` isolation, both requests can read "free" before either writes. The
    availability check in the booking handler is a convenience that produces a nicer error message;
    **it is not the control.**
  - The flow: `BEGIN` → validate the rules → `INSERT` the booking → `INSERT` its `booking_slots`
    rows. If Postgres raises `23505` on any slot, roll back and return **409** with
    `code: 'SLOT_TAKEN'` and the offending slots. The loser's transaction never half-commits.
  - Cancellation **deletes** the `booking_slots` rows, which is what frees the slot. The booking row
    survives as history with `status = 'cancelled'`.
  - **No retry on 23505.** The slot is genuinely gone; retrying would just take a different slot than
    the user chose. The user picks again.
  - This is deliberately _not_ implemented with `SERIALIZABLE` (which would need retry logic on every
    booking write) or a `FOR UPDATE` lock on the resource row (which would queue every booking on a
    popular resource behind the others). The constraint is the only option that cannot be bypassed by
    a bug elsewhere in the code — including a bug in code not yet written.
  - **Phase 3 has a concurrency test that fires two simultaneous bookings at one slot and asserts
    exactly one 201 and exactly one 409.** If that test is ever deleted or weakened, the app's core
    promise is no longer verified.
- Which operations must be idempotent, and what key makes them so:
  - **Cancellation** — `DELETE /api/bookings/:id` on an already-cancelled booking returns **200, not
    404 or 409**. The booking id is the idempotency key. This covers the double-clicked cancel button
    and the retried request.
  - **The purge job** — naturally idempotent; a second run finds nothing to delete.
  - **Email verification and password reset** — tokens are single-use (`used_at`). A second click on
    the same link shows "this link has already been used" rather than erroring, and an
    already-verified account clicking an old link lands on the app rather than an error page.
  - **Booking creation is deliberately _not_ idempotent.** There's no client-supplied idempotency
    key. A genuine double-submit is caught by the unique constraint (the second attempt hits the
    slots the first just took and gets a 409), and the UI disables the submit control while the
    request is in flight (`ui-guidelines.md`). The residual risk — a double-submit producing a 409 on
    a booking that actually succeeded, confusing the user — is accepted, and the client mitigates it
    by refetching bookings after any 409 so the successful booking is visible.
- Transaction boundaries — which multi-step operations must be all-or-nothing:
  - **Create booking** — booking row + all its slot rows. Partial commit would create a booking that
    doesn't block its own slots.
  - **Cancel booking** — status update + slot deletion + (for an admin) the audit row. Partial commit
    would free a slot on a booking still showing as live, or lose the record of who cancelled it.
  - **Deactivate a member** — status update + cancel their future bookings + delete their slot rows +
    delete their sessions + audit row. Partial commit would leave a locked-out member still holding
    slots nobody can release.
  - **Register** — user row + verification token + **the mail send**. If the send throws, the whole
    thing rolls back, so a failed email never leaves an unverifiable account squatting on an address.
    This is the one place an external call sits inside a transaction boundary; it's justified by the
    alternative being worse, and it's why the SMTP timeout is bounded at 10 seconds.
  - **Role change** — the locked admin-count check + the update + the audit row.
  - Recovery if step 2 fails after step 1 committed: not reachable for any of the above, because each
    is a single transaction on a single database. There is no distributed write anywhere in this app.
- Any known race conditions in the domain:
  1. **Two members booking the same slot** — the central one, resolved above.
  2. **Booking a slot while an admin archives the resource.** The archive check counts future
     bookings; a booking committing immediately after that count could leave a live booking on an
     archived resource. Resolved by taking `SELECT ... FOR UPDATE` on the resource row in the archive
     transaction, and having the booking transaction read the resource row (`FOR SHARE`) when
     validating that it isn't archived. The booking either blocks until the archive commits and then
     fails validation, or commits first and makes the archive fail its count.
  3. **Booking while an admin narrows the opening hours.** Same shape, same `FOR SHARE` read. Worst
     case here is benign — a stranded booking, which is an allowed state by the warn-then-allow rule.
  4. **A member's third booking racing their own fourth.** Two simultaneous requests could each count
     two existing bookings and both commit, putting them at four. Resolved by counting under
     `SELECT ... FOR UPDATE` on the member's own user row inside the booking transaction, which
     serialises a single member's concurrent bookings without affecting anyone else's.
  5. **Two admins demoting each other simultaneously**, leaving no admins — handled by the locked
     count above.

## Scalability Constraints

> **Skip unless** this app is deployed, or will be. The statelessness rule below is the one to
> read anyway — violating it early is what makes an app impossible to run on more than one
> instance later.

**Gate fires** — deployment is expected.

- **Statelessness**: Confirmed, and the design choices that keep it true:
  - **Sessions** live in Postgres (`connect-pg-simple`), not in memory. The default
    `express-session` MemoryStore must never be used, in any environment, because it works fine on
    one instance and breaks silently on two.
  - **Rate-limit counters** must share a store too, for the same reason. `[TODO]` — currently an
    in-memory limiter is the likely first implementation, which is a known single-instance
    constraint. Either move it to Postgres or Redis before running a second instance, or accept that
    limits are per-instance and the effective threshold multiplies.
  - **No uploads, so no file state** — the one scalability trap this app gets for free by having no
    uploads at all.
  - **Logs go to stdout**, never to a file on local disk.
  - **The purge job runs from cron on one host**, not inside the app process, so it doesn't multiply
    with instances.
- What breaks first as load grows: The **database connection pool**, well before Postgres itself.
  After that, `GET /api/availability` — it's 20× more frequent than anything else and scales with
  resource count. Neither is close at the projected scale; this is where to look first if it isn't.
- Database connection pool sizing, and how it interacts with the number of app instances:
  `[TODO]` — depends on the hosting target and its Postgres connection limit, neither chosen. The
  rule to apply when it is: **`pool_max × instance_count` must stay comfortably below the server's
  `max_connections`**, leaving headroom for migrations, the purge job, and a `psql` session. A pool
  of 10 on a single instance is a reasonable starting point; the number to watch is pool wait time,
  not pool size.

## Query Efficiency

Applies from the first list endpoint. These are the defaults that stop a page being fast with ten
rows and unusable with ten thousand.

- How N+1 queries are prevented: There is no ORM — hand-written SQL through `pg`
  (`server/src/db/queries/`), so an N+1 has to be written on purpose rather than appearing by
  accident from lazy loading. The convention: **a list endpoint issues a fixed number of queries,
  independent of how many rows it returns.** Never a query inside a loop over results; join, or issue
  one `WHERE id = ANY($1)` and stitch in JavaScript.
  - The case that matters most: `GET /api/availability` is **exactly two queries** — one for the
    resources matching the filter, one for all `booking_slots` in the requested range for those
    resource ids. Slots are generated in application code and marked from an in-memory map. It must
    not become one query per resource; that's the regression to watch for, and the reason this
    endpoint has its own latency row in `performance.md`.
- Confirm no unbounded queries: **Every list query carries an explicit `LIMIT`**, including ones on
  tables that "can't" grow — `resource_types`, the admin member list, the audit log. A default
  page size is applied server-side when the client sends none, and a client-supplied page size is
  clamped to a maximum. The pagination targets are listed in `performance.md` > Constraints.
  - The two deliberate exceptions, both bounded by domain rules rather than by `LIMIT`: the
    availability query (bounded by the resource page of 25 × at most 48 slots) and a booking's own
    slot rows (at most 4).
- Rough query budget for a typical page/endpoint: **At most 4 queries per request**, excluding the
  session lookup and the auth middleware's user fetch. Availability is 2. Creating a booking is 4
  (resource read, member-row lock and cap count, booking insert, slots insert). A list endpoint is 2
  (the page and its count). Anything exceeding 4 needs a reason in the PR, which is what makes a
  regression visible.
- Cache invalidation — what busts the cache on write: **Server-side, nothing — there is no server
  cache** (`performance.md` explains why availability deliberately isn't cached). Client-side, React
  Query invalidation is explicit and the rules are short enough to state once:
  - A successful booking create or cancel invalidates `['availability', date, filters]` **and**
    `['bookings','mine']`.
  - A 409 on booking also invalidates availability — the 409 is itself proof the client's view is
    stale, which is exactly when a refetch is most valuable.
  - Any resource or resource-type write invalidates `['resources']`, `['resourceTypes']` and all
    availability queries, since opening hours and archive state change what the grid renders.
  - Deactivating a member invalidates `['members']` and all availability queries, because their
    future bookings were just cancelled and those slots are now free.
