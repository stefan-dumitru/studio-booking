# Security Requirements

The project-wide default posture (validate input, no secrets in code, default-deny authz) is in
[../CLAUDE.md](../CLAUDE.md) and applies regardless of what's filled in below. This file is for
requirements specific to _this app_ — its data sensitivity, its auth model, its compliance scope.

## Data Sensitivity

- What's the most sensitive data this app stores (PII, payment, health, none): **PII.** Names, email
  addresses, bcrypt password hashes, IP addresses in the audit log — and, less obviously but more
  importantly, **a record of which named person was physically in a specific room at a specific
  time**. That presence history is the most sensitive thing here. It's why members see "Booked"
  rather than a name (`functional.md` > User Roles), and why it drives the retention rule rather than
  being kept forever by default.
- Any regulatory scope (GDPR, HIPAA, PCI-DSS, SOC 2, none): **GDPR applies.** No payment data (PCI is
  out of scope by the no-payments non-goal), no health data, no SOC 2 commitment.
  - **Lawful basis:** `[TODO]` — not decided. Legitimate interest and contract are both arguable for
    a membership booking system. It needs naming before the app is deployed, because it determines
    what the privacy notice has to say.
  - **Data subject rights implemented:** access (a member sees their own bookings in full) and
    erasure (the anonymisation procedure in `data-model.md` > Data Retention). Portability and
    rectification beyond editing a display name are `[TODO]`.
  - **Privacy notice / consent copy:** `[TODO]` — none written. Registration currently collects
    personal data without presenting one. A deployment blocker, not a Phase 1 blocker.

## Authentication

Which identity source this app uses is in `functional.md` > Authentication & Identity Source.
This section covers how it's implemented and how it fails.

- If login is local: method: **Email + password**, created in this app. No magic links, no OAuth, no
  external provider. Registration requires an emailed verification link before the account can do
  anything (`functional.md` > Authentication & Identity Source).
  - **Password policy:** minimum 8 characters with mixed character types — at least one uppercase,
    one lowercase and one digit. Enforced identically on the client and the server from one shared
    module (`shared/passwordPolicy.ts`), so the two cannot drift.
  - **Hashing:** bcrypt, per `CLAUDE.md` > Security Baseline. Cost factor is configuration, not a
    literal, with a sane default and a comment explaining what raising it costs.
  - **Password reset:** emailed single-use token (`email_tokens.purpose = 'reset_password'`). The
    forgot-password endpoint returns the **same response whether or not the email exists**, so it
    can't be used to enumerate members. Completing a reset invalidates every outstanding token for
    that user and **destroys all of that user's sessions**, so a stolen session doesn't survive the
    recovery it triggered.
  - **Token storage:** only a SHA-256 hash of each token is stored; the raw value exists solely in
    the email. Token lifetimes per purpose: `[TODO]` — undecided, needed before Phase 1.
- Session handling — JWT or server session, cookie flags, expiry and refresh policy: **Server-side
  sessions** in Postgres via `express-session` + `connect-pg-simple`. Chosen specifically because
  deactivating a member must lock them out _immediately_, which a stateless JWT can't do without
  reintroducing server state as a denylist.
  - Cookie: `httpOnly`, `sameSite: 'lax'`, `secure: true` in production (and in any environment
    served over HTTPS), `path: '/'`, no `domain` set. Signed with `SESSION_SECRET` from the
    environment.
  - The session id is **regenerated on login** (`req.session.regenerate`) to close session fixation,
    and the session is destroyed server-side on logout — not merely cleared client-side.
  - Expiry / idle timeout: `[TODO]` — no duration decided. Needed before Phase 1; a rolling
    expiry refreshed on activity is the likely shape, but the number is yours.
  - Because sessions are cookie-borne, **CSRF protection is required** on every state-changing
    request: a double-submit token issued at login, checked by middleware on all non-GET routes.
    `sameSite: 'lax'` alone is defence in depth, not the control.
