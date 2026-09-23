# UI / Design Guidelines

Only the cross-feature, durable design decisions go here. Layout of an individual screen belongs
in that feature's Plan Mode session, informed by this file — not spec'd upfront here.

## Design System

- Component library / design system: **shadcn/ui on Tailwind CSS**, with Radix primitives
  underneath. Components are copied into `client/src/components/ui/` and owned by this repo, so they
  can be read and edited like any other file. Radix gives the booking dialog, the type-filter
  dropdown and the date picker their keyboard and screen-reader behaviour, which is the main reason
  for the choice given the WCAG target below.
- Brand colors / typography: `[TODO]` — no brand exists yet. Until one does, the build uses shadcn's
  default neutral palette and the system font stack (`font-sans` as Tailwind ships it). No custom
  font is loaded, which also removes a render-blocking risk from the performance budget.
- Light/dark mode: **Both, with a manual toggle.** Defaults to the OS preference via
  `prefers-color-scheme`, overridable by a toggle in the header. The override persists in
  `localStorage` under `studio-theme`; a missing or unreadable value falls back to the OS preference
  rather than erroring. Implemented as Tailwind's `class` dark-mode strategy with a `dark` class on
  `<html>`.
- Responsive targets (mobile, tablet, desktop — which are must-support): **Desktop-first, mobile
  usable.** Desktop is the primary design target; every screen must remain fully operable on a phone.
  - **Stated tension, not resolved:** `functional.md` says members book from phones, and desktop-first
    puts the majority of sessions on the secondary target. It's a legitimate choice — the admin does
    the fiddly work on a laptop and the grid is genuinely denser than a phone likes — but it means the
    phone layout of the day grid needs real attention in Phase 3 rather than being left to fall out
    of the desktop CSS.
- Exact breakpoints and the layout change at each:
  - **< 640px (Tailwind `sm` and below)** — single column. The day grid drops its `resources × slots`
    matrix and becomes one collapsible section per resource, each listing its slots vertically.
    Navigation collapses behind a hamburger. Filters live in a bottom sheet.
  - **640–1023px (`sm`–`lg`)** — the grid returns as a matrix with a sticky first column (resource
    names) and horizontal scrolling for the time axis. Navigation is a top bar.
  - **≥ 1024px (`lg` and up)** — full grid, no horizontal scroll at the default time window, filters
    in a persistent left rail, admin screens get a fixed sidebar.
  - With 50 resources the grid is tall at every breakpoint. Rows are **paginated at 25 resources per
    page**, ordered by `resource_types.sort_order` then `resources.name`, rather than virtualised —
    pagination is simpler, keyboard-navigable, and enough at this scale. Revisit only if it isn't.
- Component structure convention: Feature-first, co-located.
  - `client/src/components/ui/` — the shadcn primitives, untouched except where a component genuinely
    needs changing.
  - `client/src/features/<feature>/` — components, hooks and API calls for one feature
    (`availability`, `bookings`, `auth`, `admin-resources`, `admin-bookings`, `admin-members`), with
    the components used by exactly one feature living beside it.
  - `client/src/components/` — only components used by more than one feature.
  - No per-component CSS files. Tailwind classes in the component; a `cn()` helper for conditionals.
- Browser/device support matrix — what's actually supported vs. best-effort: `[TODO]` — not decided.
  The working assumption until it is: current Chrome, Firefox, Safari and Edge, plus iOS Safari and
  Android Chrome; no Internet Explorer; no polyfills beyond what Vite's default browser targets
  provide.

## Information Architecture

- Top-level navigation structure:
  - `/` — **Browse availability** (the default landing screen for every logged-in user)
  - `/bookings` — **My bookings** (upcoming and past)
  - `/account` — display name and password
  - `/admin` — admin summary, visible only to admins
    - `/admin/resources`, `/admin/resource-types`, `/admin/bookings`, `/admin/members`
  - `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password` — the unauthenticated
    shell, which shares no navigation with the app.
- How roles (from functional.md) map to what nav/screens they see:
  - **Visitor** — only the unauthenticated shell. Any other route redirects to `/login`.
  - **Pending member** — every route redirects to `/verify-email`, which offers a resend. This is a
    hard gate, not a banner; a pending member sees no availability at all.
  - **Member** — Browse, My bookings, Account. The Admin entry is not rendered.
  - **Admin** — all of the above plus Admin. Hiding the nav item is presentation only; the server
    rejects the request regardless (see `security.md` > Authorization).

## Key Flows

- **Register → verify → first booking.** Registration lands on a "check your email" screen that names
  the address it sent to and offers a resend. The verification link opens the app already logged in
  where possible, and drops the member on Browse rather than a success page — the point is to book,
  not to read a confirmation.
- **Browse → select slots → confirm → booked.** Selecting a free slot and dragging or shift-clicking
  to extend selects up to four contiguous slots on one resource. A confirmation dialog states the
  resource, the local time range, and — when the start is less than 2 hours away — an explicit
  warning that **this booking cannot be cancelled by you once made; ask the studio admin**. On
  success, a toast confirms and the grid refetches. On a 409 the dialog stays open, shows "someone
  just took this slot", and the grid refetches beneath it.
- **Cancel a booking.** Always via a confirmation dialog naming the resource and time. Outside the
  2-hour window the cancel control is **disabled with a visible reason**, not hidden — a disabled
  control with an explanation teaches the rule, a missing one just looks broken.
