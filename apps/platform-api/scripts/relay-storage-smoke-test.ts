import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';

import { getConfig } from '../utils/config';
import { closeDatabase, useDatabase } from '../utils/database';
import { hashPassword } from '../utils/password';
import { createPreviewUrl, deleteObject, readObject } from '../utils/storage';

// Run with the API .env loaded and RAIL_API_URL pointing at the public API.
// Only this run's accounts, project, object and audit records are removed.
const config = getConfig();
const apiUrl = process.env.RAIL_API_URL;
assert.ok(apiUrl, 'Set RAIL_API_URL to the public /api/v1 endpoint');
const origin = new URL(apiUrl).origin;
assert.equal(new URL(config.s3PublicEndpoint).origin, origin);
assert.equal(new URL(apiUrl).protocol, 'https:');
const sql = useDatabase();
const runId = `relay-smoke-${randomUUID()}`;
const users: string[] = [];
const requestIds: string[] = [];
let projectId: string | undefined;
let objectKey: string | undefined;
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function request<T>(
  path: string,
  token?: string,
  body?: unknown,
  expected = 200,
  method = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  const requestId = `${runId}-${requestIds.length}`;
  requestIds.push(requestId);
  const headers: Record<string, string> = {
    Origin: origin,
    'X-Request-ID': requestId,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${apiUrl}${path}`, {
    ...(body !== undefined && method !== 'GET'
      ? { body: JSON.stringify(body) }
      : {}),
    headers,
    method,
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.status, expected, `API ${method} ${path} status`);
  const envelope = (await response.json()) as { data: T };
  return envelope.data;
}

async function account(index: number) {
  const username = `relay_${runId.slice(-12)}_${index}`;
  const password = randomBytes(24).toString('hex');
  const passwordHash = await hashPassword(password);
  const [user] = await sql<{ id: string }[]>`
    INSERT INTO users (username, password_hash, real_name, department, email)
    VALUES (${username}, ${passwordHash}, '临时映射验收', '自动化验收', ${`${username}@rail.local`})
    RETURNING id
  `;
  assert.ok(user);
  users.push(user.id);
  await sql`INSERT INTO user_roles (user_id, role_id) SELECT ${user.id}, id FROM roles WHERE code = 'user'`;
  await sql`INSERT INTO user_preferences (user_id) VALUES (${user.id})`;
  const session = await request<{ accessToken: string }>(
    '/auth/login',
    undefined,
    { username, password },
  );
  return session.accessToken;
}

function publicUrl(value: string) {
  const url = new URL(value);
  assert.equal(url.origin, origin, 'API must issue same-origin HTTPS URLs');
  assert.ok(url.pathname.startsWith(`/${config.s3Bucket}/`));
  assert.ok(url.searchParams.has('X-Amz-Signature'));
  return url;
}

async function objectRequest(url: URL, init: RequestInit = {}) {
  return await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
}

async function run() {
  await request('/health/ready');
  const owner = await account(1);
  const outsider = await account(2);
  const project = await request<{ id: string }>('/projects', owner, {
    name: runId,
  });
  projectId = project.id;
  const prepared = await request<{
    asset: { id: string };
    upload: { headers: Record<string, string>; method: string; url: string };
  }>('/assets/uploads', owner, {
    filename: 'relay-smoke.png',
    kind: 'image',
    mimeType: 'image/png',
    name: runId,
    projectId,
    sizeBytes: png.byteLength,
  });
  const uploadUrl = publicUrl(prepared.upload.url);
  objectKey = decodeURIComponent(
    uploadUrl.pathname.slice(config.s3Bucket.length + 2),
  );
  const preflight = await objectRequest(uploadUrl, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'PUT',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  await preflight.body?.cancel();
  const uploaded = await objectRequest(uploadUrl, {
    body: png,
    headers: { ...prepared.upload.headers, Origin: origin },
    method: prepared.upload.method,
  });
  assert.equal(uploaded.status, 200, 'Signed PUT');
  assert.ok(uploaded.headers.get('etag'));
  await uploaded.body?.cancel();
  await request(
    `/assets/${prepared.asset.id}/complete`,
    owner,
    undefined,
    200,
    'POST',
  );
  const preview = await request<{ url: string }>(
    `/assets/${prepared.asset.id}/preview`,
    owner,
  );
  const previewUrl = publicUrl(preview.url);
  const image = await objectRequest(previewUrl);
  assert.equal(image.status, 200, 'Signed preview');
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.ok(image.headers.get('content-security-policy')?.includes('sandbox'));
  assert.ok(Buffer.from(await image.arrayBuffer()).equals(png));
  const range = await objectRequest(previewUrl, {
    headers: { Range: 'bytes=0-7' },
  });
  assert.equal(range.status, 206, 'Range requests for media');
  assert.ok(Buffer.from(await range.arrayBuffer()).equals(png.subarray(0, 8)));
  const unsigned = new URL(previewUrl);
  unsigned.search = '';
  const denied = await objectRequest(unsigned);
  assert.equal(denied.status, 403, 'Private object must reject unsigned GET');
  await denied.body?.cancel();
  const tampered = new URL(previewUrl);
  tampered.searchParams.set('X-Amz-Signature', '0'.repeat(64));
  const badSignature = await objectRequest(tampered);
  assert.equal(badSignature.status, 403, 'Invalid signature');
  await badSignature.body?.cancel();
  const bucket = await objectRequest(new URL(`/${config.s3Bucket}/`, origin));
  assert.equal(bucket.status, 403, 'Anonymous bucket listing');
  await bucket.body?.cancel();
  const unsupported = await objectRequest(unsigned, { method: 'DELETE' });
  assert.equal(
    unsupported.status,
    405,
    'Public object delete blocked at gateway',
  );
  await unsupported.body?.cancel();
  const download = await request<{ url: string }>(
    `/assets/${prepared.asset.id}/download`,
    owner,
  );
  const file = await objectRequest(publicUrl(download.url));
  assert.equal(file.status, 200, 'Signed download');
  assert.ok(file.headers.get('content-disposition')?.startsWith('attachment;'));
  assert.ok(Buffer.from(await file.arrayBuffer()).equals(png));
  await request(
    `/assets/${prepared.asset.id}/preview`,
    undefined,
    undefined,
    401,
  );
  await request(
    `/assets/${prepared.asset.id}/preview`,
    outsider,
    undefined,
    404,
  );
  console.warn(
    'PASS: public API auth, signed PUT, CORS, preview, download, Range, private bucket, signature rejection, project isolation.',
  );
  // Optional read-only check of one object explicitly selected by the operator.
  // Never print the object key, credentials, signed URL or file contents.
  const existingKey = process.env.RAIL_VERIFY_OBJECT_KEY;
  if (existingKey) {
    const original = Buffer.from(await readObject(existingKey));
    const response = await objectRequest(
      publicUrl(await createPreviewUrl(existingKey, 'image/png')),
    );
    assert.equal(response.status, 200, 'Existing image through public relay');
    assert.ok(Buffer.from(await response.arrayBuffer()).equals(original));
    console.warn(
      `PASS: selected existing image preserved and accessible (${original.byteLength} bytes).`,
    );
  }
}

try {
  await run();
} catch (error) {
  // fetch errors may contain signed URLs; do not print their message/cause.
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : 'Storage smoke test failed; inspect service health without logging signed URLs.',
  );
  process.exitCode = 1;
} finally {
  try {
    if (objectKey) await deleteObject(objectKey);
    if (projectId) await sql`DELETE FROM projects WHERE id = ${projectId}`;
    if (requestIds.length > 0)
      await sql`DELETE FROM audit_events WHERE request_id = ANY(${requestIds})`;
    if (users.length > 0) await sql`DELETE FROM users WHERE id = ANY(${users})`;
    console.warn(
      'Temporary smoke-test data cleaned; existing business data untouched.',
    );
  } catch {
    console.error(
      'Smoke-test cleanup failed; inspect only this run’s temporary records.',
    );
    process.exitCode = 1;
  }
  await closeDatabase();
}
