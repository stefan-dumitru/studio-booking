# Functional Specification

## Product Overview

- What is this app, in 2-3 sentences: A resource booking web app for a single shared studio. Members
  see which bookable resources (rooms, desks, equipment) are free at which times, book a resource for
  a 30-minute-granular time slot, and manage their own bookings. One admin maintains the resource
  catalogue and can see and cancel every booking in the studio.
- Who is it for: Non-technical members of one studio, booking from a phone or a laptop, plus a single
  person who administers the space.
- Core problem it solves / why it needs to exist: The schedule currently lives on a whiteboard and in
  a group chat. Double-bookings happen, nobody can tell what's free without asking, and the person who
  runs the space spends their day answering that question. The app makes availability self-serve and
  makes a double-booking impossible at the database level.
- Explicit scope boundary — what's deliberately excluded (e.g. other product lines, business
  units, or use cases this app does NOT handle, even if adjacent ones exist)?
  - No payments or billing of any kind.
  - No booking notifications — no reminders, no confirmations, no SMS, no push. See
    **Notifications** below for the one narrow email exception.
  - No recurring or repeating bookings.
  - No external calendar sync (Google, Outlook, iCal) and no iCal feed.
  - No waitlist or queue when a slot is taken.
  - No resource photos or file uploads of any kind.
  - No importing members or resources from a spreadsheet.
  - No multiple locations — one studio, one time zone (`Europe/Bucharest`).
  - No native mobile app.
  - No reporting or data exports.
  - English only.

## Authentication & Identity Source

Which identity source this app uses. How it's implemented, and what happens when it fails, are
in `security.md` > Authentication.

- Does this app handle its own login, or does it receive an already-authenticated identity from
  an external system (SSO, an internal identity/auth service, another app)? This app handles its own
  login entirely. Email + password accounts created in this app. No SSO, no social login, no external
  identity provider.
- If external: what identifier/claim does it trust (e.g. username, email), and what does this app
  still need to resolve locally (role, permissions, active/inactive status)? Not applicable — there is
  no external identity source.

Account creation flow (decided during the interview, and the reason the Notifications gate below
fires at all):

1. A prospective member self-registers with email, display name and password.
2. The account is created with `status = 'pending_verification'` and **cannot book anything**.
3. The app emails a verification link. Clicking it sets `email_verified_at` and flips the account to
   `status = 'active'`.
4. The first admin account is not created this way — it is inserted by a seed script
   (`npm run seed:admin`, reading credentials from environment variables). See
   `operations.md` > Environments & Configuration.

## User Roles

| Role               | Description                                                                                                             | Can do                                                                                                                                                                                                                                                                                     | Cannot do                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Visitor**        | Not logged in.                                                                                                          | Register an account, verify their email address, request and complete a password reset, log in.                                                                                                                                                                                            | See any resource, availability or booking. Every other route requires an authenticated session.                                                                                                                                                                                                                                                                                  |
| **Pending member** | Registered, email not yet verified.                                                                                     | Log in, see a "verify your email" screen, request a new verification email.                                                                                                                                                                                                                | Browse availability, book, or see anything else. Treated as unauthenticated by every business endpoint.                                                                                                                                                                                                                                                                          |
| **Member**         | Verified, active account. Data scope: **all resources and all availability; only its own bookings.**                    | Browse every non-archived resource and its availability; filter by resource type and time window; create a booking for itself; view its own upcoming and past bookings; cancel its own booking up to 2 hours before its start.                                                             | See who holds any other booking (a taken slot renders as "Booked", never as a name — see Privacy below). Access any `/admin` route or admin API. Cancel or modify anyone else's booking. Create, edit or archive resources or resource types.                                                                                                                                    |
| **Admin**          | Also a member — books for itself exactly like one. Data scope: **every resource, every booking, every member account.** | Everything a member can do, plus: create/edit/archive resources and resource types; view every booking in the studio with the booking member's name; cancel any member's booking, ignoring the 2-hour cutoff; deactivate a member; promote a member to admin or demote an admin to member. | Book on behalf of another member (explicitly out of scope — there is no "booked by" vs "booked for" distinction). Bypass the booking limits when booking for itself — the 3-booking cap, 30-day horizon, 2-hour maximum duration and 30-minute minimum notice all apply to admins' own bookings exactly as they do to members'. Demote itself if it is the last remaining admin. |
| **Purge job**      | A system actor. `npm run purge:bookings`, run nightly by system cron.                                                   | Delete booking rows whose `ends_at` is more than 12 months in the past, and write one summary line to the audit log.                                                                                                                                                                       | Touch anything else. It has no HTTP surface and no session.                                                                                                                                                                                                                                                                                                                      |