- **Admin destructive actions** (archive a resource, cancel a member's booking, deactivate a member)
  share one confirmation-dialog pattern: what will happen, what it affects, and the consequence that
  nobody will be notified.

## Accessibility

- Target conformance level: **WCAG 2.1 AA.** Held to in the build, not aspirational — Phase 6 has an
  explicit accessibility pass and an axe-core assertion on the grid and the booking dialog.
- Anything specific:
  - **The availability grid must not signal free/booked by colour alone.** Every cell carries a text
    or shape indicator in addition to its fill (e.g. free cells show the time, booked cells show a
    "Booked" label or a hatched fill). The Phase 6 check is navigating the flow with the display in
    greyscale.
  - Full keyboard operation of the grid: arrow keys move between cells, Enter selects, Shift+Arrow
    extends a contiguous selection, Escape clears it. The grid uses a `role="grid"` structure with
    proper row/column headers so a screen reader announces "Room A, 10:00, booked".
  - Every dialog traps focus and restores it to the trigger on close (Radix handles this; don't
    replace it with a hand-rolled modal).
  - Toasts are announced via an ARIA live region. Because toasts are transient, **no information
    appears only in a toast** — the underlying screen always reflects the change too.
  - Form fields have real `<label>` elements; error text is linked via `aria-describedby` and the
    field gets `aria-invalid`.
- Minimum touch target size and spacing: **44×44 CSS px minimum with an 8px minimum gap** between
  interactive elements. This directly constrains the grid: at the mobile breakpoint the matrix is
  abandoned precisely because 30-minute cells cannot meet 44px in both axes on a phone.

## Feedback & Error States

- Error message convention by category:
  - **Field validation** — inline, beneath the field, in plain language ("Choose a time at least 30
    minutes from now"), never a raw constraint name.
  - **Business-rule rejection** (409/403 from the API — slot taken, cancellation window closed,
    booking cap reached) — inline banner within the dialog or panel that triggered it, keeping the
    user's context and input. The server sends a stable `code` and a human message; the client shows
    the message and switches on the `code` for any extra behaviour.
  - **Authorization denied** (403) — "You don't have access to this." Nothing about what exists or
    who does. See `security.md`.
  - **Network failure** — inline banner on the affected panel with a retry action. Not a toast, since
    a toast can vanish before it's read.
  - **Server error** (500) — a generic "Something went wrong on our end" plus a correlation id the
    user can quote. Never a stack trace or a database message; the detail goes to the server log
    (`CLAUDE.md` > Security Baseline).
- Success/confirmation message convention: **Toast for success, inline for errors.** A toast
  (top-right on desktop, top-centre on mobile, 5 seconds, dismissible) for booking created, booking
  cancelled, resource saved, member updated. Destructive actions get a confirmation dialog _before_
  the toast, never after. The screen beneath always updates too — see the accessibility note above.
- Loading-state convention: The control that triggered an async action is **disabled and shows a
  spinner in place of its label** until the request settles — the primary defence against a
  double-submitted booking, backed by the idempotency guarantee in `operations.md`. Lists and the grid
  use **skeleton placeholders** matching the final layout, so nothing shifts when data lands (this is
  also the CLS budget). Nothing here runs long enough to need a progress bar.
- Empty-state convention: A one-line explanation plus the next action, never just "No results".
  - Browse, no resources at all: "No resources yet." Admin also sees "Add a resource".
  - Browse, filters exclude everything: "No resources match these filters" + "Clear filters".
  - My bookings, none: "You haven't booked anything yet" + "Browse availability".
  - A resource that's closed on the selected day: the row renders with a "Closed" band, not an empty
    row, so the member can tell closed from fully booked.
- Client vs. server validation: **Every rule runs server-side; the client re-implements only the
  cheap, high-value ones** (required fields, password policy, slot contiguity, 4-slot maximum,
  30-minute notice, 30-day horizon). Drift is managed by keeping the numeric limits in one shared
  module — `shared/bookingRules.ts`, imported by both sides — so a changed constant can't apply in
  only one place. Rules that depend on other rows (slot availability, the 3-booking cap) are
  **server-only**; the client never pre-empts them, it just renders the rejection.
- Session-expiry behavior: Any `401` on an API call clears client auth state and redirects to
  `/login` with a `?next=` parameter, showing "Your session expired — please log in again." **Unsaved
  input does not survive**, and no form here holds more than a few fields. The one place this is
  actively mitigated: the booking dialog re-validates on open, so an expired session is discovered
  before the user picks anything rather than after.

## Localization & Formatting

> **Skip unless** this app has more than one language, serves users across time zones, or
> displays money. Retrofitting i18n is expensive, so answer the first question even if the answer
> is "English only, and that won't change."

**Gate does not fire.** English only, one time zone (`Europe/Bucharest`), no money anywhere — no
payments or billing is an explicit non-goal. Section left unfilled deliberately.

The one fact that would otherwise live here, because the rest of the spec depends on it: all
timestamps are stored in UTC and rendered in the fixed studio zone `Europe/Bucharest`, **not** the
browser's zone. A shared physical space has one wall clock. The zone is a single configured constant
(`STUDIO_TIME_ZONE`); formatting uses `Intl.DateTimeFormat` with that zone pinned, so no date library
enters the bundle. See `functional.md` > Slot generation & DST for the transition-day behaviour.

## Per-Screen Specification Files

None written yet. The one screen that may earn its own `specifications/pages/browse-availability.md`
is the availability grid — it has three breakpoint layouts, a keyboard interaction model, pagination,
a multi-slot selection gesture, and four distinct cell states. **Decide at the start of Phase 3**
whether Plan Mode alone is enough; if the plan starts sprawling, write the page spec instead of
pushing through.