- MFA required: **No.** Out of scope for launch, recorded as an accepted risk. The admin account is
  the one that would most justify it.
- If the identity comes from an external provider: Not applicable. Failure modes for _this app's_
  own login, since they're the equivalent case that otherwise gets forgotten:
  - **Wrong password, unknown email, unverified account, and deactivated account all return the same
    generic failure** ("Email or password is incorrect, or the account isn't active") with the same
    response time characteristics. A distinct "this account is deactivated" message is a membership
    oracle.
  - The one exception is a _logged-in_ pending member: once authenticated they're told plainly that
    their email needs verifying, because at that point they've already proven who they are.
  - A session whose user has since been deactivated or deleted is rejected and destroyed on the next
    request — the auth middleware re-reads `users.status` from the database on **every** request
    rather than trusting what was true at login. It fails **closed**.

## Authorization

- Model: **Role-based (`member` / `admin`) plus ownership.** The two roles come from
  `functional.md` > User Roles. Role alone is never sufficient for booking routes — a member's own
  booking is reached by ownership (`bookings.member_id = session user id`), and an admin reaches any
  booking by role.
- Enforcement pattern: Composable Express middleware in `server/src/middleware/auth.ts`, applied at
  the router level so a new route can't silently ship unguarded:
  - `requireAuth` — a valid session whose user is loaded and `status !== 'deactivated'`; otherwise 401.
  - `requireVerified` — `requireAuth` plus `status === 'active'`; otherwise 403 with
    `code: 'EMAIL_NOT_VERIFIED'`. **Every business route uses this, not `requireAuth`.**
  - `requireAdmin` — `requireVerified` plus `role === 'admin'`; otherwise 403.
  - `requireOwnBooking` — loads the booking and checks `member_id`; a member acting on someone else's
    booking gets **403, not 404**, and the handler never proceeds.
  - The entire `/api/admin` router is mounted behind `requireAdmin` in one place, so admin routes are
    default-deny by construction rather than by each handler remembering.
- **Authorization is also a serialization concern here, not only a routing one.** The rule that a
  member never learns who holds a slot is enforced by using separate response serializers —
  `toMemberAvailability()` and `toAdminBooking()` in `server/src/serializers/` — rather than by
  filtering fields in the route handler. A member-facing availability cell carries
  `status: 'free' | 'booked' | 'mine'` and nothing else; there is no code path that can put another
  member's id or name into a member's response. This is worth a dedicated test, and it has one in
  Phase 3.

## Data Protection

- Encryption at rest: Whole-volume encryption on the database host, once deployed. **No
  column-level encryption** — nothing stored here (names, emails, booking times) is worth the key
  management and the loss of queryability. Password hashes are hashes, not encrypted data.
  Managed-Postgres-with-encryption-enabled is the expected shape; the specific provider is
  `[TODO]` (see `operations.md`).
- Transit security beyond the HTTPS baseline in CLAUDE.md — mTLS, VPN, or a private network: HTTPS
  everywhere, per `CLAUDE.md`. The app-to-database connection must use TLS (`sslmode=require` or
  stricter) once the database isn't on the same host. No mTLS, no VPN, no service mesh — there's one
  app and one database.
- Fields requiring extra protection: cross-referencing `data-model.md`:
  - `users.password_hash` — never selected into any response object, never logged, excluded by the
    user serializer rather than deleted after the fact.
  - `email_tokens.token_hash` — never returned by any endpoint; the raw token exists only in the
    email body and the URL the user clicks.
  - `users.email` — masked in operational logs (see `operations.md` > Observability) and scrubbed
    before anything reaches Sentry.
  - `audit_log.ip` — personal data under GDPR. Readable only by an admin, and the reason
    `audit_log` needs a retention number.
  - `SESSION_SECRET`, `DATABASE_URL`, SMTP credentials and the Sentry DSN — environment variables
    only, `.env` gitignored, per `CLAUDE.md`.