**Privacy note (drives both the API and the UI).** A member must never be able to learn who holds a
given slot. The availability endpoint returns, per slot, only `free` / `booked` / `mine` — the member
id of another member's booking is never serialised into a member-facing response. This is an
authorization rule enforced server-side in the serializer, not a UI convention; see
`security.md` > Authorization.

Does any role need a landing/dashboard view with _aggregate_ stats scoped to its data? Yes, for the
admin only, and deliberately minimal: an admin landing view showing today's booking count, the count
of resources currently archived, and the count of members awaiting verification. This implies a
`GET /api/admin/summary` endpoint rather than deriving the numbers client-side from list endpoints.
Members get no dashboard — they land directly on the browse view.

## Notifications

> **Skip unless** this app sends messages to someone outside its own logged-in users — email,
> SMS, webhooks, or notifications to a partner organization.

**This gate fires narrowly.** The app sends no booking notifications of any kind, but it does send
_transactional account email_ to addresses that are not yet (or no longer) logged-in users. That was a
deliberate revision to the original non-goal, made during the interview: email confirmation on signup
was wanted, and it brings password reset with it.

- Does this app need to send notifications to external parties (e.g. a partner organization, a
  vendor, a regulator) as well as/instead of in-app users? No external parties. Two account emails
  only, both to the address on the account:
  - **Email verification** — sent on registration and on an explicit "resend" request.
  - **Password reset** — sent on request from the forgot-password form.
- If so, list each recipient type and whether the notification content/template varies per
  recipient or is fixed: One recipient type (the account holder). Both templates are fixed, plain
  text plus a minimal HTML part, English only.
- Delivery channel per recipient (email, in-app, webhook, etc.): Email only, sent inline during the
  request via Nodemailer. If the mail provider fails, the request fails loudly and the user sees an
  error — the account is not left in a half-created state. See `operations.md` > External
  Integrations for the exact failure and transaction semantics.

