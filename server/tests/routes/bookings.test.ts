import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import type { Express } from 'express';
import { createTestPool, truncateAll } from '../helpers/testDb.js';
import { buildTestApp } from '../helpers/testApp.js';
import type { FakeMailer } from '../helpers/fakeMailer.js';
import { loginAsAdmin } from '../helpers/adminAgent.js';
import type { AdminSession } from '../helpers/adminAgent.js';
import { loginAsMember } from '../helpers/memberAgent.js';
import type { MemberSession } from '../helpers/memberAgent.js';
import { createResourceFixture } from '../helpers/resourceFixtures.js';

/** A studio-local "HH:MM" a fixed number of minutes from now, plus the
 * matching local date -- used to build resources/slots that are guaranteed
 * bookable (or guaranteed too-soon/beyond-horizon) regardless of when this
 * suite runs. */
function localHourMinuteAndDate(minutesFromNow: number): {
  time: string;
  date: string;
} {
  const instant = new Date(Date.now() + minutesFromNow * 60 * 1000);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Bucharest',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant);
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bucharest',
  }).format(instant);
  return { time, date };
}

/** Rounds an instant up to the next 30-minute UTC boundary -- what a real
 * booking's startsAt must align to. */
function nextSlotBoundary(instant: Date): Date {
  const ms = 30 * 60 * 1000;
  return new Date(Math.ceil(instant.getTime() / ms) * ms);
}

