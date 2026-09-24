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

/** Rounds an instant up to the next 30-minute UTC boundary. */
function nextSlotBoundary(instant: Date): Date {
  const ms = 30 * 60 * 1000;
  return new Date(Math.ceil(instant.getTime() / ms) * ms);
}

describe('/api/admin/bookings', () => {
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

  describe('authorization', () => {
    it('rejects an unauthenticated request', async () => {
      const response = await request(app).get('/api/admin/bookings');
      expect(response.status).toBe(401);
    });

    it('rejects a member from the bookings list and from cancelling', async () => {
      const member = await loginAsMember(app, pool, mailer, 'plain@example.com');

      const list = await member.agent.get('/api/admin/bookings');
      expect(list.status).toBe(403);

      const cancel = await member.agent
        .delete('/api/admin/bookings/1')
        .set('X-CSRF-Token', member.csrfToken);
      expect(cancel.status).toBe(403);
    });
  });

  describe('GET /api/admin/bookings', () => {
    it('lists a booking with the member name and email, and filters by status', async () => {
      const { resourceId } = await bookableResourceFixture();
      const member = await loginAsMember(app, pool, mailer, 'holder@example.com', 'Holder');
      const startsAt = nextSlotBoundary(new Date(Date.now() + 40 * 60 * 1000)).toISOString();
      const endsAt = new Date(new Date(startsAt).getTime() + 30 * 60 * 1000).toISOString();

      const created = await member.agent
        .post('/api/bookings')
        .set('X-CSRF-Token', member.csrfToken)
        .send({ resourceId, startsAt, endsAt });
      expect(created.status).toBe(201);

      const list = await admin.agent.get('/api/admin/bookings?status=booked');
      expect(list.status).toBe(200);
      expect(list.body.items).toHaveLength(1);
      expect(list.body.items[0]).toMatchObject({
        id: created.body.booking.id,
        memberDisplayName: 'Holder',
        memberEmail: 'holder@example.com',
        resourceName: expect.any(String),
      });

      const cancelledOnly = await admin.agent.get('/api/admin/bookings?status=cancelled');
      expect(cancelledOnly.body.items).toHaveLength(0);
    });

    it('filters by free text on the member name or email', async () => {
      const { resourceId } = await bookableResourceFixture();
      const memberA = await loginAsMember(app, pool, mailer, 'ana@example.com', 'Ana');
      const memberB = await loginAsMember(app, pool, mailer, 'bogdan@example.com', 'Bogdan');
      const startsAt = nextSlotBoundary(new Date(Date.now() + 40 * 60 * 1000)).toISOString();
      const endsAt = new Date(new Date(startsAt).getTime() + 30 * 60 * 1000).toISOString();
      const laterStart = nextSlotBoundary(new Date(Date.now() + 100 * 60 * 1000)).toISOString();
      const laterEnd = new Date(new Date(laterStart).getTime() + 30 * 60 * 1000).toISOString();

      await memberA.agent
        .post('/api/bookings')
        .set('X-CSRF-Token', memberA.csrfToken)
        .send({ resourceId, startsAt, endsAt });
      await memberB.agent
        .post('/api/bookings')
        .set('X-CSRF-Token', memberB.csrfToken)
        .send({ resourceId, startsAt: laterStart, endsAt: laterEnd });

      const search = await admin.agent.get('/api/admin/bookings?q=ana');
      expect(search.body.items).toHaveLength(1);
      expect(search.body.items[0].memberDisplayName).toBe('Ana');
    });
  });

  describe('DELETE /api/admin/bookings/:id', () => {
    it('cancels a booking the member could not self-cancel (inside the 2-hour cutoff)', async () => {
      const { resourceId } = await bookableResourceFixture();
      const member = await loginAsMember(app, pool, mailer, 'soon@example.com');
      const startsAt = nextSlotBoundary(new Date(Date.now() + 40 * 60 * 1000)).toISOString();
      const endsAt = new Date(new Date(startsAt).getTime() + 30 * 60 * 1000).toISOString();

      const created = await member.agent
        .post('/api/bookings')
        .set('X-CSRF-Token', member.csrfToken)
        .send({ resourceId, startsAt, endsAt });
      const bookingId = created.body.booking.id as string;

      // The member themselves would be blocked here (Phase 4's cutoff test).
      const memberAttempt = await member.agent
        .delete(`/api/bookings/${bookingId}`)
        .set('X-CSRF-Token', member.csrfToken);
      expect(memberAttempt.status).toBe(403);

      const adminCancel = await admin.agent
        .delete(`/api/admin/bookings/${bookingId}`)
        .set('X-CSRF-Token', admin.csrfToken);
      expect(adminCancel.status).toBe(200);
      expect(adminCancel.body.booking.status).toBe('cancelled');

      const slotRows = await pool.query(
        'SELECT count(*)::int AS count FROM booking_slots WHERE booking_id = $1',
        [bookingId],
      );
      expect(slotRows.rows[0].count).toBe(0);

      const auditRows = await pool.query(
        "SELECT actor_id, target_id, detail FROM audit_log WHERE action = 'admin.booking.cancel'",
      );
      expect(auditRows.rowCount).toBe(1);
      expect(auditRows.rows[0].actor_id).toBe(admin.userId);
      expect(auditRows.rows[0].target_id).toBe(bookingId);
    });

    it('treats cancelling an already-cancelled booking as a 200 no-op with no extra audit row', async () => {
      const { resourceId } = await bookableResourceFixture();
      const member = await loginAsMember(app, pool, mailer, 'twice@example.com');
      const startsAt = nextSlotBoundary(new Date(Date.now() + 40 * 60 * 1000)).toISOString();
      const endsAt = new Date(new Date(startsAt).getTime() + 30 * 60 * 1000).toISOString();

      const created = await member.agent
        .post('/api/bookings')
        .set('X-CSRF-Token', member.csrfToken)
        .send({ resourceId, startsAt, endsAt });
      const bookingId = created.body.booking.id as string;

      const first = await admin.agent
        .delete(`/api/admin/bookings/${bookingId}`)
        .set('X-CSRF-Token', admin.csrfToken);
      expect(first.status).toBe(200);

      const second = await admin.agent
        .delete(`/api/admin/bookings/${bookingId}`)
        .set('X-CSRF-Token', admin.csrfToken);
      expect(second.status).toBe(200);

      const auditRows = await pool.query(
        "SELECT count(*)::int AS count FROM audit_log WHERE action = 'admin.booking.cancel'",
      );
      expect(auditRows.rows[0].count).toBe(1);
    });

    it('returns 404 for a booking that does not exist', async () => {
      const response = await admin.agent
        .delete('/api/admin/bookings/999999999')
        .set('X-CSRF-Token', admin.csrfToken);
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('BOOKING_NOT_FOUND');
    });
  });
});
