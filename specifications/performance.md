# Performance Requirements

Only fill in numbers you actually care about. A vague "should be fast" gives Claude nothing to
design against — a target latency or load figure does. Leave `[TODO]` rather than guessing.

## Response Time Targets

Measured server-side for API rows, and in the browser on a mid-range laptop over the studio's wifi
for page load. These are targets to notice regressions against, not SLAs.

| Operation                                        | Target (p50) | Target (p95) | Notes                                                                                                                                                                                                                                   |
| ------------------------------------------------ | ------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page load / initial render                       | 800ms        | 2s           | Cold load of `/` with an authenticated session, to first meaningful render of the grid.                                                                                                                                                 |
| API read (simple)                                | 100ms        | 300ms        | `GET /api/bookings/mine`, `GET /api/admin/resources`, `GET /api/resource-types`.                                                                                                                                                        |
| API write                                        | 150ms        | 500ms        | `POST /api/bookings`, `DELETE /api/bookings/:id`, resource writes.                                                                                                                                                                      |
| `GET /api/availability`                          | 150ms        | 400ms        | The known-heavy read: 50 resources × up to 48 slots. Held to the same budget as a simple read because it must stay a fixed two-query operation — see Constraints below.                                                                 |
| `POST /api/auth/register` and `/forgot-password` | —            | —            | **Deliberately exempt.** Both send email inline and both run bcrypt; they will take longer than the write budget and that is expected. Don't "optimise" them by removing the inline send — see `operations.md` > External Integrations. |

## Scale Expectations

- Expected concurrent users at launch / at 1 year: Sized for **~500 members and ~50 resources**.
  Realistically a handful of simultaneous sessions with occasional bursts — the studio emptying out
  and everyone booking next week at once is the pattern to survive, not sustained load.
- Expected data volume (rows in largest tables, growth rate):
  - `bookings` — the largest table. Upper bound if every slot of every resource were booked every
    day: 50 resources × 48 slots × 365 days ≈ 876k slot-rows a year, and fewer `bookings` rows since
    one booking covers up to four slots. Real occupancy will be a fraction of that. The 12-month
    purge caps it.
  - `booking_slots` — tracks the above, and only holds rows for _live_ bookings, so it stays much
    smaller than `bookings`: cancelled and past-but-unpurged bookings contribute nothing.
  - `audit_log` — a few thousand rows a month, dominated by login events. Currently unbounded; see
    the retention `[TODO]` in `security.md`.
  - `users`, `resources`, `resource_types` — hundreds of rows at most, forever.
- Read/write ratio, if lopsided: **Heavily read-dominated.** Checking what's free is the whole point;
  most sessions never write. Expect something like 20:1 reads to writes, concentrated on
  `GET /api/availability`.
- Any known spiky load pattern: No batch jobs during the day. The one predictable spike is the
  30-day horizon rolling over — a new day becomes bookable at midnight, and if members learn that, a
  popular resource will see contention at that moment. The unique constraint makes that correct
  regardless of how many requests arrive at once; it just means some will get a 409.

## Constraints This Implies

- Pagination required on:
  - **Admin booking list** — 50 per page, ordered by `starts_at DESC`. Keyset pagination on
    `(starts_at, id)` rather than `OFFSET`, so deep pages stay cheap.
  - **Admin member list** — 50 per page.
  - **My bookings** — 25 per page on the past-bookings tab; the upcoming tab is capped at 3 by the
    booking limit and needs none.
  - **Availability grid** — paginated by _resource_, 25 rows per page (see
    `ui-guidelines.md` > breakpoints). The time axis is bounded by the requested window and never
    exceeds 48 slots, so it needs no paging.
  - **Admin resource list** — 50 per page.
  - Per `operations.md` > Query Efficiency, every list query carries a `LIMIT` regardless, including
    ones that "can't" grow.