## File Upload Handling

> **Skip unless** this app accepts file uploads — imports, attachments, avatars, anything.

**Gate does not fire.** No uploads of any kind — no resource photos, no avatars, no spreadsheet
import, all explicit non-goals. The app should carry no multipart body parser at all, so this stays
true by construction. Section left unfilled deliberately.

## Threat Model (lightweight)

- Biggest realistic threat to this app, in order:
  1. **Credential stuffing / brute force against member accounts**, once it's reachable from the
     internet. A compromised account gives an attacker another member's schedule — that presence
     history again — and the ability to book or cancel in their name. Mitigations: bcrypt, rate
     limiting on the auth endpoints, generic failure messages, login events in the audit log.
  2. **Compromise of the single admin account.** One admin can cancel every booking, deactivate every
     member, and read the full presence history of everyone in the studio. No MFA is the accepted gap
     here; the mitigation is that every admin action is audited.
  3. **Authorization slips in new admin endpoints** — an `/api/admin` route added without the guard,
     or a member-facing serializer leaking a name. Mitigated by mounting the whole admin router
     behind `requireAdmin` and by the serializer split, both of which make the safe path the
     default.
  4. **XSS leading to session theft.** Reduced by React's default escaping, by `httpOnly` cookies
     (a stolen token isn't readable from JavaScript), and by never rendering user-supplied HTML.
     Resource descriptions are plain text, rendered as text.
  5. **Slot hoarding / denial of availability** by a member scripting bookings. Bounded by the
     3-booking cap and the 30-day horizon far more than by rate limiting.
- Anything explicitly out of scope for launch (accepted risk, revisit later):
  - No MFA, including for the admin.
  - No account lockout after repeated failures — rate limiting only, so a legitimate member can't be
    locked out by someone else guessing at their email.
  - No Content-Security-Policy beyond what Helmet's defaults give. `[TODO]` — a real CSP before
    deployment.
  - No penetration test, no dependency-vulnerability scanning in CI. `[TODO]`.
  - No brute-force protection on the verification/reset token endpoints beyond the auth rate limit;
    tokens are long and random enough that this is a reasonable trade.

## Audit / Logging

- What actions must be logged for audit purposes — cross-referencing the `audit_log` entity in
  `data-model.md`:
  - **Authentication:** `login.success`, `login.failure` (with the attempted email and IP; for an
    unknown email, `actor_id` is null), `logout`, `password.reset_requested`,
    `password.reset_completed`, `email.verified`.
  - **Admin actions on other people's data:** `admin.booking.cancel` (with the booking id and the
    affected member), `admin.member.deactivate`, `admin.member.reactivate`,
    `admin.member.role_change` (old role → new role).
  - **Resource lifecycle:** `resource.create`, `resource.update` (with the changed field names, not a
    full before/after), `resource.archive`, `resource.unarchive`, and the same four for
    `resource_type`.
  - **System:** `job.purge` — one row per purge run with the counts deleted.
  - **Deliberately not audited:** a member creating or cancelling their _own_ booking. The
    `bookings` row already carries `created_at`, `cancelled_at` and `cancelled_by`; a second record
    of the same fact would just be noise.
  - Every audit row is written **in the same transaction as the action**, so an admin cancellation
    without its audit entry is not a reachable state.
- Log retention: `[TODO]` — undecided, and it matters because `audit_log.ip` is personal data. The
  purge job deletes old bookings and tokens but currently touches nothing here. Needs a number
  before deployment, at which point the purge script gets a third step.
- If this app does bulk operations — what's logged per record: Not applicable; no bulk operations
  (`data-model.md` > Bulk Operations). The nearest case, deactivating a member, writes one
  `admin.member.deactivate` row whose `detail` carries the ids of the bookings it cancelled — so
  "what happened to booking X" is still answerable from the log.
