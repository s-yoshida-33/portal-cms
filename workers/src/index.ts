export interface Env {
  FIREBASE_API_KEY:    string;
  FIREBASE_PROJECT_ID: string;
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

    // ── GET /v1/pending/{pendingId} ────────────────────────────────
    // BridgeGround polls this endpoint after registration to detect CMS approval.
    // Requires a valid registration token. Returns approved deviceId + deviceToken
    // once the CMS admin has approved the device.
    if (req.method === 'GET' && url.pathname.startsWith('/v1/pending/')) {
      const tokenData = await verifyToken(fs, rawToken, 'registration');
      if (!tokenData) return jsonRes({ error: 'Invalid or revoked token' }, 401);

      const pendingId = url.pathname.slice('/v1/pending/'.length);
      if (!pendingId) return jsonRes({ error: 'Missing pendingId' }, 400);

      // Approval data is written to tokenLookup/{pendingId} with type "approval"
      // by approveDevice() in the CMS. tokenLookup already has "allow get: if true"
      // in deployed Firestore rules, so no additional rule deployment is needed.
      const lookupDoc = await fs.get('tokenLookup', pendingId);
      if (lookupDoc) {
        const f    = lookupDoc.fields;
        const type = (f.type as { stringValue?: string } | undefined)?.stringValue;
        if (type === 'approval') {
          const deviceId    = (f.deviceId    as { stringValue?: string } | undefined)?.stringValue ?? '';
          const deviceToken = (f.deviceToken as { stringValue?: string } | undefined)?.stringValue ?? '';
          return jsonRes({ status: 'approved', deviceId, deviceToken });
        }
      }

      // Still waiting for admin action.
      const pendingDoc = await fs.get('pendingDevices', pendingId);
      if (pendingDoc) {
        return jsonRes({ status: 'pending' });
      }

      // Rejected or unknown.
      return jsonRes({ status: 'rejected' }, 404);
    }

    // All other endpoints require POST.
    if (req.method !== 'POST') {
      return jsonRes({ error: 'Method not allowed' }, 405);
    }

    // ── POST /v1/register ─────────────────────────────────
    if (url.pathname === '/v1/register') {
      const tokenData = await verifyToken(fs, rawToken, 'registration');
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

    // ── POST /v1/status ───────────────────────────────────
    if (url.pathname === '/v1/status') {
      const tokenData = await verifyToken(fs, rawToken, 'device');
      if (!tokenData) return jsonRes({ error: 'Invalid or revoked token' }, 401);

      const body = await req.json() as {
        deviceId:     string;
        status?:      string;
        cpu?:         number;
        memory?:      number;
        temperature?: number;
        storage?:     number;
        uptime?:      number;
      };

      if (!body.deviceId) {
        return jsonRes({ error: 'Missing required field: deviceId' }, 400);
      }

      const deviceDoc = await fs.get('devices', body.deviceId);
      if (!deviceDoc) return jsonRes({ error: 'Device not found' }, 404);

      const validStatuses = ['online', 'offline', 'warning'];
      const deviceStatus  = validStatuses.includes(body.status ?? '') ? body.status! : 'online';

      await fs.patch('devices', body.deviceId, {
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
      });

      return jsonRes({ success: true });
    }

    return jsonRes({ error: 'Not found' }, 404);
  },
};