**Explicitly not sent:** booking confirmations, booking reminders, cancellation notices (including
when an admin cancels a member's booking), archive notices, and deactivation notices. A member finds
out their booking was cancelled by looking at the app.

## Search & Reporting

> **Skip the reporting questions unless** a role needs data out of the app in bulk — an export,
> a printable document, or an aggregate view. The search questions apply to any app with a list
> long enough to need filtering.

**Reporting: gate does not fire.** No exports, no printable documents, no reports. The only aggregate
view is the three-number admin summary described under User Roles, which is not a report. The
reporting questions below are left unanswered deliberately.

**Search: gate fires** — with 50 resources and 500 members, several lists need filtering.

- What's searchable, on which entities, and by which fields?
  - **Browse availability** — filter by `resource_type_id` (multi-select) and by a date plus a
    time-of-day window (`from`/`to`). Both are filters, not free-text search.
  - **Admin resource list** — free-text on `resources.name`, plus filters on type and
    archived/active.
  - **Admin booking list** — filters on date range, resource, and booking status; free-text on the
    booking member's name or email.
  - **Admin member list** — free-text on `display_name` and `email`, plus a filter on account status.
- Exact match, prefix, or fuzzy/full-text? Case-insensitive **substring** match (`ILIKE '%term%'`) on
  every free-text field above. No search engine, no `pg_trgm`, no full-text index. At these row counts
  a sequential scan behind a `LIMIT` is fine; revisit only if the admin lists get slow.
- What reports or exports does each role need, in what format? None — see above.
- Do any reports need aggregated or denormalized data that the transactional model won't answer
  efficiently? No.

## Use Cases

### Browse availability

- **Role(s):** Member, Admin.
- **Trigger:** Landing on `/` after login, or changing the date, type filter or time-window filter on
  that screen.
- **Main flow:**
  1. The client requests `GET /api/availability?date=YYYY-MM-DD&typeIds=1,2&from=09:00&to=18:00`.
     `date`, `from` and `to` are **studio-local wall clock** (`Europe/Bucharest`), not UTC.
  2. The server loads all non-archived resources matching the type filter, together with each
     resource's `open_time`/`close_time`.
  3. For each resource it generates the 30-minute slots that fall inside both the resource's opening
     window and the requested time window, as UTC instants (see Slot generation & DST below).
  4. It loads every `booking_slots` row for those resources on that day in one query, and marks each
     generated slot `free`, `booked`, or `mine` (the latter only when the slot's booking belongs to
     the requesting user).
  5. It returns resources × slots. The response never contains another member's identity.
- **Rules & edge cases:**
  - A resource with no slots in the requested window is still returned, with an empty slot list, so
    the grid row exists and reads as "closed" rather than vanishing.
  - Archived resources are excluded entirely, even if they have live bookings (which the archive rule
    makes impossible anyway — see Archive a resource).
  - Slots in the past, or inside the 30-minute minimum-notice window, are returned with
    `bookable: false` and a reason, so the grid can grey them rather than offering a click that will
    fail.
  - Requesting a date more than `BOOKING_HORIZON_DAYS` (30) ahead returns slots with
    `bookable: false` rather than a 400 — browsing further ahead is allowed, booking isn't.
  - Unauthenticated or pending-verification requests get 401/403 and no data.

### Create a booking

- **Role(s):** Member, Admin (for themselves only).
- **Trigger:** Selecting one or more contiguous free slots on one resource in the browse view and
  confirming the dialog.
- **Main flow:**
  1. `POST /api/bookings` with `{ resourceId, startsAt, endsAt }` (both ISO-8601 UTC instants).
  2. The server opens a transaction and validates, in order: the resource exists and is not archived;
     `startsAt`/`endsAt` align exactly to 30-minute slot boundaries; the range is 1–4 slots; every
     slot falls inside the resource's opening window; `startsAt` is at least 30 minutes from now;
     `endsAt` is within 30 days of now; the member holds fewer than 3 active future bookings.
  3. It inserts one `bookings` row and one `booking_slots` row per 30-minute slot.
  4. The unique index on `booking_slots (resource_id, slot_start)` decides the race. If Postgres
     raises `23505`, the transaction rolls back and the API returns **409 Conflict** with
     `code: 'SLOT_TAKEN'` and the list of slots that were taken.
  5. On success it returns 201 with the booking, and the client refetches availability.
- **Rules & edge cases:**
  - **Every rule above is re-checked server-side inside the transaction.** The client's greyed-out
    slots are a convenience, never a control.
  - A booking must be contiguous. Two separated ranges are two bookings, and each counts against the
    3-booking cap.
  - The 3-booking cap counts bookings with `status = 'booked'` and `ends_at > now()`. Past bookings
    and cancelled bookings don't count.
  - **Known consequence, accepted deliberately:** with a 30-minute minimum notice and a 2-hour
    cancellation cutoff, a member can create a booking they are immediately unable to cancel
    themselves. The escape hatch is asking the admin, who can cancel any booking at any time. The
    booking confirmation dialog states this explicitly when `startsAt` is less than 2 hours away.
  - A booking that spans the studio's DST transition is handled by the UTC-instant slot generation
    below; no special case in this flow.

### Cancel a booking

- **Role(s):** Member (own bookings), Admin (any booking).
- **Trigger:** The cancel action on the member's own bookings list, or on the admin's all-bookings
  list.
- **Main flow:**
  1. `DELETE /api/bookings/:id` (member) or `DELETE /api/admin/bookings/:id` (admin).
  2. The server loads the booking and authorizes: a member may only cancel a booking whose
     `member_id` is its own; an admin may cancel any.
  3. For a member, it enforces the cutoff: reject with **403** and `code: 'CANCEL_WINDOW_CLOSED'` if
     `starts_at - now() < 2 hours`. **This check does not apply to admins.**
  4. In one transaction it sets `status = 'cancelled'`, `cancelled_at = now()`,
     `cancelled_by = <actor>`, and **deletes the booking's `booking_slots` rows**, which is what
     actually frees the slots.
  5. An admin cancelling someone else's booking also writes an `audit_log` entry.
- **Rules & edge cases:**
  - Cancelling an already-cancelled booking is a no-op returning 200, so a double-submitted form or a
    retried request doesn't error. This is the idempotency guarantee named in
    `operations.md` > Concurrency.
  - A booking that has already started cannot be cancelled by a member (the cutoff covers it) but can
    be by an admin.
  - The member is not notified when an admin cancels their booking. They find out by looking. This is
    a direct consequence of the no-notifications non-goal and is worth stating to members in the UI
    copy.

### Archive a resource

- **Role(s):** Admin.
- **Trigger:** The archive action on a resource in the admin resource list.
- **Main flow:**
  1. `POST /api/admin/resources/:id/archive`.
  2. The server counts future active bookings on that resource
     (`status = 'booked' AND ends_at > now()`).
  3. **If the count is greater than zero, the archive is blocked** with **409** and
     `code: 'RESOURCE_HAS_BOOKINGS'`, returning the conflicting bookings (date, time, member name —
     the admin is entitled to see names) so the admin can cancel them first.
  4. If zero, it sets `archived_at = now()`. The resource disappears from browse and from new-booking
     flows; past bookings referencing it keep working, because the row is never deleted.
- **Rules & edge cases:**
  - Archiving is reversible: `POST /api/admin/resources/:id/unarchive` clears `archived_at`.
  - Resources are never hard-deleted. `DELETE` is not implemented on this entity.
  - Archiving a _resource type_ that still has non-archived resources is blocked by the same pattern.

### Edit a resource

- **Role(s):** Admin.
- **Trigger:** Saving the resource edit form.
- **Main flow:**
  1. `PATCH /api/admin/resources/:id`.
  2. If the change narrows `open_time`/`close_time`, the server computes which future active bookings
     would fall outside the new window.
  3. If any would, it returns **409** with `code: 'BOOKINGS_OUTSIDE_NEW_HOURS'` and the list of
     affected bookings, **unless** the request carries `acknowledgeStrandedBookings: true`.
  4. With that acknowledgement, the edit is applied and **the stranded bookings stand** — they keep
     their slots and still appear in the member's list. This is warn-then-allow, not block.
- **Rules & edge cases:**
  - A stranded booking is a legitimate state. Availability generation reads the _current_ opening
    hours, so a stranded booking's slot won't appear in the grid at all — but the `booking_slots` row
    still blocks anyone else from taking it, and the member still sees it in their own list. The
    admin booking list flags it with a "outside current hours" marker.
  - Changing `name`, `description`, `capacity` or `type_id` never triggers the warning.
  - `capacity` is **descriptive only** and is never enforced. One booking per resource per slot, full
    stop. Capacity is a number displayed on the resource card ("seats 6"); no code reads it for a
    conflict check.

### Deactivate a member

- **Role(s):** Admin.
- **Trigger:** The deactivate action in the admin member list.
- **Main flow:**
  1. `POST /api/admin/members/:id/deactivate`.
  2. In one transaction: set `users.status = 'deactivated'` and `deactivated_at = now()`; cancel every
     future active booking (`status = 'cancelled'`, `cancelled_by = <admin>`) and delete their
     `booking_slots` rows, freeing those slots; delete every session row for that user, logging them
     out immediately.
  3. Write an `audit_log` entry.
- **Rules & edge cases:**
  - Past bookings are left untouched as history.
  - An admin cannot deactivate themselves, and cannot deactivate the last remaining active admin.
  - Reactivation (`/reactivate`) restores login but does **not** restore cancelled bookings.
  - A deactivated user attempting to log in gets the same generic failure as a wrong password — see
    `security.md`.

---

> **Skip unless** a use case runs in more than one mode — an import that can be "full replace,"
> "add only," or "remove only," for instance.

**Gate does not fire.** No use case here runs in multiple modes — there is no import, no feed, and no
bulk attribute update. Section left unfilled deliberately.

## Slot generation & DST

Not a use case, but a rule every use case above depends on, so it lives here rather than being
rediscovered per feature.

- The studio's wall clock is `Europe/Bucharest` (`STUDIO_TIME_ZONE`, a single configured constant).
  `resources.open_time` and `close_time` are `TIME` columns holding **studio-local wall clock**.
- All `timestamptz` values are stored in UTC (see `CLAUDE.md` > Code Style). A slot's identity is its
  UTC instant, never its local label.
- Slot generation for a given local date resolves the opening window to UTC via
  `(date + open_time) AT TIME ZONE 'Europe/Bucharest'`, then steps forward in 30-minute increments
  until the resolved closing instant. Because the walk happens in UTC instants, DST needs no special
  case in the booking logic:
  - **Spring forward** — the skipped local hour simply produces no slots, because no UTC instant maps
    to it.
  - **Fall back** — the repeated local hour produces two distinct slot instants, both bookable, both
    unique under `(resource_id, slot_start)`.
- `[TODO]` — how the repeated hour is _labelled_ in the UI on the fall-back day (e.g. "03:00 (1st)" /
  "03:00 (2nd)", or showing the UTC offset). The data is unambiguous; the display isn't decided. This
  affects one day a year and is not a Phase 1 blocker.

## Build Phases

Smallest useful slice first. Each phase ends at something runnable. Per `CLAUDE.md` > How We Work,
each phase is planned in Plan Mode against the relevant spec file before any code is written, and
work stops at the end of each phase for review.

### Phase 0 — Skeleton and schema

Vite + React + TypeScript frontend, Express + TypeScript backend, Postgres, `node-pg-migrate`
migrations, Vitest wired up, `/api/health` checking the database. Migrations for `users`,
`resource_types`, `resources`, `bookings`, `booking_slots`, `email_tokens`, `audit_log`,
and the `connect-pg-simple` session table. `npm run seed:admin`.

- **Automated tests:** migrations apply and roll back cleanly against a scratch database; the
  `booking_slots` unique index actually rejects a duplicate insert (a direct SQL test, before any
  application code can be blamed); `/api/health` returns 503 when the database is unreachable.
- **End-to-end check you can run:** `npm run dev`, open `/api/health` and see `{ status: 'ok', db:
'ok' }`; run `npm run seed:admin` and confirm the admin row exists via `psql`.

### Phase 1 — Accounts

Registration, email verification, login, logout, password reset, session middleware, the
`requireAuth` / `requireVerified` / `requireAdmin` guards, rate limiting on the auth endpoints.
Nodemailer with a console transport in development.

- **Automated tests:** password hashing and verification; a pending account is rejected by
  `requireVerified`; a verification token is single-use and expires; a reset token is invalidated
  after use; login rate limiting trips at the configured threshold; login with a deactivated account
  fails with the same generic message as a wrong password.
- **End-to-end check:** register in the browser, read the verification link from the terminal, click
  it, log in, log out, reset the password, log in with the new one.

### Phase 2 — Resources (admin)

Resource type CRUD, resource CRUD, archive/unarchive with the blocking rule, the admin resource list
with its filters.

- **Automated tests:** a member gets 403 on every `/api/admin/resources` route; archiving a resource
  with a future booking returns 409 and does not archive; archiving with none succeeds; a
  resource type with live resources cannot be archived.
- **End-to-end check:** log in as the seeded admin, create two resource types and four resources with
  opening hours, archive one, confirm it disappears from the list's active filter and comes back
  under "archived".

### Phase 3 — Browse and book

The availability endpoint and the day grid (resources × 30-minute slots), the type and time-window
filters, the booking dialog, `POST /api/bookings`.

- **Automated tests:** slot generation respects opening hours, including across the spring-forward and
  fall-back dates; every booking validation rule rejects correctly (misaligned boundaries, over 4
  slots, outside opening hours, inside the 30-minute notice window, beyond the 30-day horizon, over
  the 3-booking cap); **a concurrency test firing two simultaneous bookings at the same slot asserts
  exactly one 201 and one 409**; the availability response for member A never contains member B's id
  or name.
- **End-to-end check:** as a member, filter to one resource type and an afternoon window, book a
  90-minute slot, and watch it turn from free to booked. Then, in a second browser logged in as a
  different member, confirm that slot shows as "Booked" with no name attached.

### Phase 4 — My bookings and cancellation

The member's upcoming/past bookings list, member cancellation with the 2-hour cutoff, and the empty
state for a member with no bookings.

- **Automated tests:** cancelling at 2h01m before start succeeds; at 1h59m it returns 403; cancelling
  frees the slot for another member (assert the `booking_slots` row is gone and the slot is bookable
  again); cancelling an already-cancelled booking is a 200 no-op; member A cannot cancel member B's
  booking (403, and not 404 — it exists, they're just not allowed).
- **End-to-end check:** book a slot three hours out, cancel it, see the slot free again in the grid;
  book one 45 minutes out and confirm the cancel button is disabled with the reason shown.

### Phase 5 — Admin oversight

The all-bookings list with member names and filters, admin cancellation of any booking, the member
list, deactivate/reactivate, role promotion/demotion, the admin summary view, and `audit_log` writes
on every admin action.

- **Automated tests:** an admin can cancel inside the 2-hour window; deactivating a member cancels
  their future bookings, frees the slots and kills their sessions; the last admin cannot demote or
  deactivate themselves; every admin action writes exactly one audit row with the right actor.
- **End-to-end check:** as admin, cancel a member's booking and confirm from the member's own browser
  session that it now reads as cancelled — and that they received nothing telling them so.

### Phase 6 — Production readiness

Structured JSON request logging, Sentry with PII scrubbing, the `npm run purge:bookings` script,
accessibility pass over the grid (keyboard navigation, non-colour status indicators, contrast), the
dark-mode toggle, and the bundle-size budget check.

- **Automated tests:** the purge script deletes only bookings ending more than 12 months ago and
  writes its summary row; the logger redacts the fields listed in `operations.md`; an axe-core
  accessibility assertion on the grid and the booking dialog.
- **End-to-end check:** navigate the whole booking flow using only the keyboard, with the browser in
  greyscale — every free/booked distinction must still be readable. Then run the production build and
  confirm the gzipped JS is under 250KB.