describe('POST /api/bookings', () => {
  let pool: Pool;
  let app: Express;
  let mailer: FakeMailer;
  let admin: AdminSession;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
    ({ app, mailer } = buildTestApp(pool));
    admin = await loginAsAdmin(app, pool, mailer, 'admin@example.com');
  });

  /** A resource open all day, so a booking starting MIN_NOTICE_MINUTES+ out is
   * always inside its hours regardless of what time this suite runs. Deriving
   * open/close from two separate "now" offsets (e.g. -60 / +360 minutes) broke
   * whenever that span crossed midnight -- the resulting closeTime sorted
   * before openTime and every resource creation in this fixture 400'd. */
  async function bookableResourceFixture(): Promise<{ resourceId: string }> {
    const { resourceId } = await createResourceFixture(admin, {
      openTime: '00:00',
      closeTime: '23:30',
    });
    return { resourceId };
  }

  function bookableSlot(): { startsAt: string; endsAt: string } {
    // 40 minutes out clears the 30-minute notice window with margin.
    const startsAt = nextSlotBoundary(new Date(Date.now() + 40 * 60 * 1000));
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
    return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
  }

  describe('authorization', () => {
    it('rejects an unauthenticated request', async () => {
      const response = await request(app).post('/api/bookings').send({});
      expect(response.status).toBe(401);
    });
  });

  describe('validation', () => {
    let member: MemberSession;
    let resourceId: string;

    beforeEach(async () => {
      member = await loginAsMember(app, pool, mailer, 'validator@example.com');
      ({ resourceId } = await bookableResourceFixture());
    });

    it('rejects a startsAt not on a 30-minute boundary', async () => {
      const { startsAt, endsAt } = bookableSlot();
      const misaligned = new Date(
        new Date(startsAt).getTime() + 5 * 60 * 1000,
      ).toISOString();

      const response = await member.agent
        .post('/api/bookings')
        .set('X-CSRF-Token', member.csrfToken)
        .send({ resourceId, startsAt: misaligned, endsAt });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a duration longer than 4 slots', async () => {
      const { startsAt } = bookableSlot();
      const tooLong = new Date(
        new Date(startsAt).getTime() + 150 * 60 * 1000,
      ).toISOString();

      const response = await member.agent
        .post('/api/bookings')
        .set('X-CSRF-Token', member.csrfToken)
        .send({ resourceId, startsAt, endsAt: tooLong });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects endsAt before startsAt', async () => {
      const { startsAt, endsAt } = bookableSlot();

      const response = await member.agent
        .post('/api/bookings')
        .set('X-CSRF-Token', member.csrfToken)
        .send({ resourceId, startsAt: endsAt, endsAt: startsAt });

      expect(response.status).toBe(400);
    });

    it('rejects a missing CSRF token', async () => {
      const { startsAt, endsAt } = bookableSlot();
      const response = await member.agent
        .post('/api/bookings')
        .send({ resourceId, startsAt, endsAt });
      expect(response.status).toBe(403);
    });
  });

  describe('business rules', () => {
    let member: MemberSession;

    beforeEach(async () => {
      member = await loginAsMember(app, pool, mailer, 'rules@example.com');
    });

    it('rejects a nonexistent resource', async () => {
      const { startsAt, endsAt } = bookableSlot();
      const response = await member.agent
        .post('/api/bookings')
        .set('X-CSRF-Token', member.csrfToken)
        .send({ resourceId: '999999', startsAt, endsAt });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('rejects an archived resource', async () => {
      const { resourceId } = await bookableResourceFixture();
      await admin.agent
        .post(`/api/admin/resources/${resourceId}/archive`)
        .set('X-CSRF-Token', admin.csrfToken);
      const { startsAt, endsAt } = bookableSlot();

      const response = await member.agent
        .post('/api/bookings')
        .set('X-CSRF-Token', member.csrfToken)
        .send({ resourceId, startsAt, endsAt });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('RESOURCE_ARCHIVED');
    });

    it('rejects a slot outside the opening hours', async () => {
      // Opens/closes entirely in the past relative to "now" -- any future
      // slot request necessarily falls outside this window.
      const opens = localHourMinuteAndDate(-6 * 60).time;
      const closes = localHourMinuteAndDate(-5 * 60).time;
      const { resourceId } = await createResourceFixture(admin, {
        openTime: opens,
        closeTime: closes,
      });
      const { startsAt, endsAt } = bookableSlot();

      const response = await member.agent
        .post('/api/bookings')
        .set('X-CSRF-Token', member.csrfToken)
        .send({ resourceId, startsAt, endsAt });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('OUTSIDE_OPENING_HOURS');
    });

    it('rejects a slot starting inside the minimum-notice window', async () => {
      const { resourceId } = await bookableResourceFixture();
      // The very next slot boundary after "now" is always strictly under 30
      // minutes away (0 to just-under-30, depending what minute it is right
      // now) -- unlike "now + 5min rounded up", which can land anywhere from
      // 5 to 35 minutes out and occasionally clears the notice window by
      // chance. That was flaky; this is deterministic regardless of when the
      // suite runs.
      const startsAt = nextSlotBoundary(new Date()).toISOString();
      const endsAt = new Date(
        new Date(startsAt).getTime() + 30 * 60 * 1000,
      ).toISOString();

      const response = await member.agent
        .post('/api/bookings')
        .set('X-CSRF-Token', member.csrfToken)
        .send({ resourceId, startsAt, endsAt });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('TOO_SOON');
    });

    it('rejects a slot beyond the booking horizon', async () => {
      const { resourceId } = await createResourceFixture(admin, {
        openTime: '00:00',
        closeTime: '23:30',
      });
      const startsAt = nextSlotBoundary(
        new Date(Date.now() + 40 * 24 * 60 * 60 * 1000),
      ).toISOString();
      const endsAt = new Date(
        new Date(startsAt).getTime() + 30 * 60 * 1000,
      ).toISOString();

      const response = await member.agent
        .post('/api/bookings')
        .set('X-CSRF-Token', member.csrfToken)
        .send({ resourceId, startsAt, endsAt });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('BEYOND_HORIZON');
    });

    it('rejects a 4th active booking', async () => {
      const { resourceId } = await bookableResourceFixture();

      for (let i = 0; i < 3; i += 1) {
        const startsAt = nextSlotBoundary(
          new Date(Date.now() + (40 + i * 60) * 60 * 1000),
        ).toISOString();
        const endsAt = new Date(
          new Date(startsAt).getTime() + 30 * 60 * 1000,
        ).toISOString();
        const response = await member.agent
          .post('/api/bookings')
          .set('X-CSRF-Token', member.csrfToken)
          .send({ resourceId, startsAt, endsAt });
        expect(response.status).toBe(201);
      }

      // Continues the loop's own +60-minute cadence rather than a disconnected
      // fixed offset -- a large fixed offset (e.g. +300 minutes) can round
      // past the resource's same-day closeTime depending on what time this
      // suite happens to run.
      const fourthStart = nextSlotBoundary(
        new Date(Date.now() + (40 + 3 * 60) * 60 * 1000),
      ).toISOString();
      const fourthEnd = new Date(
        new Date(fourthStart).getTime() + 30 * 60 * 1000,
      ).toISOString();
      const response = await member.agent
        .post('/api/bookings')
        .set('X-CSRF-Token', member.csrfToken)
        .send({ resourceId, startsAt: fourthStart, endsAt: fourthEnd });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('BOOKING_LIMIT_REACHED');
    });

    it('rejects an already-taken slot with the pre-check path', async () => {
      const { resourceId } = await bookableResourceFixture();
      const { startsAt, endsAt } = bookableSlot();

      const first = await member.agent
        .post('/api/bookings')
        .set('X-CSRF-Token', member.csrfToken)
        .send({ resourceId, startsAt, endsAt });
      expect(first.status).toBe(201);

      const otherMember = await loginAsMember(
        app,
        pool,
        mailer,
        'other@example.com',
      );
      const second = await otherMember.agent
        .post('/api/bookings')
        .set('X-CSRF-Token', otherMember.csrfToken)
        .send({ resourceId, startsAt, endsAt });

      expect(second.status).toBe(409);
      expect(second.body.code).toBe('SLOT_TAKEN');
      expect(second.body.slots).toEqual([startsAt]);
    });

    it('creates a successful booking and does not audit it', async () => {
      const { resourceId } = await bookableResourceFixture();
      const { startsAt, endsAt } = bookableSlot();

      const response = await member.agent
        .post('/api/bookings')
        .set('X-CSRF-Token', member.csrfToken)
        .send({ resourceId, startsAt, endsAt });

      expect(response.status).toBe(201);
      expect(response.body.booking.status).toBe('booked');

      // security.md: a member creating their own booking is deliberately
      // not audited -- the bookings row itself is the record.
      const auditRows = await pool.query(
        "SELECT 1 FROM audit_log WHERE action LIKE 'booking%'",
      );
      expect(auditRows.rowCount).toBe(0);
    });
  });

  describe('concurrency', () => {
    it('lets exactly one of two simultaneous requests for the same slot succeed', async () => {
      const { resourceId } = await bookableResourceFixture();
      const { startsAt, endsAt } = bookableSlot();

      const memberA = await loginAsMember(app, pool, mailer, 'racer-a@example.com');
      const memberB = await loginAsMember(app, pool, mailer, 'racer-b@example.com');

      const [responseA, responseB] = await Promise.all([
        memberA.agent
          .post('/api/bookings')
          .set('X-CSRF-Token', memberA.csrfToken)
          .send({ resourceId, startsAt, endsAt }),
        memberB.agent
          .post('/api/bookings')
          .set('X-CSRF-Token', memberB.csrfToken)
          .send({ resourceId, startsAt, endsAt }),
      ]);

      const statuses = [responseA.status, responseB.status].sort();
      expect(statuses).toEqual([201, 409]);

      const winner = responseA.status === 201 ? responseA : responseB;
      const loser = responseA.status === 201 ? responseB : responseA;
      expect(winner.body.booking.status).toBe('booked');
      expect(loser.body.code).toBe('SLOT_TAKEN');

      // The real guarantee: exactly one row in booking_slots for this
      // instant, no matter how the race resolved.
      const slotRows = await pool.query(
        'SELECT count(*)::int AS count FROM booking_slots WHERE resource_id = $1 AND slot_start = $2',
        [resourceId, startsAt],
      );
      expect(slotRows.rows[0].count).toBe(1);
    });

    it("never lets a member's concurrent bookings exceed the 3-active cap", async () => {
      const { resourceId } = await bookableResourceFixture();
      const member = await loginAsMember(app, pool, mailer, 'capracer@example.com');

      // Bring the member to exactly 2 active bookings first (sequential, no race).
      for (let i = 0; i < 2; i += 1) {
        const startsAt = nextSlotBoundary(
          new Date(Date.now() + (40 + i * 60) * 60 * 1000),
        ).toISOString();
        const endsAt = new Date(
          new Date(startsAt).getTime() + 30 * 60 * 1000,
        ).toISOString();
        const response = await member.agent
          .post('/api/bookings')
          .set('X-CSRF-Token', member.csrfToken)
          .send({ resourceId, startsAt, endsAt });
        expect(response.status).toBe(201);
      }

      // Two more, fired concurrently, on different slots (so the race is
      // purely over the cap, not booking_slots' constraint).
      const thirdStart = nextSlotBoundary(
        new Date(Date.now() + 300 * 60 * 1000),
      ).toISOString();
      const thirdEnd = new Date(
        new Date(thirdStart).getTime() + 30 * 60 * 1000,
      ).toISOString();
      const fourthStart = nextSlotBoundary(
        new Date(Date.now() + 400 * 60 * 1000),
      ).toISOString();
      const fourthEnd = new Date(
        new Date(fourthStart).getTime() + 30 * 60 * 1000,
      ).toISOString();

      const [thirdResponse, fourthResponse] = await Promise.all([
        member.agent
          .post('/api/bookings')
          .set('X-CSRF-Token', member.csrfToken)
          .send({ resourceId, startsAt: thirdStart, endsAt: thirdEnd }),
        member.agent
          .post('/api/bookings')
          .set('X-CSRF-Token', member.csrfToken)
          .send({ resourceId, startsAt: fourthStart, endsAt: fourthEnd }),
      ]);

      const statuses = [thirdResponse.status, fourthResponse.status].sort();
      expect(statuses).toEqual([201, 409]);

      const activeCount = await pool.query(
        "SELECT count(*)::int AS count FROM bookings WHERE member_id = $1 AND status = 'booked' AND ends_at > now()",
        [member.userId],
      );
      expect(activeCount.rows[0].count).toBe(3);
    });

    it('never leaves a resource both archived and holding a live booking', async () => {
      // Booking creation FOR SHARE-locks the resource row; archive
      // FOR UPDATE-locks it -- the two are mutually exclusive, so whichever
      // request's transaction acquires the lock first fully commits or
      // rolls back before the other proceeds (operations.md > Concurrency,
      // race #2). There is no interleaving that could produce an archived
      // resource with a future booking still attached to it.
      const { resourceId } = await bookableResourceFixture();
      const member = await loginAsMember(
        app,
        pool,
        mailer,
        'archiveracer@example.com',
      );
      const { startsAt, endsAt } = bookableSlot();

      const [bookingResponse, archiveResponse] = await Promise.all([
        member.agent
          .post('/api/bookings')
          .set('X-CSRF-Token', member.csrfToken)
          .send({ resourceId, startsAt, endsAt }),
        admin.agent
          .post(`/api/admin/resources/${resourceId}/archive`)
          .set('X-CSRF-Token', admin.csrfToken),
      ]);

      const bookingSucceeded = bookingResponse.status === 201;
      const archiveSucceeded = archiveResponse.status === 200;

      // Exactly one of the two possible consistent outcomes, never both
      // succeeding and never both failing.
      if (bookingSucceeded) {
        expect(archiveSucceeded).toBe(false);
        expect(archiveResponse.body.code).toBe('RESOURCE_HAS_BOOKINGS');
      } else {
        expect(archiveSucceeded).toBe(true);
        expect(bookingResponse.body.code).toBe('RESOURCE_ARCHIVED');
      }

      const finalState = await pool.query<{ archived_at: Date | null }>(
        'SELECT archived_at FROM resources WHERE id = $1',
        [resourceId],
      );
      const liveSlot = await pool.query(
        'SELECT count(*)::int AS count FROM booking_slots WHERE resource_id = $1',
        [resourceId],
      );
      const isArchived = finalState.rows[0]!.archived_at !== null;
      const hasLiveSlot = liveSlot.rows[0].count > 0;
      expect(isArchived && hasLiveSlot).toBe(false);
    });
  });
});

