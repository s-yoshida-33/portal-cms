import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';

admin.initializeApp();
const db = admin.firestore();

// ── CORS ─────────────────────────────────────────────────────────

function applyCors(res: any): void {
  res.set('Access-Control-Allow-Origin',  '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ── トークン検証 ──────────────────────────────────────────────────

type TokenType = 'registration' | 'device';

async function verifyToken(
  raw: string,
  type: TokenType
): Promise<admin.firestore.DocumentData | null> {
  const hash = createHash('sha256').update(raw).digest('hex');

  const snap = await db.collection('apiTokens')
    .where('tokenHash', '==', hash)
    .where('type',      '==', type)
    .limit(1)
    .get();

  if (snap.empty) return null;

  const doc  = snap.docs[0];
  const data = doc.data();

  if (data.revokedAt) return null;

  // 最終使用日時を更新
  await doc.ref.update({ lastUsedAt: admin.firestore.FieldValue.serverTimestamp() });

  return data;
}

// ── POST /v1/register ─────────────────────────────────────────────
//
// リクエスト body:
//   { appName: string, hostname: string, ip: string }
//
// レスポンス:
//   201: { success: true, pendingId: string }
//   400: { error: string }
//   401: { error: string }

export const register = onRequest(
  { region: 'asia-northeast1' },
  async (req, res) => {
    applyCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return; }

    // トークン検証
    const authHeader = req.headers.authorization ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Bearer token' });
      return;
    }
    const tokenData = await verifyToken(authHeader.slice(7), 'registration');
    if (!tokenData) {
      res.status(401).json({ error: 'Invalid or revoked token' });
      return;
    }

    // バリデーション
    const { appName, hostname, ip } = req.body as Record<string, string>;
    if (!appName || !hostname || !ip) {
      res.status(400).json({ error: 'Missing required fields: appName, hostname, ip' });
      return;
    }

    const allowed = ['Gido', 'Gido-Touch', 'Gido-Touch-Mini', 'Grain-Link', 'Bridge-Ground'];
    if (!allowed.includes(appName)) {
      res.status(400).json({ error: `Invalid appName. Allowed: ${allowed.join(', ')}` });
      return;
    }

    // pendingDevices に追加（セキュリティルールで client からの create は禁止）
    const ref = await db.collection('pendingDevices').add({
      appName,
      hostname,
      ip,
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(201).json({ success: true, pendingId: ref.id });
  }
);

// ── POST /v1/status ───────────────────────────────────────────────
//
// リクエスト body:
//   {
//     deviceId:    string,
//     status:      'online' | 'offline' | 'warning',
//     ip?:         string,   // 現在の IP アドレス（変化時に自動更新）
//     cpu:         number,   // %
//     memory:      number,   // %
//     temperature: number,   // °C
//     storage:     number,   // %
//     uptime:      number,   // hours
//   }
//
// レスポンス:
//   200: { success: true }
//   400: { error: string }
//   401: { error: string }
//   404: { error: string }

export const status = onRequest(
  { region: 'asia-northeast1' },
  async (req, res) => {
    applyCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return; }

    // トークン検証
    const authHeader = req.headers.authorization ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Bearer token' });
      return;
    }
    const tokenData = await verifyToken(authHeader.slice(7), 'device');
    if (!tokenData) {
      res.status(401).json({ error: 'Invalid or revoked token' });
      return;
    }

    // バリデーション
    const body = req.body as {
      deviceId:     string;
      status?:      string;
      ip?:          string;
      cpu?:         number;
      memory?:      number;
      temperature?: number;
      storage?:     number;
      uptime?:      number;
    };

    if (!body.deviceId) {
      res.status(400).json({ error: 'Missing required field: deviceId' });
      return;
    }

    // デバイス存在確認
    const deviceRef  = db.collection('devices').doc(body.deviceId);
    const deviceSnap = await deviceRef.get();
    if (!deviceSnap.exists) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    const validStatuses = ['online', 'offline', 'warning'];
    const deviceStatus  = validStatuses.includes(body.status ?? '')
      ? body.status
      : 'online';

    const updatePayload: Record<string, unknown> = {
      status:   deviceStatus,
      lastSeen: new Date().toISOString(),
      system: {
        cpu:         body.cpu         ?? 0,
        memory:      body.memory      ?? 0,
        temperature: body.temperature ?? 0,
        storage:     body.storage     ?? 0,
        uptime:      body.uptime      ?? 0,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (body.ip) updatePayload.ip = body.ip;

    await deviceRef.update(updatePayload);

    res.status(200).json({ success: true });
  }
);

// ── 心拍途絶デバイスのoffline化（定期実行） ──────────────────────────
//
// 全端末のハートビート間隔は3600秒（1時間）。閾値は心拍2回分の余裕を
// 持たせて2時間とし、1回分の遅延・取りこぼしでは誤ってofflineにしない。

const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2時間

export const markStaleDevicesOffline = onSchedule(
  { schedule: 'every 15 minutes', region: 'asia-northeast1' },
  async () => {
    const threshold = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();

    const staleSnap = await db.collection('devices')
      .where('status',   '==', 'online')
      .where('lastSeen', '<',  threshold)
      .get();

    if (staleSnap.empty) return;

    const batch = db.batch();
    staleSnap.forEach(doc => batch.update(doc.ref, { status: 'offline' }));
    await batch.commit();
  }
);
