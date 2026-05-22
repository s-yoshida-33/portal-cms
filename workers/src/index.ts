export interface Env {
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY:           string;
  FIREBASE_PROJECT_ID:          string;
}

// ── CORS ──────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonRes(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// ── JWT / Google Auth ─────────────────────────────────────────────────────────

function base64url(input: string | ArrayBuffer): string {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : new Uint8Array(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken(email: string, privateKeyPem: string): Promise<string> {
  const now     = Math.floor(Date.now() / 1000);
  const header  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss:   email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  }));

  const pemContent = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const keyData = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'pkcs8', keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key,
    new TextEncoder().encode(`${header}.${payload}`)
  );

  const jwt = `${header}.${payload}.${base64url(sig)}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  const json = await resp.json() as { access_token: string };
  return json.access_token;
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
  private token: string;

  constructor(projectId: string, token: string) {
    this.base  = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    this.token = token;
  }

  private get authHeader() {
    return { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' };
  }

  async query(
    collectionId: string,
    filters: Array<{ field: string; value: string }>
  ): Promise<Array<{ document: { name: string; fields: Record<string, FsVal> } }>> {
    const body = {
      structuredQuery: {
        from:  [{ collectionId }],
        where: {
          compositeFilter: {
            op:      'AND',
            filters: filters.map(f => ({
              fieldFilter: {
                field: { fieldPath: f.field },
                op:    'EQUAL',
                value: { stringValue: f.value },
              },
            })),
          },
        },
        limit: 1,
      },
    };

    const resp    = await fetch(`${this.base}:runQuery`, {
      method: 'POST', headers: this.authHeader, body: JSON.stringify(body),
    });
    const results = await resp.json() as Array<{ document?: unknown }>;
    return results.filter(r => r.document) as ReturnType<Firestore['query']> extends Promise<infer T> ? T : never;
  }

  async get(collection: string, docId: string): Promise<{ fields: Record<string, FsVal> } | null> {
    const resp = await fetch(`${this.base}/${collection}/${docId}`, { headers: this.authHeader });
    if (!resp.ok) return null;
    return resp.json() as Promise<{ fields: Record<string, FsVal> }>;
  }

  async create(collection: string, fields: Record<string, unknown>): Promise<string> {
    const body = {
      fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toFsValue(v)])),
    };
    const resp = await fetch(`${this.base}/${collection}`, {
      method: 'POST', headers: this.authHeader, body: JSON.stringify(body),
    });
    const doc  = await resp.json() as { name: string };
    return doc.name.split('/').pop()!;
  }

  async patch(collection: string, docId: string, fields: Record<string, unknown>): Promise<void> {
    const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const body = {
      fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toFsValue(v)])),
    };
    await fetch(`${this.base}/${collection}/${docId}?${mask}`, {
      method: 'PATCH', headers: this.authHeader, body: JSON.stringify(body),
    });
  }
}

// ── Token verification ────────────────────────────────────────────────────────

async function verifyToken(
  fs: Firestore,
  raw: string,
  type: string
): Promise<Record<string, FsVal> | null> {
  const hash    = await sha256Hex(raw);
  const results = await fs.query('apiTokens', [
    { field: 'tokenHash', value: hash },
    { field: 'type',      value: type },
  ]);

  if (results.length === 0) return null;

  const doc    = results[0].document;
  const fields = doc.fields ?? {};
  if (fields.revokedAt) return null;

  const docId = doc.name.split('/').pop()!;
  await fs.patch('apiTokens', docId, { lastUsedAt: new Date() });

  return fields;
}

// ── Worker entry point ────────────────────────────────────────────────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (req.method !== 'POST') {
      return jsonRes({ error: 'Method not allowed' }, 405);
    }

    const url        = new URL(req.url);
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return jsonRes({ error: 'Missing Bearer token' }, 401);
    }
    const rawToken = authHeader.slice(7);

    const accessToken = await getAccessToken(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_PRIVATE_KEY);
    const fs          = new Firestore(env.FIREBASE_PROJECT_ID, accessToken);

    // ── POST /v1/register ─────────────────────────────────────────
    if (url.pathname === '/v1/register') {
      const tokenData = await verifyToken(fs, rawToken, 'registration');
      if (!tokenData) return jsonRes({ error: 'Invalid or revoked token' }, 401);

      const body = await req.json() as Record<string, string>;
      const { appName, hostname, ip } = body;
      if (!appName || !hostname || !ip) {
        return jsonRes({ error: 'Missing required fields: appName, hostname, ip' }, 400);
      }

      const allowed = ['Gido', 'Gido-Touch', 'Gido-Touch-Mini', 'Grain-Link'];
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

    // ── POST /v1/status ───────────────────────────────────────────
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
