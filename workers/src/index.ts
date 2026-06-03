export interface Env {
  FIREBASE_API_KEY:    string;
  FIREBASE_PROJECT_ID: string;
  SCREENSHOTS:         KVNamespace;
  PORTAL_CACHE?:       KVNamespace; // optional — token caching disabled when not bound
}

// ── CORS ──────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonRes(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// ── SHA-256 ───────────────────────────────────────────────────────────────────

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Firebase ID token verification ───────────────────────────────────────────

async function verifyFirebaseIdToken(apiKey: string, idToken: string): Promise<boolean> {
  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ idToken }),
      }
    );
    return resp.ok;
  } catch {
    return false;
  }
}

// ── Firestore REST helper ─────────────────────────────────────────────────────

type FsVal = Record<string, unknown>;

function toFsValue(val: unknown): FsVal {
  if (typeof val === 'string')  return { stringValue: val };
  if (typeof val === 'number')  return { doubleValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (val instanceof Date)      return { timestampValue: val.toISOString() };
  if (val !== null && typeof val === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(val as Record<string, unknown>).map(([k, v]) => [k, toFsValue(v)])
        ),
      },
    };
  }
  return { nullValue: null };
}

function fsStr(fields: Record<string, FsVal>, key: string): string | null {
  return (fields[key] as { stringValue?: string } | undefined)?.stringValue ?? null;
}

function fsBool(fields: Record<string, FsVal>, key: string): boolean {
  return (fields[key] as { booleanValue?: boolean } | undefined)?.booleanValue ?? false;
}

class Firestore {
  private base: string;
  private key:  string;

  constructor(projectId: string, apiKey: string) {
    this.base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    this.key  = apiKey;
  }

  private url(path: string, extraParams?: string): string {
    const qs = extraParams ? `${extraParams}&key=${this.key}` : `key=${this.key}`;
    return `${this.base}/${path}?${qs}`;
  }

  async get(collection: string, docId: string): Promise<{ fields: Record<string, FsVal> } | null> {
    const resp = await fetch(this.url(`${collection}/${docId}`));
    if (!resp.ok) return null;
    return resp.json() as Promise<{ fields: Record<string, FsVal> }>;
  }

  async create(collection: string, fields: Record<string, unknown>): Promise<string> {
    const body = {
      fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toFsValue(v)])),
    };
    const resp = await fetch(this.url(collection), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const created = await resp.json() as { name: string };
    return created.name.split('/').pop()!;
  }

  async patch(collection: string, docId: string, fields: Record<string, unknown>): Promise<void> {
    const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const body = {
      fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toFsValue(v)])),
    };
    await fetch(this.url(`${collection}/${docId}`, mask), {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
  }

  async delete(collection: string, docId: string): Promise<void> {
    await fetch(this.url(`${collection}/${docId}`), { method: 'DELETE' });
  }

  // patchDevicesAndCheckScreenshots updates multiple device docs concurrently
  // and returns a map of deviceId → screenshotRequested flag.
  async patchDevicesAndCheckScreenshots(
    updates: Array<{ deviceId: string; fields: Record<string, unknown> }>
  ): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    await Promise.all(updates.map(async ({ deviceId, fields }) => {
      const [doc] = await Promise.all([
        this.get('devices', deviceId),
        this.patch('devices', deviceId, fields),
      ]);
      if (doc?.fields) {
        results[deviceId] = fsBool(doc.fields, 'screenshotRequested');
      }
    }));
    return results;
  }
}

// ── Token verification ────────────────────────────────────────────────────────

async function verifyToken(
  fs: Firestore,
  raw: string,
  type: string
): Promise<Record<string, FsVal> | null> {
  const hash      = await sha256Hex(raw);
  const lookupDoc = await fs.get('tokenLookup', hash);

  if (!lookupDoc) return null;

  const fields    = lookupDoc.fields ?? {};
  const typeField = (fields.type     as { stringValue?: string } | undefined)?.stringValue;
  const revokedAt = fields.revokedAt as Record<string, unknown> | undefined;

  if (typeField !== type) return null;
  if (revokedAt && !('nullValue' in revokedAt)) return null;

  return fields;
}

// KV-cached token verification. Falls back to Firestore on cache miss.
// Cache TTL: 5 minutes. Key format: t:{hash}:{type}
async function verifyTokenCached(
  fs:  Firestore,
  kv:  KVNamespace | undefined,
  raw: string,
  type: string
): Promise<Record<string, FsVal> | null> {
  if (!kv) return verifyToken(fs, raw, type);

  const hash     = await sha256Hex(raw);
  const cacheKey = `t:${hash}:${type}`;
  const cached   = await kv.get(cacheKey);

  if (cached === '1') return { type: { stringValue: type } };
  if (cached === '0') return null;

  const result = await verifyToken(fs, raw, type);
  await kv.put(cacheKey, result ? '1' : '0', { expirationTtl: 300 });
  return result;
}

