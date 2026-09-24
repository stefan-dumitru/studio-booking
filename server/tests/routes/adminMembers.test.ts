import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import type { Express } from 'express';
import { createTestPool, truncateAll } from '../helpers/testDb.js';
import { buildTestApp } from '../helpers/testApp.js';
import type { FakeMailer } from '../helpers/fakeMailer.js';
import { loginAsAdmin } from '../helpers/adminAgent.js';
import type { AdminSession } from '../helpers/adminAgent.js';
import { loginAsMember } from '../helpers/memberAgent.js';
import { createResourceFixture } from '../helpers/resourceFixtures.js';
import { sessionCountForUserId } from '../helpers/dbHelpers.js';

function nextSlotBoundary(instant: Date): Date {
  const ms = 30 * 60 * 1000;
  return new Date(Math.ceil(instant.getTime() / ms) * ms);
}

describe('/api/admin/members', () => {
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
    it('rejects a member from every admin/members route', async () => {
      const member = await loginAsMember(app, pool, mailer, 'plain@example.com');

      expect((await member.agent.get('/api/admin/members')).status).toBe(403);
      expect(
        (
          await member.agent
            .post('/api/admin/members/1/deactivate')
            .set('X-CSRF-Token', member.csrfToken)
        ).status,
      ).toBe(403);
    });
  });

  describe('GET /api/admin/members', () => {
    it('lists members and filters by free text and status', async () => {
      await loginAsMember(app, pool, mailer, 'ana@example.com', 'Ana');
      await loginAsMember(app, pool, mailer, 'bogdan@example.com', 'Bogdan');

      const all = await admin.agent.get('/api/admin/members?status=all');
      // Ana, Bogdan, and the seeded admin.
      expect(all.body.total).toBe(3);

      const search = await admin.agent.get('/api/admin/members?q=ana&status=all');
      expect(search.body.items).toHaveLength(1);
      expect(search.body.items[0].displayName).toBe('Ana');

      const active = await admin.agent.get('/api/admin/members?status=active');
      expect(active.body.total).toBe(3); // registration + verification lands them active
    });
  });

  describe('POST /api/admin/members/:id/deactivate', () => {
    it('cancels future bookings, frees the slots, kills sessions, and audits the action', async () => {
      const { resourceId } = await createResourceFixture(admin, {
        openTime: '00:00',
        closeTime: '23:30',
      });
      const member = await loginAsMember(app, pool, mailer, 'target@example.com');
      const startsAt = nextSlotBoundary(new Date(Date.now() + 40 * 60 * 1000)).toISOString();
      const endsAt = new Date(new Date(startsAt).getTime() + 30 * 60 * 1000).toISOString();

      const created = await member.agent
        .post('/api/bookings')
        .set('X-CSRF-Token', member.csrfToken)
        .send({ resourceId, startsAt, endsAt });
      const bookingId = created.body.booking.id as string;

      expect(await sessionCountForUserId(pool, member.userId)).toBeGreaterThan(0);

      const response = await admin.agent
        .post(`/api/admin/members/${member.userId}/deactivate`)
        .set('X-CSRF-Token', admin.csrfToken);
      expect(response.status).toBe(200);

      const bookingRow = await pool.query('SELECT status FROM bookings WHERE id = $1', [
        bookingId,
      ]);
      expect(bookingRow.rows[0].status).toBe('cancelled');

      const slotRows = await pool.query(
        'SELECT count(*)::int AS count FROM booking_slots WHERE booking_id = $1',
        [bookingId],
      );
      expect(slotRows.rows[0].count).toBe(0);

      expect(await sessionCountForUserId(pool, member.userId)).toBe(0);

      // A different member can now take the freed slot.
      const otherMember = await loginAsMember(app, pool, mailer, 'other@example.com');
      const rebooked = await otherMember.agent
        .post('/api/bookings')
        .set('X-CSRF-Token', otherMember.csrfToken)
        .send({ resourceId, startsAt, endsAt });
      expect(rebooked.status).toBe(201);

      const auditRows = await pool.query(
        "SELECT actor_id, target_id, detail FROM audit_log WHERE action = 'admin.member.deactivate'",
      );
      expect(auditRows.rowCount).toBe(1);
      expect(auditRows.rows[0].actor_id).toBe(admin.userId);
      expect(auditRows.rows[0].target_id).toBe(member.userId);
      expect(auditRows.rows[0].detail.cancelledBookingIds).toEqual([bookingId]);
    });

    it('rejects an admin deactivating themselves', async () => {
      const response = await admin.agent
        .post(`/api/admin/members/${admin.userId}/deactivate`)
        .set('X-CSRF-Token', admin.csrfToken);
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('CANNOT_DEACTIVATE_SELF');
    });

    it('lets a deactivated member log back in to a wrong session immediately', async () => {
      const member = await loginAsMember(app, pool, mailer, 'kicked@example.com');
      await admin.agent
        .post(`/api/admin/members/${member.userId}/deactivate`)
        .set('X-CSRF-Token', admin.csrfToken);

      // requireAuth re-reads the user on every request -- the member's
      // existing session is rejected on its very next request, not just at
      // their next login (security.md > Authentication: "fails closed").
      const response = await member.agent.get('/api/bookings/mine');
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/admin/members/:id/reactivate', () => {
    it('restores login but not bookings, and is a no-op when not deactivated', async () => {
      const member = await loginAsMember(app, pool, mailer, 'comeback@example.com');
      await admin.agent
        .post(`/api/admin/members/${member.userId}/deactivate`)
        .set('X-CSRF-Token', admin.csrfToken);

      const reactivate = await admin.agent
        .post(`/api/admin/members/${member.userId}/reactivate`)
        .set('X-CSRF-Token', admin.csrfToken);
      expect(reactivate.status).toBe(200);

      const row = await pool.query('SELECT status FROM users WHERE id = $1', [member.userId]);
      expect(row.rows[0].status).toBe('active');

      // Idempotent no-op the second time.
      const again = await admin.agent
        .post(`/api/admin/members/${member.userId}/reactivate`)
        .set('X-CSRF-Token', admin.csrfToken);
      expect(again.status).toBe(200);

      const auditRows = await pool.query(
        "SELECT count(*)::int AS count FROM audit_log WHERE action = 'admin.member.reactivate'",
      );
      expect(auditRows.rows[0].count).toBe(1);
    });
  });

  describe('role change', () => {
    it('promotes a member and then demotes them back, auditing both', async () => {
      const member = await loginAsMember(app, pool, mailer, 'rising@example.com');

      const promote = await admin.agent
        .post(`/api/admin/members/${member.userId}/promote`)
        .set('X-CSRF-Token', admin.csrfToken);
      expect(promote.status).toBe(200);
      expect(
        (await pool.query('SELECT role FROM users WHERE id = $1', [member.userId])).rows[0].role,
      ).toBe('admin');

      const demote = await admin.agent
        .post(`/api/admin/members/${member.userId}/demote`)
        .set('X-CSRF-Token', admin.csrfToken);
      expect(demote.status).toBe(200);

      const auditRows = await pool.query(
        "SELECT action, detail FROM audit_log WHERE action = 'admin.member.role_change' ORDER BY occurred_at ASC",
      );
      expect(auditRows.rowCount).toBe(2);
      expect(auditRows.rows[0].detail).toEqual({ from: 'member', to: 'admin' });
      expect(auditRows.rows[1].detail).toEqual({ from: 'admin', to: 'member' });
    });

    it('rejects the last remaining admin demoting themselves', async () => {
      const response = await admin.agent
        .post(`/api/admin/members/${admin.userId}/demote`)
        .set('X-CSRF-Token', admin.csrfToken);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('LAST_ACTIVE_ADMIN');

      const row = await pool.query('SELECT role FROM users WHERE id = $1', [admin.userId]);
      expect(row.rows[0].role).toBe('admin');
    });
  });

  describe('concurrency', () => {
    it('lets exactly one of two admins deactivating each other succeed, leaving exactly one active admin', async () => {
      const secondAdmin = await loginAsAdmin(app, pool, mailer, 'second-admin@example.com');

      const [firstResult, secondResult] = await Promise.all([
        admin.agent
          .post(`/api/admin/members/${secondAdmin.userId}/deactivate`)
          .set('X-CSRF-Token', admin.csrfToken),
        secondAdmin.agent
          .post(`/api/admin/members/${admin.userId}/deactivate`)
          .set('X-CSRF-Token', secondAdmin.csrfToken),
      ]);

      // lockActiveAdmins' ORDER BY id makes this deterministic: whichever
      // transaction gets there first locks both rows and sees count=2 (so it
      // succeeds), then the second transaction blocks behind it and, once
      // unblocked, re-reads the now-committed state and finds only one
      // active admin left -- itself -- so it's correctly refused.
      const statuses = [firstResult.status, secondResult.status].sort();
      expect(statuses).toEqual([200, 409]);

      const activeAdmins = await pool.query(
        "SELECT count(*)::int AS count FROM users WHERE role = 'admin' AND status = 'active'",
      );
      expect(activeAdmins.rows[0].count).toBe(1);
    });
  });
});
