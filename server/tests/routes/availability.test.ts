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
import { createResourceFixture } from '../helpers/resourceFixtures.js';
import { insertBookingFixture } from '../helpers/dbHelpers.js';

describe('GET /api/availability', () => {
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

  describe('authorization', () => {
    it('rejects an unauthenticated request', async () => {
      const response = await request(app).get('/api/availability?date=2027-01-01');
      expect(response.status).toBe(401);
    });

    it('rejects a pending (unverified) member', async () => {
      const agent = request.agent(app);
      await agent.post('/api/auth/register').send({
        email: 'pending@example.com',
        displayName: 'P',
        password: 'Correcthorse1',
      });
      // Registering doesn't create a session (Phase 1); log in explicitly to
      // reach the requireVerified check rather than failing at requireAuth.
      await agent
        .post('/api/auth/login')
        .send({ email: 'pending@example.com', password: 'Correcthorse1' });

      const response = await agent.get('/api/availability?date=2027-01-01');
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('EMAIL_NOT_VERIFIED');
    });
  });

  describe('validation', () => {
    it('rejects a malformed date', async () => {
      const response = await admin.agent.get('/api/availability?date=not-a-date');
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('slot generation', () => {
    it('returns 30-minute slots covering the full opening window', async () => {
      const { resourceId } = await createResourceFixture(admin, {
        openTime: '09:00',
        closeTime: '11:00',
      });

      const response = await admin.agent.get(`/api/availability?date=2027-06-01`);

      expect(response.status).toBe(200);
      const resource = response.body.resources.find(
        (r: { id: string }) => r.id === resourceId,
      );
      expect(resource.slots).toHaveLength(4); // 09:00, 09:30, 10:00, 10:30
    });

    it('returns an empty slot list, not a missing row, when the window excludes the resource', async () => {
      const { resourceId } = await createResourceFixture(admin, {
        openTime: '09:00',
        closeTime: '11:00',
      });

      // Requesting a time window entirely outside the resource's hours.
      const response = await admin.agent.get(
        `/api/availability?date=2027-06-01&from=14:00&to=16:00`,
      );

      const resource = response.body.resources.find(
        (r: { id: string }) => r.id === resourceId,
      );
      expect(resource).toBeDefined();
      expect(resource.slots).toEqual([]);
    });

    it('produces exactly two fewer slots on the spring-forward day than an ordinary day', async () => {
      const { resourceId } = await createResourceFixture(admin, {
        openTime: '00:00',
        closeTime: '23:30',
      });

      // Romania: clocks spring forward at 01:00 UTC on 2027-03-28 (local
      // 03:00 -> 04:00); local 03:00-03:59 does not occur that day.
      const dstDay = await admin.agent.get('/api/availability?date=2027-03-28');
      const ordinaryDay = await admin.agent.get(
        '/api/availability?date=2027-03-27',
      );

      const dstSlots = dstDay.body.resources.find(
        (r: { id: string }) => r.id === resourceId,
      ).slots as { start: string }[];
      const ordinarySlots = ordinaryDay.body.resources.find(
        (r: { id: string }) => r.id === resourceId,
      ).slots as { start: string }[];

      expect(dstSlots).toHaveLength(ordinarySlots.length - 2);

      // No generated slot ever labels as local 03:00 or 03:30 that day --
      // the skipped hour produces no slots (functional.md > Slot generation & DST).
      const localTimes = dstSlots.map((s) =>
        new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Europe/Bucharest',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(new Date(s.start)),
      );
      expect(localTimes).not.toContain('03:00');
      expect(localTimes).not.toContain('03:30');
    });

    it('produces exactly two more slots on the fall-back day, both duplicate-hour instants distinct', async () => {
      const { resourceId } = await createResourceFixture(admin, {
        openTime: '00:00',
        closeTime: '23:30',
      });

      // Romania: clocks fall back at 01:00 UTC on 2026-10-25 (local
      // 04:00 -> 03:00); local 03:00-03:59 occurs twice.
      const dstDay = await admin.agent.get('/api/availability?date=2026-10-25');
      const ordinaryDay = await admin.agent.get(
        '/api/availability?date=2026-10-24',
      );

      const dstSlots = dstDay.body.resources.find(
        (r: { id: string }) => r.id === resourceId,
      ).slots as { start: string }[];
      const ordinarySlots = ordinaryDay.body.resources.find(
        (r: { id: string }) => r.id === resourceId,
      ).slots as { start: string }[];

      expect(dstSlots).toHaveLength(ordinarySlots.length + 2);

      const localTimeFormatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Bucharest',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const threeOClockInstants = dstSlots.filter((s) =>
        ['03:00', '03:30'].includes(localTimeFormatter.format(new Date(s.start))),
      );
      // Two labels (03:00, 03:30) x two occurrences each = 4 rows, but all
      // four must be *distinct* UTC instants -- that's the actual guarantee
      // booking_slots' primary key relies on.
      expect(threeOClockInstants).toHaveLength(4);
      const uniqueInstants = new Set(threeOClockInstants.map((s) => s.start));
      expect(uniqueInstants.size).toBe(4);
    });
  });

  describe('privacy', () => {
    it("never reveals another member's identity for a booked slot", async () => {
      const { resourceId } = await createResourceFixture(admin, {
        openTime: '08:00',
        closeTime: '22:00',
      });
      const memberB = await loginAsMember(
        app,
        pool,
        mailer,
        'member-b@example.com',
        'Ben',
      );
      await insertBookingFixture(pool, {
        resourceId,
        memberId: memberB.userId,
        startsAt: '2027-06-01T08:00:00Z',
        endsAt: '2027-06-01T08:30:00Z',
      });

      const memberA = await loginAsMember(
        app,
        pool,
        mailer,
        'member-a@example.com',
        'Ana',
      );
      const response = await memberA.agent.get('/api/availability?date=2027-06-01');

      const body = JSON.stringify(response.body);
      expect(body).not.toMatch(/Ben|member-b@example\.com/);

      const resource = response.body.resources.find(
        (r: { id: string }) => r.id === resourceId,
      );
      const bookedSlot = resource.slots.find(
        (s: { start: string }) => s.start === '2027-06-01T08:00:00.000Z',
      );
      expect(bookedSlot.status).toBe('booked');
      // The precise version of the check above: no field on a booked slot
      // could carry an id or name even if one leaked in, because none of
      // these three keys is one.
      expect(Object.keys(bookedSlot).sort()).toEqual([
        'bookable',
        'start',
        'status',
      ]);
    });

    it("marks the requesting member's own booking as 'mine', not 'booked'", async () => {
      const { resourceId } = await createResourceFixture(admin, {
        openTime: '08:00',
        closeTime: '22:00',
      });
      const member = await loginAsMember(
        app,
        pool,
        mailer,
        'member-c@example.com',
        'Cora',
      );
      await insertBookingFixture(pool, {
        resourceId,
        memberId: member.userId,
        startsAt: '2027-06-01T08:00:00Z',
        endsAt: '2027-06-01T08:30:00Z',
      });

      const response = await member.agent.get('/api/availability?date=2027-06-01');
      const resource = response.body.resources.find(
        (r: { id: string }) => r.id === resourceId,
      );
      const ownSlot = resource.slots.find(
        (s: { start: string }) => s.start === '2027-06-01T08:00:00.000Z',
      );
      expect(ownSlot.status).toBe('mine');
    });
  });

  describe('bookable reasons', () => {
    it('marks a slot inside the minimum-notice window as not bookable', async () => {
      // Constructed relative to "now" rather than hoping today's fixed hours
      // happen to produce a near-future slot -- the resource opens 5 minutes
      // from now (comfortably inside the 30-minute notice window) and closes
      // two hours later, so the very first generated slot is deterministically
      // "too soon" regardless of when this test runs.
      const zoneFormatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Bucharest',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const dateFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Bucharest',
      });
      const opensAt = new Date(Date.now() + 5 * 60 * 1000);
      const closesAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const localDate = dateFormatter.format(opensAt);

      const { resourceId } = await createResourceFixture(admin, {
        openTime: zoneFormatter.format(opensAt),
        closeTime: zoneFormatter.format(closesAt),
      });

      const response = await admin.agent.get(`/api/availability?date=${localDate}`);
      const resource = response.body.resources.find(
        (r: { id: string }) => r.id === resourceId,
      );
      expect(resource.slots.length).toBeGreaterThan(0);
      const firstSlot = resource.slots[0];

      expect(firstSlot.status).toBe('free');
      expect(firstSlot.bookable).toBe(false);
      expect(firstSlot.reason).toBe('too_soon');
    });

    it('marks a slot beyond the booking horizon as not bookable', async () => {
      const { resourceId } = await createResourceFixture(admin, {
        openTime: '09:00',
        closeTime: '10:00',
      });
      const farFuture = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      const response = await admin.agent.get(`/api/availability?date=${farFuture}`);
      const resource = response.body.resources.find(
        (r: { id: string }) => r.id === resourceId,
      );
      expect(resource.slots.length).toBeGreaterThan(0);
      for (const slot of resource.slots) {
        expect(slot.bookable).toBe(false);
        expect(slot.reason).toBe('beyond_horizon');
      }
    });
  });

  describe('filters and pagination', () => {
    it('filters by typeIds', async () => {
      const a = await createResourceFixture(admin, { resourceName: 'Room A' });
      const b = await createResourceFixture(admin, { resourceName: 'Room B' });

      const response = await admin.agent.get(
        `/api/availability?date=2027-06-01&typeIds=${a.typeId}`,
      );
      const names = response.body.resources.map((r: { name: string }) => r.name);
      expect(names).toContain('Room A');
      expect(names).not.toContain('Room B');
      void b;
    });

    it('excludes archived resources entirely', async () => {
      const { resourceId } = await createResourceFixture(admin, {
        resourceName: 'Archived Room',
      });
      await admin.agent
        .post(`/api/admin/resources/${resourceId}/archive`)
        .set('X-CSRF-Token', admin.csrfToken);

      const response = await admin.agent.get('/api/availability?date=2027-06-01');
      const found = response.body.resources.find(
        (r: { id: string }) => r.id === resourceId,
      );
      expect(found).toBeUndefined();
    });

    it('paginates at the requested page size', async () => {
      await createResourceFixture(admin, { resourceName: 'R1' });
      await createResourceFixture(admin, { resourceName: 'R2' });

      const response = await admin.agent.get(
        '/api/availability?date=2027-06-01&pageSize=1',
      );
      expect(response.body.resources).toHaveLength(1);
      expect(response.body.total).toBe(2);
      expect(response.body.pageSize).toBe(1);
    });
  });
});