describe('GET /api/bookings/mine', () => {
  let pool: Pool;
  let app: Express;
  let mailer: FakeMailer;
  let admin: AdminSession;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
    ({ app, mailer } = buildTestApp(pool));
    admin = await loginAsAdmin(app, pool, mailer, 'admin@example.com');
  });

  async function bookableResourceFixture(): Promise<{ resourceId: string }> {
    const { resourceId } = await createResourceFixture(admin, {
      openTime: '00:00',
      closeTime: '23:30',
    });
    return { resourceId };
  }

  it('rejects an unauthenticated request', async () => {
    const response = await request(app).get('/api/bookings/mine');
    expect(response.status).toBe(401);
  });

  it('splits bookings between upcoming and past, includes the resource name, and never leaks another member', async () => {
    const { resourceId } = await bookableResourceFixture();
    const member = await loginAsMember(app, pool, mailer, 'mine@example.com');
    const otherMember = await loginAsMember(app, pool, mailer, 'notmine@example.com');

    const upcomingStart = nextSlotBoundary(
      new Date(Date.now() + 150 * 60 * 1000),
    ).toISOString();
    const upcomingEnd = new Date(
      new Date(upcomingStart).getTime() + 30 * 60 * 1000,
    ).toISOString();
    const created = await member.agent
      .post('/api/bookings')
      .set('X-CSRF-Token', member.csrfToken)
      .send({ resourceId, startsAt: upcomingStart, endsAt: upcomingEnd });
    expect(created.status).toBe(201);

    // A past booking the current API can't produce -- inserted directly,
    // same pattern dbHelpers.ts already uses elsewhere.
    const pastStart = nextSlotBoundary(new Date(Date.now() - 3 * 60 * 60 * 1000));
    const pastEnd = new Date(pastStart.getTime() + 30 * 60 * 1000);
    await pool.query(
      `INSERT INTO bookings (resource_id, member_id, starts_at, ends_at)
       VALUES ($1, $2, $3, $4)`,
      [resourceId, member.userId, pastStart, pastEnd],
    );

    // A booking belonging to someone else entirely -- must never appear in
    // either of this member's lists.
    const otherStart = nextSlotBoundary(
      new Date(Date.now() + 200 * 60 * 1000),
    ).toISOString();
    const otherEnd = new Date(
      new Date(otherStart).getTime() + 30 * 60 * 1000,
    ).toISOString();
    const otherCreated = await otherMember.agent
      .post('/api/bookings')
      .set('X-CSRF-Token', otherMember.csrfToken)
      .send({ resourceId, startsAt: otherStart, endsAt: otherEnd });
    expect(otherCreated.status).toBe(201);

    const upcoming = await member.agent.get('/api/bookings/mine?scope=upcoming');
    expect(upcoming.status).toBe(200);
    expect(upcoming.body.items).toHaveLength(1);
    expect(upcoming.body.items[0].id).toBe(created.body.booking.id);
    expect(upcoming.body.items[0].resourceName).toEqual(expect.any(String));
    expect(
      upcoming.body.items.some((item: { id: string }) => item.id === otherCreated.body.booking.id),
    ).toBe(false);

    const past = await member.agent.get('/api/bookings/mine?scope=past');
    expect(past.status).toBe(200);
    expect(past.body.items).toHaveLength(1);
    expect(past.body.items[0].startsAt).toBe(pastStart.toISOString());
  });
});

