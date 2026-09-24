import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import type { Express } from 'express';
import { createTestPool, truncateAll } from '../helpers/testDb.js';
import { buildTestApp } from '../helpers/testApp.js';
import type { FakeMailer } from '../helpers/fakeMailer.js';
import { loginAsAdmin } from '../helpers/adminAgent.js';
import type { AdminSession } from '../helpers/adminAgent.js';

const STRONG_PASSWORD = 'Correcthorse1';

describe('admin resource-types routes', () => {
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
    admin = await loginAsAdmin(app, pool, mailer);
  });

  async function registerMember(email: string) {
    await request(app)
      .post('/api/auth/register')
      .send({ email, displayName: 'Member', password: STRONG_PASSWORD });
  }

  describe('authorization', () => {
    it('rejects an unauthenticated request', async () => {
      const response = await request(app).get('/api/admin/resource-types');
      expect(response.status).toBe(401);
    });

    it('rejects a verified, non-admin member', async () => {
      await registerMember('member@example.com');
      const token = mailer.sent.find((m) => m.to === 'member@example.com')!.text;
      const match = /token=([a-f0-9]+)/.exec(token)!;
      const memberAgent = request.agent(app);
      await memberAgent.post('/api/auth/verify-email').send({ token: match[1] });

      const response = await memberAgent.get('/api/admin/resource-types');
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /', () => {
    it('creates a resource type', async () => {
      const response = await admin.agent
        .post('/api/admin/resource-types')
        .set('X-CSRF-Token', admin.csrfToken)
        .send({ name: 'Rehearsal Room', sortOrder: 1 });

      expect(response.status).toBe(201);
      expect(response.body.resourceType.name).toBe('Rehearsal Room');
      expect(response.body.resourceType.archivedAt).toBeNull();
    });

    it('rejects a duplicate name, case-insensitively', async () => {
      await admin.agent
        .post('/api/admin/resource-types')
        .set('X-CSRF-Token', admin.csrfToken)
        .send({ name: 'Rehearsal Room', sortOrder: 0 });

      const response = await admin.agent
        .post('/api/admin/resource-types')
        .set('X-CSRF-Token', admin.csrfToken)
        .send({ name: 'rehearsal room', sortOrder: 0 });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('RESOURCE_TYPE_NAME_TAKEN');
    });

    it('rejects a missing CSRF token', async () => {
      const response = await admin.agent
        .post('/api/admin/resource-types')
        .send({ name: 'Desk', sortOrder: 0 });
      expect(response.status).toBe(403);
    });

    it('rejects an empty name', async () => {
      const response = await admin.agent
        .post('/api/admin/resource-types')
        .set('X-CSRF-Token', admin.csrfToken)
        .send({ name: '', sortOrder: 0 });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('archive / unarchive', () => {
    async function createType(name: string): Promise<string> {
      const response = await admin.agent
        .post('/api/admin/resource-types')
        .set('X-CSRF-Token', admin.csrfToken)
        .send({ name, sortOrder: 0 });
      return response.body.resourceType.id as string;
    }

    it('archives a type with no active resources', async () => {
      const typeId = await createType('Equipment');

      const response = await admin.agent
        .post(`/api/admin/resource-types/${typeId}/archive`)
        .set('X-CSRF-Token', admin.csrfToken);

      expect(response.status).toBe(200);

      const list = await admin.agent.get(
        '/api/admin/resource-types?includeArchived=true',
      );
      const archived = list.body.items.find((t: { id: string }) => t.id === typeId);
      expect(archived.archivedAt).not.toBeNull();
    });

    it('blocks archiving a type that still has an active resource', async () => {
      const typeId = await createType('Desk');
      await admin.agent
        .post('/api/admin/resources')
        .set('X-CSRF-Token', admin.csrfToken)
        .send({
          name: 'Desk 1',
          typeId,
          description: '',
          capacity: 1,
          openTime: '08:00',
          closeTime: '20:00',
        });

      const response = await admin.agent
        .post(`/api/admin/resource-types/${typeId}/archive`)
        .set('X-CSRF-Token', admin.csrfToken);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('RESOURCE_TYPE_HAS_ACTIVE_RESOURCES');
    });

    it('unarchive is idempotent on an already-active type', async () => {
      const typeId = await createType('Piano Room');
      const response = await admin.agent
        .post(`/api/admin/resource-types/${typeId}/unarchive`)
        .set('X-CSRF-Token', admin.csrfToken);
      expect(response.status).toBe(200);
    });
  });

  describe('audit log', () => {
    it('writes a row for create and for archive', async () => {
      const created = await admin.agent
        .post('/api/admin/resource-types')
        .set('X-CSRF-Token', admin.csrfToken)
        .send({ name: 'Storage', sortOrder: 0 });
      const typeId = created.body.resourceType.id as string;

      await admin.agent
        .post(`/api/admin/resource-types/${typeId}/archive`)
        .set('X-CSRF-Token', admin.csrfToken);

      const result = await pool.query(
        `SELECT action FROM audit_log WHERE target_type = 'resource_type' AND target_id = $1 ORDER BY occurred_at`,
        [typeId],
      );
      expect(result.rows.map((r: { action: string }) => r.action)).toEqual([
        'resource_type.create',
        'resource_type.archive',
      ]);
    });
  });
});