- Caching — what gets cached and for how long: **No server-side cache, and that's deliberate.**
  Availability is the most-read thing in the app and also the thing that must never be stale — a
  member shown a slot that was taken 20 seconds ago will try to book it and get a 409, which is
  exactly the confusion the app exists to remove. At this data volume the query is fast enough not to
  need one, and adding a cache would mean adding invalidation on every booking write for no
  measurable gain.
  - Client-side: React Query with `staleTime: 0` for availability, refetch on window focus, and an
    explicit refetch after any booking mutation. `resource_types` is cached for 5 minutes — it
    changes about never.
  - HTTP: `Cache-Control: no-store` on every `/api` response. Static assets get content-hashed
    filenames and a one-year immutable cache.
- Background/async processing needed for: **Only the nightly purge** (`operations.md` > Background
  Jobs). Email is sent inline and synchronously by decision, not by omission. Nothing else here is
  slow enough to move off the request.
- Database indexing priorities, derived from the query patterns in `data-model.md`:
  1. `booking_slots (resource_id, slot_start)` — the primary key. Serves both the double-booking
     constraint and the availability lookup. The single most important index in the schema.
  2. `bookings (member_id, starts_at DESC)` — "my bookings", and the 3-booking cap count.
  3. `bookings (resource_id, ends_at) WHERE status = 'booked'` — the archive check ("does this
     resource have future bookings") and the edit-hours stranded-booking check. Partial, because
     cancelled rows are never the answer.
  4. `bookings (starts_at DESC, id)` — the admin booking list's keyset pagination.
  5. `bookings (ends_at) WHERE status = 'booked'` — the purge job's scan.
  6. `users (email)` — implied by the unique constraint; the login lookup.
  7. `audit_log (occurred_at DESC)` and `audit_log (target_type, target_id)`.
  8. `resources (type_id) WHERE archived_at IS NULL` — the browse filter.
- Debounce interval for search/filter inputs that trigger an API call: **300ms** on the free-text
  admin searches. The type and time-window filters on the browse view fire immediately — they're
  discrete controls, not typing, and debouncing them would just feel laggy.

## Frontend Performance Budget

> **Skip unless** this app has a browser frontend. If it does, this section is not optional —
> everything above is server-side, and users judge "fast" almost entirely by what happens in the
> browser.

**Gate fires.** React frontend, and most members use it on a phone.

- Initial JS/CSS bundle size budget: **< 250KB gzipped JavaScript**, CSS under 30KB gzipped. Checked
  in Phase 6 and worth re-checking whenever a dependency is added.
  - The realistic threats to this number: a date library (avoided — `Intl.DateTimeFormat` with a
    pinned zone covers every need here, see `ui-guidelines.md`), a charting library (nothing here
    charts), and importing shadcn components wholesale rather than the ones actually used.
  - The admin section is **lazy-loaded** via `React.lazy` on the `/admin` route, so the 90% of users
    who are members never download it.
- Core Web Vitals targets: **LCP < 2.5s, INP < 200ms, CLS < 0.1** ("good" thresholds), measured on a
  mid-range phone over studio wifi.
  - LCP is the availability grid. It's gated on one API call, which is why that call has its own
    latency row above.
  - INP is mainly slot selection in the grid — selection state must stay local and must not refetch.
  - CLS is handled by the skeleton-placeholder convention in `ui-guidelines.md`: skeletons match the
    final layout's dimensions so nothing jumps when data lands.
- Image strategy — formats, responsive sizes, lazy-loading below the fold: **Not applicable.** The
  app has no images. Resource photos and file uploads of any kind are explicit non-goals, and there
  is no logo yet. Icons come from `lucide-react` as inline SVG, tree-shaken to the ones used.
- Font loading strategy: **No custom fonts.** The system font stack (`font-sans` as Tailwind ships
  it) renders immediately and costs nothing. If branding later introduces a webfont, it needs
  `font-display: swap`, preloading, and a subset — and it comes out of the 250KB budget.

## Bulk / File Operation Performance

> **Skip unless** this app imports, exports, or otherwise processes files or bulk records —
> the same trigger as `data-model.md` > Bulk Operations.

**Gate does not fire.** No imports, no exports, no file processing. The nightly purge is the only
multi-row operation and it runs outside any request, unattended, with no latency requirement.
Section left unfilled deliberately.