describe('DELETE /api/bookings/:id', () => {
  let pool: Pool;
  let app: Express;
  let mailer: FakeMailer;
  let admin: AdminSession;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
    ({ app, mailer } = buildTestApp(pool));
    admin = await loginAsAdmin(app, pool, mailer, 'admin@example.com');
  });

  async function bookableResourceFixture(): Promise<{ resourceId: string }> {
    const { resourceId } = await createResourceFixture(admin, {
      openTime: '00:00',
      closeTime: '23:30',
    });
    return { resourceId };
  }

  /** Well clear of both the 30-minute minimum notice and the 2-hour cancel
   * cutoff, so a booking made from this slot starts cancellable. */
  function cancellableSlot(): { startsAt: string; endsAt: string } {
    const startsAt = nextSlotBoundary(
      new Date(Date.now() + 150 * 60 * 1000),
    ).toISOString();
    const endsAt = new Date(new Date(startsAt).getTime() + 30 * 60 * 1000).toISOString();
    return { startsAt, endsAt };
  }

  /** Clears the 30-minute minimum notice but sits well inside the 2-hour
   * cancel cutoff -- a booking made from this slot cannot be self-cancelled. */
  function withinCutoffSlot(): { startsAt: string; endsAt: string } {
    const startsAt = nextSlotBoundary(
      new Date(Date.now() + 50 * 60 * 1000),
    ).toISOString();
    const endsAt = new Date(new Date(startsAt).getTime() + 30 * 60 * 1000).toISOString();
    return { startsAt, endsAt };
  }

  it('rejects an unauthenticated request', async () => {
    const response = await request(app).delete('/api/bookings/999999999');
    expect(response.status).toBe(401);
  });

  it('returns 404 for a booking that does not exist', async () => {
    const member = await loginAsMember(app, pool, mailer, 'ghost@example.com');
    const response = await member.agent
      .delete('/api/bookings/999999999')
      .set('X-CSRF-Token', member.csrfToken);
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('BOOKING_NOT_FOUND');
  });

  it('succeeds well outside the 2-hour cutoff and frees the slot', async () => {
    const { resourceId } = await bookableResourceFixture();
    const member = await loginAsMember(app, pool, mailer, 'canceller@example.com');
    const { startsAt, endsAt } = cancellableSlot();

    const created = await member.agent
      .post('/api/bookings')
      .set('X-CSRF-Token', member.csrfToken)
      .send({ resourceId, startsAt, endsAt });
    expect(created.status).toBe(201);
    const bookingId = created.body.booking.id;

    const cancelled = await member.agent
      .delete(`/api/bookings/${bookingId}`)
      .set('X-CSRF-Token', member.csrfToken);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.booking.status).toBe('cancelled');

    const slotRows = await pool.query(
      'SELECT count(*)::int AS count FROM booking_slots WHERE booking_id = $1',
      [bookingId],
    );
    expect(slotRows.rows[0].count).toBe(0);

    // The freed slot is genuinely bookable again, not just absent from
    // booking_slots -- a different member can take it.
    const otherMember = await loginAsMember(app, pool, mailer, 'rebooker@example.com');
    const rebooked = await otherMember.agent
      .post('/api/bookings')
      .set('X-CSRF-Token', otherMember.csrfToken)
      .send({ resourceId, startsAt, endsAt });
    expect(rebooked.status).toBe(201);
  });

  it('rejects cancellation inside the 2-hour cutoff', async () => {
    const { resourceId } = await bookableResourceFixture();
    const member = await loginAsMember(app, pool, mailer, 'toolate@example.com');
    const { startsAt, endsAt } = withinCutoffSlot();

    const created = await member.agent
      .post('/api/bookings')
      .set('X-CSRF-Token', member.csrfToken)
      .send({ resourceId, startsAt, endsAt });
    expect(created.status).toBe(201);

    const response = await member.agent
      .delete(`/api/bookings/${created.body.booking.id}`)
      .set('X-CSRF-Token', member.csrfToken);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('CANCEL_WINDOW_CLOSED');
  });

  it('treats cancelling an already-cancelled booking as a 200 no-op', async () => {
    const { resourceId } = await bookableResourceFixture();
    const member = await loginAsMember(app, pool, mailer, 'doubleclick@example.com');
    const { startsAt, endsAt } = cancellableSlot();

    const created = await member.agent
      .post('/api/bookings')
      .set('X-CSRF-Token', member.csrfToken)
      .send({ resourceId, startsAt, endsAt });
    const bookingId = created.body.booking.id;

    const first = await member.agent
      .delete(`/api/bookings/${bookingId}`)
      .set('X-CSRF-Token', member.csrfToken);
    expect(first.status).toBe(200);

    const second = await member.agent
      .delete(`/api/bookings/${bookingId}`)
      .set('X-CSRF-Token', member.csrfToken);
    expect(second.status).toBe(200);
    expect(second.body.booking.status).toBe('cancelled');
  });

  it("rejects cancelling another member's booking with 403, not 404", async () => {
    const { resourceId } = await bookableResourceFixture();
    const memberA = await loginAsMember(app, pool, mailer, 'owner@example.com');
    const memberB = await loginAsMember(app, pool, mailer, 'intruder@example.com');
    const { startsAt, endsAt } = cancellableSlot();

    const created = await memberA.agent
      .post('/api/bookings')
      .set('X-CSRF-Token', memberA.csrfToken)
      .send({ resourceId, startsAt, endsAt });
    expect(created.status).toBe(201);

    const response = await memberB.agent
      .delete(`/api/bookings/${created.body.booking.id}`)
      .set('X-CSRF-Token', memberB.csrfToken);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('CANCEL_FORBIDDEN');
  });
});
