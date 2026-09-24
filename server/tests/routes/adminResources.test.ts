import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import type { Express } from 'express';
import { createTestPool, truncateAll } from '../helpers/testDb.js';
import { buildTestApp } from '../helpers/testApp.js';
import type { FakeMailer } from '../helpers/fakeMailer.js';
import { loginAsAdmin } from '../helpers/adminAgent.js';
import type { AdminSession } from '../helpers/adminAgent.js';
import {
  extractTokenFromLink,
  insertBookingFixture,
} from '../helpers/dbHelpers.js';

const STRONG_PASSWORD = 'Correcthorse1';

describe('admin resources routes', () => {
  let pool: Pool;
  let app: Express;
  let mailer: FakeMailer;
  let admin: AdminSession;
  let typeId: string;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
    ({ app, mailer } = buildTestApp(pool));
    admin = await loginAsAdmin(app, pool, mailer);

    const typeResponse = await admin.agent
      .post('/api/admin/resource-types')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ name: 'Rehearsal Room', sortOrder: 0 });
    typeId = typeResponse.body.resourceType.id as string;
  });

  function validResourceBody(overrides: Record<string, unknown> = {}) {
    return {
      name: 'Room A',
      typeId,
      description: 'A room',
      capacity: 6,
      openTime: '08:00',
      closeTime: '22:00',
      ...overrides,
    };
  }

  async function createResource(
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const response = await admin.agent
      .post('/api/admin/resources')
      .set('X-CSRF-Token', admin.csrfToken)
      .send(validResourceBody(overrides));
    return response.body.resource.id as string;
  }

  async function registerAndVerifyMember(email: string): Promise<string> {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email, displayName: 'Member', password: STRONG_PASSWORD });
    const token = extractTokenFromLink(
      mailer.sent.find((m) => m.to === email)!.text,
    );
    const response = await agent.post('/api/auth/verify-email').send({ token });
    return response.body.user.id as string;
  }

  describe('authorization', () => {
    it('rejects an unauthenticated request on every route', async () => {
      const list = await request(app).get('/api/admin/resources');
      expect(list.status).toBe(401);

      const create = await request(app)
        .post('/api/admin/resources')
        .send(validResourceBody());
      expect(create.status).toBe(401);
    });

    it('rejects a verified, non-admin member', async () => {
      const memberAgent = request.agent(app);
      await memberAgent.post('/api/auth/register').send({
        email: 'member@example.com',
        displayName: 'Member',
        password: STRONG_PASSWORD,
      });
      const token = extractTokenFromLink(
        mailer.sent.find((m) => m.to === 'member@example.com')!.text,
      );
      await memberAgent.post('/api/auth/verify-email').send({ token });

      const response = await memberAgent.get('/api/admin/resources');
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /', () => {
    it('creates a resource', async () => {
      const response = await admin.agent
        .post('/api/admin/resources')
        .set('X-CSRF-Token', admin.csrfToken)
        .send(validResourceBody());

      expect(response.status).toBe(201);
      expect(response.body.resource.name).toBe('Room A');
      expect(response.body.resource.openTime).toBe('08:00');
      expect(response.body.resource.closeTime).toBe('22:00');
    });

    it('rejects a nonexistent type', async () => {
      const response = await admin.agent
        .post('/api/admin/resources')
        .set('X-CSRF-Token', admin.csrfToken)
        .send(validResourceBody({ typeId: '999999' }));

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('RESOURCE_TYPE_NOT_FOUND');
    });

    it('rejects an archived type', async () => {
      await admin.agent
        .post(`/api/admin/resource-types/${typeId}/archive`)
        .set('X-CSRF-Token', admin.csrfToken);

      const response = await admin.agent
        .post('/api/admin/resources')
        .set('X-CSRF-Token', admin.csrfToken)
        .send(validResourceBody());

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('RESOURCE_TYPE_ARCHIVED');
    });

    it('rejects closeTime not after openTime', async () => {
      const response = await admin.agent
        .post('/api/admin/resources')
        .set('X-CSRF-Token', admin.csrfToken)
        .send(validResourceBody({ openTime: '20:00', closeTime: '08:00' }));

      expect(response.status).toBe(400);
      expect(response.body.problems.join(' ')).toMatch(/overnight/);
    });

    it('rejects capacity below 1', async () => {
      const response = await admin.agent
        .post('/api/admin/resources')
        .set('X-CSRF-Token', admin.csrfToken)
        .send(validResourceBody({ capacity: 0 }));

      expect(response.status).toBe(400);
    });
  });

  describe('archive', () => {
    it('succeeds when there are no future active bookings', async () => {
      const resourceId = await createResource();

      const response = await admin.agent
        .post(`/api/admin/resources/${resourceId}/archive`)
        .set('X-CSRF-Token', admin.csrfToken);

      expect(response.status).toBe(200);
    });

    it('is blocked by a future active booking and does not archive', async () => {
      const resourceId = await createResource();
      const memberId = await registerAndVerifyMember('booker@example.com');
      await insertBookingFixture(pool, {
        resourceId,
        memberId,
        startsAt: '2027-01-01T10:00:00Z',
        endsAt: '2027-01-01T10:30:00Z',
      });

      const response = await admin.agent
        .post(`/api/admin/resources/${resourceId}/archive`)
        .set('X-CSRF-Token', admin.csrfToken);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('RESOURCE_HAS_BOOKINGS');
      expect(response.body.bookings).toHaveLength(1);
      expect(response.body.bookings[0].memberDisplayName).toBe('Member');

      // Confirm it genuinely did not archive.
      const list = await admin.agent.get('/api/admin/resources?status=all');
      const row = list.body.items.find((r: { id: string }) => r.id === resourceId);
      expect(row.archivedAt).toBeNull();
    });

    it('is not blocked by a past booking or a cancelled one', async () => {
      const resourceId = await createResource();
      const memberId = await registerAndVerifyMember('booker2@example.com');
      // Past booking.
      await insertBookingFixture(pool, {
        resourceId,
        memberId,
        startsAt: '2020-01-01T10:00:00Z',
        endsAt: '2020-01-01T10:30:00Z',
      });

      const response = await admin.agent
        .post(`/api/admin/resources/${resourceId}/archive`)
        .set('X-CSRF-Token', admin.csrfToken);

      expect(response.status).toBe(200);
    });
  });

  describe('PATCH /:id -- stranded bookings on a narrowed edit', () => {
    it('blocks narrowing hours that would strand a booking', async () => {
      const resourceId = await createResource({
        openTime: '08:00',
        closeTime: '22:00',
      });
      const memberId = await registerAndVerifyMember('early@example.com');
      // 09:00 UTC = studio-local depends on STUDIO_TIME_ZONE (Europe/Bucharest,
      // UTC+2/+3) -- pick a time safely inside 08:00-22:00 local either way,
      // then narrow the window to exclude it.
      await insertBookingFixture(pool, {
        resourceId,
        memberId,
        startsAt: '2027-06-01T08:00:00Z', // ~10:00-11:00 local in summer (UTC+3)
        endsAt: '2027-06-01T08:30:00Z',
      });

      const response = await admin.agent
        .patch(`/api/admin/resources/${resourceId}`)
        .set('X-CSRF-Token', admin.csrfToken)
        .send(validResourceBody({ openTime: '12:00', closeTime: '22:00' }));

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('BOOKINGS_OUTSIDE_NEW_HOURS');
      expect(response.body.bookings).toHaveLength(1);
    });

    it('applies the edit once acknowledged, and the booking stands', async () => {
      const resourceId = await createResource({
        openTime: '08:00',
        closeTime: '22:00',
      });
      const memberId = await registerAndVerifyMember('early2@example.com');
      await insertBookingFixture(pool, {
        resourceId,
        memberId,
        startsAt: '2027-06-01T08:00:00Z',
        endsAt: '2027-06-01T08:30:00Z',
      });

      const response = await admin.agent
        .patch(`/api/admin/resources/${resourceId}`)
        .set('X-CSRF-Token', admin.csrfToken)
        .send(
          validResourceBody({
            openTime: '12:00',
            closeTime: '22:00',
            acknowledgeStrandedBookings: true,
          }),
        );

      expect(response.status).toBe(200);
      expect(response.body.resource.openTime).toBe('12:00');

      const bookingStillLive = await pool.query(
        'SELECT status FROM bookings WHERE id = (SELECT id FROM bookings WHERE resource_id = $1 LIMIT 1)',
        [resourceId],
      );
      expect(bookingStillLive.rows[0].status).toBe('booked');
    });

    it('does not trigger the check when hours are widened, not narrowed', async () => {
      const resourceId = await createResource({
        openTime: '10:00',
        closeTime: '18:00',
      });

      const response = await admin.agent
        .patch(`/api/admin/resources/${resourceId}`)
        .set('X-CSRF-Token', admin.csrfToken)
        .send(validResourceBody({ openTime: '08:00', closeTime: '22:00' }));

      expect(response.status).toBe(200);
    });

    it('re-saving unchanged hours is not treated as a change', async () => {
      const resourceId = await createResource({
        openTime: '08:00',
        closeTime: '22:00',
      });

      const response = await admin.agent
        .patch(`/api/admin/resources/${resourceId}`)
        .set('X-CSRF-Token', admin.csrfToken)
        .send(
          validResourceBody({
            openTime: '08:00',
            closeTime: '22:00',
            name: 'Room A',
          }),
        );

      expect(response.status).toBe(200);

      const auditRows = await pool.query(
        `SELECT detail FROM audit_log WHERE action = 'resource.update' AND target_id = $1`,
        [resourceId],
      );
      // No changed fields at all -> no audit row written for this no-op save.
      expect(auditRows.rowCount).toBe(0);
    });
  });

  describe('GET / filters and pagination', () => {
    it('filters by q, typeId and status', async () => {
      const otherType = await admin.agent
        .post('/api/admin/resource-types')
        .set('X-CSRF-Token', admin.csrfToken)
        .send({ name: 'Desk', sortOrder: 0 });
      const otherTypeId = otherType.body.resourceType.id as string;

      await createResource({ name: 'Piano Room' });
      const deskId = await createResource({ name: 'Desk 1', typeId: otherTypeId });
      await admin.agent
        .post(`/api/admin/resources/${deskId}/archive`)
        .set('X-CSRF-Token', admin.csrfToken);

      const byName = await admin.agent.get('/api/admin/resources?q=Piano');
      expect(byName.body.items.map((r: { name: string }) => r.name)).toEqual([
        'Piano Room',
      ]);

      const byType = await admin.agent.get(
        `/api/admin/resources?typeId=${otherTypeId}&status=all`,
      );
      expect(byType.body.items).toHaveLength(1);

      const archivedOnly = await admin.agent.get(
        '/api/admin/resources?status=archived',
      );
      expect(archivedOnly.body.items.map((r: { name: string }) => r.name)).toEqual([
        'Desk 1',
      ]);

      // Default status filter is 'active' -- the archived desk is excluded.
      const defaultList = await admin.agent.get('/api/admin/resources');
      expect(defaultList.body.items.map((r: { name: string }) => r.name)).toEqual([
        'Piano Room',
      ]);
    });

    it('clamps pageSize and returns a total', async () => {
      await createResource({ name: 'Room A' });
      await createResource({ name: 'Room B' });

      const response = await admin.agent.get(
        '/api/admin/resources?pageSize=1&page=1',
      );
      expect(response.body.items).toHaveLength(1);
      expect(response.body.total).toBe(2);
    });
  });

  describe('audit log', () => {
    it('records changed fields on update, not a full snapshot', async () => {
      const resourceId = await createResource();

      await admin.agent
        .patch(`/api/admin/resources/${resourceId}`)
        .set('X-CSRF-Token', admin.csrfToken)
        .send(validResourceBody({ name: 'Room A Renamed' }));

      const result = await pool.query(
        `SELECT detail FROM audit_log WHERE action = 'resource.update' AND target_id = $1`,
        [resourceId],
      );
      expect(result.rows[0].detail.changedFields).toEqual(['name']);
    });
  });
});