// ── Resolve pendingId → deviceId via permanent deviceApprovals doc ────────────

async function resolveDeviceId(fs: Firestore, pendingId: string): Promise<string | null> {
  const doc = await fs.get('deviceApprovals', pendingId);
  if (!doc) return null;
  return (doc.fields.deviceId as { stringValue?: string } | undefined)?.stringValue ?? null;
}

// ── Worker entry point ────────────────────────────────────────────────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url        = new URL(req.url);
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return jsonRes({ error: 'Missing Bearer token' }, 401);
    }
    const rawToken = authHeader.slice(7);

    const fs = new Firestore(env.FIREBASE_PROJECT_ID, env.FIREBASE_API_KEY);
    const kv = env.PORTAL_CACHE;

    // ── GET /v1/screenshot/pending?pendingId=... ──────────────────
    if (req.method === 'GET' && url.pathname === '/v1/screenshot/pending') {
      const tokenData = await verifyTokenCached(fs, kv, rawToken, 'registration');
      if (!tokenData) return jsonRes({ error: 'Invalid or revoked token' }, 401);

      const pendingId = url.searchParams.get('pendingId');
      if (!pendingId) return jsonRes({ error: 'Missing pendingId' }, 400);

      const deviceId = await resolveDeviceId(fs, pendingId);
      if (!deviceId) return jsonRes({ pending: false });

      const ssDoc = await fs.get('screenshotRequests', deviceId);
      if (!ssDoc) return jsonRes({ pending: false });

      const status = (ssDoc.fields.status as { stringValue?: string } | undefined)?.stringValue;
      return jsonRes({ pending: status === 'pending' });
    }

    // ── GET /v1/screenshot/{deviceId} ─────────────────────────────
    if (req.method === 'GET' && url.pathname.startsWith('/v1/screenshot/')) {
      const isValid = await verifyFirebaseIdToken(env.FIREBASE_API_KEY, rawToken);
      if (!isValid) return jsonRes({ error: 'Invalid Firebase token' }, 401);

      const parts    = url.pathname.split('/').filter(Boolean);
      const deviceId = parts[2];
      if (!deviceId) return jsonRes({ error: 'Missing deviceId in path' }, 400);

      const imgBytes = await env.SCREENSHOTS.get(deviceId, 'arrayBuffer');
      if (!imgBytes) {
        return new Response('Screenshot not found', { status: 404, headers: CORS_HEADERS });
      }

      return new Response(imgBytes, {
        headers: {
          ...CORS_HEADERS,
          'Content-Type':  'image/jpeg',
          'Cache-Control': 'no-store',
        },
      });
    }

    // ── GET /v1/device?pendingId=xxx ──────────────────────────────
    // Bridge-Ground calls this after registration to auto-pickup deviceId + deviceToken
    // once an admin approves the device in the portal.
    //
    // Requires Firestore security rule for pendingDeviceApprovals:
    //   allow read, delete: if true;
    //   allow create, update: if request.auth != null;
    if (req.method === 'GET' && url.pathname === '/v1/device') {
      const tokenData = await verifyTokenCached(fs, kv, rawToken, 'registration');
      if (!tokenData) return jsonRes({ error: 'Invalid or revoked token' }, 401);

      const pendingId = url.searchParams.get('pendingId');
      if (!pendingId) return jsonRes({ error: 'Missing pendingId parameter' }, 400);

      // Check KV for replay protection (token already claimed)
      if (kv) {
        const claimed = await kv.get(`claimed:${pendingId}`);
        if (claimed) return jsonRes({ status: 'pending' });
      }

      const claimDoc = await fs.get('pendingDeviceApprovals', pendingId);
      if (!claimDoc?.fields) return jsonRes({ status: 'pending' });

      const fields      = claimDoc.fields;
      const deviceId    = fsStr(fields, 'deviceId')    ?? '';
      const deviceToken = fsStr(fields, 'deviceToken') ?? '';
      const expiresAt   = fsStr(fields, 'expiresAt')   ?? '';

      if (!deviceId || !deviceToken) return jsonRes({ status: 'pending' });
      if (expiresAt && new Date(expiresAt) < new Date()) return jsonRes({ status: 'pending' });

      // Mark claimed in KV and attempt to delete the one-time claim doc
      if (kv) await kv.put(`claimed:${pendingId}`, '1', { expirationTtl: 3600 });
      fs.delete('pendingDeviceApprovals', pendingId).catch(() => {});

      return jsonRes({ status: 'approved', deviceId, deviceToken });
    }

    if (req.method !== 'POST') {
      return jsonRes({ error: 'Method not allowed' }, 405);
    }

    // ── POST /v1/register ─────────────────────────────────────────
    if (url.pathname === '/v1/register') {
      const tokenData = await verifyTokenCached(fs, kv, rawToken, 'registration');
      if (!tokenData) return jsonRes({ error: 'Invalid or revoked token' }, 401);

      const body = await req.json() as Record<string, string>;
      const { appName, hostname, ip } = body;
      if (!appName || !hostname || !ip) {
        return jsonRes({ error: 'Missing required fields: appName, hostname, ip' }, 400);
      }

      const allowed = ['Gido', 'Gido-Touch', 'Gido-Touch-Mini', 'Grain-Link', 'Bridge-Ground'];
      if (!allowed.includes(appName)) {
        return jsonRes({ error: `Invalid appName. Allowed: ${allowed.join(', ')}` }, 400);
      }

      const pendingId = await fs.create('pendingDevices', {
        appName,
        hostname,
        ip,
        requestedAt: new Date(),
      });

      return jsonRes({ success: true, pendingId }, 201);
    }

    // ── POST /v1/heartbeat ────────────────────────────────────────
    // Batched status update — one request per Bridge-Ground instance for all
    // devices it manages. Response includes per-device screenshot commands.
    if (url.pathname === '/v1/heartbeat') {
      const tokenData = await verifyTokenCached(fs, kv, rawToken, 'device');
      if (!tokenData) return jsonRes({ error: 'Invalid or revoked token' }, 401);

      const body = await req.json() as {
        devices: Array<{
          deviceId:     string;
          status?:      string;
          ip?:          string;
          cpu?:         number;
          memory?:      number;
          temperature?: number;
          storage?:     number;
          uptime?:      number;
        }>;
      };

      if (!Array.isArray(body.devices) || body.devices.length === 0) {
        return jsonRes({ error: 'devices array required' }, 400);
      }

      const validStatuses = new Set(['online', 'offline', 'warning']);
      const now = new Date().toISOString();

      const updates = body.devices
        .filter(d => d.deviceId)
        .map(d => {
          const fields: Record<string, unknown> = {
            status:    validStatuses.has(d.status ?? '') ? d.status! : 'online',
            lastSeen:  now,
            updatedAt: new Date(),
            system: {
              cpu:         d.cpu         ?? 0,
              memory:      d.memory      ?? 0,
              temperature: d.temperature ?? 0,
              storage:     d.storage     ?? 0,
              uptime:      d.uptime      ?? 0,
            },
          };
          if (d.ip) fields.ip = d.ip;
          return { deviceId: d.deviceId, fields };
        });

      const screenshotFlags = await fs.patchDevicesAndCheckScreenshots(updates);

      const commands: Record<string, { screenshot: true }> = {};
      for (const [id, requested] of Object.entries(screenshotFlags)) {
        if (requested) commands[id] = { screenshot: true };
      }

      return jsonRes({ success: true, ...(Object.keys(commands).length > 0 ? { commands } : {}) });
    }

    // ── POST /v1/status ───────────────────────────────────────────
    // Legacy endpoint — kept for backward compatibility with older BG firmware.
    if (url.pathname === '/v1/status') {
      const tokenData = await verifyTokenCached(fs, kv, rawToken, 'registration');
      if (!tokenData) return jsonRes({ error: 'Invalid or revoked token' }, 401);

      const body = await req.json() as {
        pendingId:    string;
        status?:      string;
        ip?:          string;
        cpu?:         number;
        memory?:      number;
        temperature?: number;
        storage?:     number;
        uptime?:      number;
      };

      if (!body.pendingId) {
        return jsonRes({ error: 'Missing required field: pendingId' }, 400);
      }

      const deviceId = await resolveDeviceId(fs, body.pendingId);
      if (!deviceId) return jsonRes({ error: 'Device not approved yet' }, 403);

      const validStatuses = ['online', 'offline', 'warning'];
      const deviceStatus  = validStatuses.includes(body.status ?? '') ? body.status! : 'online';

      const patch: Record<string, unknown> = {
        status:    deviceStatus,
        lastSeen:  new Date().toISOString(),
        updatedAt: new Date(),
        system: {
          cpu:         body.cpu         ?? 0,
          memory:      body.memory      ?? 0,
          temperature: body.temperature ?? 0,
          storage:     body.storage     ?? 0,
          uptime:      body.uptime      ?? 0,
        },
      };
      if (body.ip) patch.ip = body.ip;

      await fs.patch('devices', deviceId, patch);

      return jsonRes({ success: true });
    }

    // ── POST /v1/logs ─────────────────────────────────────────────
    // Supports both new format (deviceId + device token) and legacy format
    // (pendingId + registration token) for backward compatibility.
    if (url.pathname === '/v1/logs') {
      const body = await req.json() as {
        deviceId?: string;
        pendingId?: string;
        app:       string;
        entries:   Array<{ timestamp: string; level: string; tag: string; message: string }>;
      };

      if (!Array.isArray(body.entries) || body.entries.length === 0) {
        return jsonRes({ error: 'Missing required fields: entries' }, 400);
      }

      let deviceId: string | null = null;

      if (body.deviceId) {
        // New format: device token auth
        const tokenData = await verifyTokenCached(fs, kv, rawToken, 'device');
        if (!tokenData) return jsonRes({ error: 'Invalid or revoked token' }, 401);
        deviceId = body.deviceId;
      } else if (body.pendingId) {
        // Legacy format: registration token auth
        const tokenData = await verifyTokenCached(fs, kv, rawToken, 'registration');
        if (!tokenData) return jsonRes({ error: 'Invalid or revoked token' }, 401);
        deviceId = await resolveDeviceId(fs, body.pendingId);
        if (!deviceId) return jsonRes({ error: 'Device not approved yet' }, 403);
      } else {
        return jsonRes({ error: 'Missing required field: deviceId or pendingId' }, 400);
      }

      const now      = new Date();
      const deleteAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const sentAt   = now.toISOString();

      const results = await Promise.allSettled(
        body.entries.map(entry =>
          fs.create(`devices/${deviceId}/logs`, {
            timestamp: entry.timestamp ?? '',
            level:     entry.level     ?? '',
            tag:       entry.tag       ?? '',
            message:   (entry.message ?? '').slice(0, 10_000),
            app:       body.app        ?? '',
            sentAt,
            deleteAt,
          })
        )
      );

      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) {
        console.error(`Log write: ${failed}/${body.entries.length} entries failed for device ${deviceId}`);
      }
      return jsonRes({ success: true, written: body.entries.length - failed, failed });
    }

    // ── POST /v1/screenshot ───────────────────────────────────────
    // Supports both new format (deviceId query param + device token) and
    // legacy format (pendingId query param + registration token).
    if (url.pathname === '/v1/screenshot') {
      const deviceIdParam  = url.searchParams.get('deviceId');
      const pendingIdParam = url.searchParams.get('pendingId');

      let deviceId: string | null = null;

      if (deviceIdParam) {
        // New format: device token auth
        const tokenData = await verifyTokenCached(fs, kv, rawToken, 'device');
        if (!tokenData) return jsonRes({ error: 'Invalid or revoked token' }, 401);
        deviceId = deviceIdParam;
      } else if (pendingIdParam) {
        // Legacy format: registration token auth
        const tokenData = await verifyTokenCached(fs, kv, rawToken, 'registration');
        if (!tokenData) return jsonRes({ error: 'Invalid or revoked token' }, 401);
        deviceId = await resolveDeviceId(fs, pendingIdParam);
        if (!deviceId) return jsonRes({ error: 'Device not approved yet' }, 403);
      } else {
        return jsonRes({ error: 'Missing deviceId or pendingId parameter' }, 400);
      }

      const imgBytes = await req.arrayBuffer();
      if (imgBytes.byteLength === 0) return jsonRes({ error: 'Empty body' }, 400);
      if (imgBytes.byteLength > 25 * 1024 * 1024) {
        return jsonRes({ error: 'Image too large (max 25 MB)' }, 400);
      }

      await env.SCREENSHOTS.put(deviceId, imgBytes, {
        metadata: { capturedAt: new Date().toISOString() },
      });

      // Clear screenshotRequested flag (new design) and legacy screenshotRequests doc
      await Promise.allSettled([
        fs.patch('devices', deviceId, { screenshotRequested: false }),
        fs.get('screenshotRequests', deviceId).then(ssDoc => {
          if (ssDoc) {
            return fs.patch('screenshotRequests', deviceId, {
              status:      'completed',
              completedAt: new Date(),
            });
          }
        }),
      ]);

      return jsonRes({ success: true });
    }

    return jsonRes({ error: 'Not found' }, 404);
  },
};
