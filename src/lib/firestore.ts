import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
  Timestamp,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, rtdb } from './firebase';
import { ref as rtdbRef, set as rtdbSet } from 'firebase/database';
import type {
  ProjectDoc,
  Device,
  DeviceGroup,
  UserRole,
  UserRoleRecord,
  ApiToken,
  ApiTokenType,
  PendingDevice,
  DeletionRequest,
  DeletionTargetType,
  PortalNotification,
  SiteLog,
} from '../types';

// ---------- helpers ----------

function toISO(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (v instanceof Date)      return v.toISOString();
  if (typeof v === 'string')  return v;
  return new Date().toISOString();
}

function fromDoc<T>(snap: DocumentSnapshot): T {
  const data = snap.data() ?? {};
  const converted = Object.fromEntries(
    Object.entries(data).map(([k, val]) => [k, val instanceof Timestamp ? toISO(val) : val])
  );
  return { id: snap.id, ...converted } as T;
}

// ---------- collections ----------

const col = {
  projects:         () => collection(db, 'projects'),
  devices:          () => collection(db, 'devices'),
  pendingDevices:   () => collection(db, 'pendingDevices'),
  userRoles:        () => collection(db, 'userRoles'),
  apiTokens:        () => collection(db, 'apiTokens'),
  deletionRequests: () => collection(db, 'deletionRequests'),
  notifications:    () => collection(db, 'notifications'),
  groups:           () => collection(db, 'groups'),
  siteLogs:         () => collection(db, 'siteLogs'),
};

// ================================================================
// Projects
// ================================================================

export function subscribeProjects(
  onUpdate: (projects: ProjectDoc[]) => void
): Unsubscribe {
  return onSnapshot(
    query(col.projects(), orderBy('name')),
    snap => onUpdate(snap.docs.map(d => fromDoc<ProjectDoc>(d)))
  );
}

export function subscribeProject(
  projectId: string,
  onUpdate: (project: ProjectDoc | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(col.projects(), projectId),
    snap => onUpdate(snap.exists() ? fromDoc<ProjectDoc>(snap) : null),
  );
}

export async function fetchProjects(): Promise<ProjectDoc[]> {
  const snap = await getDocs(query(col.projects(), orderBy('name')));
  return snap.docs.map(d => fromDoc<ProjectDoc>(d));
}

export async function fetchProject(id: string): Promise<ProjectDoc | null> {
  const snap = await getDoc(doc(col.projects(), id));
  return snap.exists() ? fromDoc<ProjectDoc>(snap) : null;
}

export async function addProject(
  data: Pick<ProjectDoc, 'name' | 'prefecture' | 'address'>
): Promise<string> {
  const ref = await addDoc(col.projects(), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateProject(
  id: string,
  data: Partial<Pick<ProjectDoc, 'name' | 'prefecture' | 'address'>>
): Promise<void> {
  await updateDoc(doc(col.projects(), id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

// ================================================================
// Devices
// ================================================================

export function subscribeDevice(
  deviceId: string,
  onUpdate: (device: Device | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(col.devices(), deviceId),
    snap => onUpdate(snap.exists() ? fromDoc<Device>(snap) : null)
  );
}

export function subscribeDevices(
  onUpdate: (devices: Device[]) => void
): Unsubscribe {
  return onSnapshot(
    query(col.devices(), orderBy('name')),
    snap => onUpdate(snap.docs.map(d => fromDoc<Device>(d)))
  );
}

export async function fetchDevices(): Promise<Device[]> {
  const snap = await getDocs(query(col.devices(), orderBy('name')));
  return snap.docs.map(d => fromDoc<Device>(d));
}

export function subscribeDevicesByProject(
  projectId: string,
  onUpdate: (devices: Device[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(col.devices(), where('projectId', '==', projectId)),
    snap => {
      const devs = snap.docs.map(d => fromDoc<Device>(d));
      devs.sort((a, b) => {
        const n = a.name.localeCompare(b.name, 'ja');
        if (n !== 0) return n;
        // Same name: external apps before Bridge-Ground
        const aBG = a.app === 'Bridge-Ground' ? 1 : 0;
        const bBG = b.app === 'Bridge-Ground' ? 1 : 0;
        return aBG - bBG;
      });
      onUpdate(devs);
    },
    onError,
  );
}

export async function addDevice(
  data: Omit<Device, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(col.devices(), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateDevice(
  id: string,
  data: Partial<Omit<Device, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(col.devices(), id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

// ── Device Logs (subcollection) ──────────────────────────────────

export interface DeviceLog {
  id:        string;
  timestamp: string;
  level:     string;
  tag:       string;
  message:   string;
  app:       string;
  sentAt:    string;
}

export async function fetchDeviceLogs(deviceId: string): Promise<DeviceLog[]> {
  const snap = await getDocs(
    query(
      collection(db, 'devices', deviceId, 'logs'),
      orderBy('sentAt', 'desc'),
      limit(200),
    ),
  );
  const logs = snap.docs.map(d => fromDoc<DeviceLog>(d));
  logs.sort((a, b) => {
    const ta = a.timestamp || a.sentAt;
    const tb = b.timestamp || b.sentAt;
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });
  return logs;
}

// ================================================================
// Groups
// ================================================================

export function subscribeGroupsByProject(
  projectId: string,
  onUpdate: (groups: DeviceGroup[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(col.groups(), where('projectId', '==', projectId)),
    snap => {
      const groups = snap.docs.map(d => fromDoc<DeviceGroup>(d));
      groups.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
      onUpdate(groups);
    }
  );
}

export async function addGroup(
  data: Pick<DeviceGroup, 'projectId' | 'name' | 'parentGroupId'>
): Promise<string> {
  const ref = await addDoc(col.groups(), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateGroup(
  id: string,
  data: Partial<Pick<DeviceGroup, 'name' | 'parentGroupId'>>
): Promise<void> {
  await updateDoc(doc(col.groups(), id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function setGroupDevices(
  groupId: string,
  selectedIds: string[],
  previousIds: string[],
): Promise<void> {
  const batch = writeBatch(db);
  for (const id of selectedIds) {
    batch.update(doc(col.devices(), id), { groupId, updatedAt: serverTimestamp() });
  }
  for (const id of previousIds) {
    if (!selectedIds.includes(id)) {
      batch.update(doc(col.devices(), id), { groupId: null, updatedAt: serverTimestamp() });
    }
  }
  await batch.commit();
}

// ================================================================
// User Roles
// ================================================================

export async function getUserRole(uid: string): Promise<UserRole | null> {
  const snap = await getDoc(doc(col.userRoles(), uid));
  if (!snap.exists()) return null;
  return snap.data().role as UserRole;
}

export function subscribeUserRoles(
  onUpdate: (roles: UserRoleRecord[]) => void
): Unsubscribe {
  return onSnapshot(
    query(col.userRoles(), orderBy('email')),
    snap => onUpdate(snap.docs.map(d => fromDoc<UserRoleRecord>(d)))
  );
}

export async function setUserRole(
  uid: string,
  data: Omit<UserRoleRecord, 'uid'>
): Promise<void> {
  await setDoc(doc(col.userRoles(), uid), { uid, ...data }, { merge: true });
}

export async function removeUserRole(uid: string): Promise<void> {
  await deleteDoc(doc(col.userRoles(), uid));
}

// ================================================================
// API Tokens
// ================================================================

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function createApiToken(
  name: string,
  type: ApiTokenType,
  deviceId?: string
): Promise<{ id: string; token: string }> {
  const token     = generateToken();
  const tokenHash = await hashToken(token);
  const payload: Record<string, unknown> = {
    name, type, tokenHash,
    createdAt:  serverTimestamp(),
    lastUsedAt: null,
    revokedAt:  null,
  };
  if (deviceId) payload.deviceId = deviceId;

  const tokenRef  = doc(col.apiTokens());
  const lookupRef = doc(db, 'tokenLookup', tokenHash);
  const batch     = writeBatch(db);
  batch.set(tokenRef, payload);
  batch.set(lookupRef, { type, revokedAt: null });
  await batch.commit();

  return { id: tokenRef.id, token };
}

export function subscribeApiTokens(
  onUpdate: (tokens: ApiToken[]) => void
): Unsubscribe {
  return onSnapshot(
    query(col.apiTokens(), orderBy('createdAt', 'desc')),
    snap => onUpdate(snap.docs.map(d => fromDoc<ApiToken>(d)))
  );
}

export async function revokeApiToken(tokenId: string): Promise<void> {
  const snap = await getDoc(doc(col.apiTokens(), tokenId));
  if (!snap.exists()) return;
  const { tokenHash } = snap.data() as { tokenHash: string };

  const batch = writeBatch(db);
  batch.update(doc(col.apiTokens(), tokenId), { revokedAt: serverTimestamp() });
  batch.update(doc(db, 'tokenLookup', tokenHash), { revokedAt: serverTimestamp() });
  await batch.commit();
}

// ================================================================
// Deletion Requests
// ================================================================

export async function requestDeletion(
  type: DeletionTargetType,
  targetId: string,
  targetName: string,
  requestedBy: string,
  requestedByEmail: string
): Promise<string> {
  const batch = writeBatch(db);

  const reqRef  = doc(col.deletionRequests());
  const noteRef = doc(col.notifications());

  batch.set(reqRef, {
    type, targetId, targetName,
    requestedBy, requestedByEmail,
    requestedAt: serverTimestamp(),
    status:      'pending',
    reviewedAt:  null,
    reviewNote:  null,
  });

  batch.set(noteRef, {
    type:      'deletion_request',
    message:   `「${targetName}」の削除依頼が届いています。`,
    relatedId: reqRef.id,
    createdAt: serverTimestamp(),
    read:      false,
  });

  await batch.commit();
  return reqRef.id;
}

export function subscribeDeletionRequests(
  onUpdate: (requests: DeletionRequest[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(col.deletionRequests(), where('status', '==', 'pending')),
    snap => {
      const reqs = snap.docs.map(d => fromDoc<DeletionRequest>(d));
      reqs.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
      onUpdate(reqs);
    },
    onError,
  );
}

export async function approveDeletion(
  requestId: string,
  request: DeletionRequest
): Promise<void> {
  const batch = writeBatch(db);

  batch.update(doc(col.deletionRequests(), requestId), {
    status:     'approved',
    reviewedAt: serverTimestamp(),
  });

  if (request.type === 'project') {
    // プロジェクトに紐づくデバイスを先に削除
    const devSnap = await getDocs(
      query(col.devices(), where('projectId', '==', request.targetId))
    );
    devSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(doc(col.projects(), request.targetId));
  } else if (request.type === 'device') {
    batch.delete(doc(col.devices(), request.targetId));
  } else if (request.type === 'apiToken') {
    const tokenSnap = await getDoc(doc(col.apiTokens(), request.targetId));
    if (tokenSnap.exists()) {
      const { tokenHash } = tokenSnap.data() as { tokenHash: string };
      batch.update(doc(col.apiTokens(), request.targetId), { revokedAt: serverTimestamp() });
      batch.update(doc(db, 'tokenLookup', tokenHash), { revokedAt: serverTimestamp() });
    }
  } else if (request.type === 'group') {
    const devSnap = await getDocs(
      query(col.devices(), where('groupId', '==', request.targetId))
    );
    devSnap.docs.forEach(d => batch.update(d.ref, { groupId: null, updatedAt: serverTimestamp() }));
    batch.delete(doc(col.groups(), request.targetId));
  }

  await batch.commit();
}

export async function rejectDeletion(
  requestId: string,
  reviewNote: string
): Promise<void> {
  await updateDoc(doc(col.deletionRequests(), requestId), {
    status:     'rejected',
    reviewedAt: serverTimestamp(),
    reviewNote,
  });
}

// ================================================================
// Notifications
// ================================================================

export function subscribeNotifications(
  onUpdate: (notifications: PortalNotification[]) => void
): Unsubscribe {
  return onSnapshot(
    query(col.notifications(), orderBy('createdAt', 'desc')),
    snap => onUpdate(snap.docs.map(d => fromDoc<PortalNotification>(d)))
  );
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await updateDoc(doc(col.notifications(), notificationId), { read: true });
}

export async function markAllNotificationsRead(): Promise<void> {
  const snap  = await getDocs(query(col.notifications(), where('read', '==', false)));
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.update(d.ref, { read: true }));
  await batch.commit();
}

// ================================================================
// Pending Devices
// ================================================================

export function subscribePendingDevices(
  onUpdate: (devices: PendingDevice[]) => void
): Unsubscribe {
  return onSnapshot(
    query(col.pendingDevices(), orderBy('requestedAt', 'desc')),
    snap => onUpdate(snap.docs.map(d => fromDoc<PendingDevice>(d)))
  );
}

export async function approveDevice(
  pendingDeviceId: string,
  pending: PendingDevice,
  projectId: string,
  deviceName: string
): Promise<{ deviceId: string; deviceToken: string }> {
  // Pre-generate all IDs and token so the entire operation is a single atomic batch.
  // This prevents partial state (duplicate devices/tokens) if any step fails.
  const deviceRef = doc(col.devices());
  const tokenRef  = doc(col.apiTokens());
  const deviceId  = deviceRef.id;
  const rawToken  = generateToken();
  const tokenHash = await hashToken(rawToken);
  const now       = new Date().toISOString();
  // Claim expires in 1 hour — Bridge-Ground auto-picks up credentials via GET /v1/device.
  const claimExpiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

  const batch = writeBatch(db);

  // 1. Create device document.
  batch.set(deviceRef, {
    name:                deviceName,
    projectId,
    hostname:            pending.hostname,
    ip:                  pending.ip,
    status:              'offline',
    lastSeen:            now,
    app:                 pending.appName,
    appVersion:          '',
    system:              { cpu: 0, memory: 0, temperature: 0, storage: 0, uptime: 0 },
    screenshotRequested: false,
    createdAt:           serverTimestamp(),
    updatedAt:           serverTimestamp(),
  });

  // 2. Create apiTokens entry.
  batch.set(tokenRef, {
    name:      `device-${deviceId}`,
    type:      'device',
    tokenHash,
    deviceId,
    createdAt:  serverTimestamp(),
    lastUsedAt: null,
    revokedAt:  null,
  });

  // 3. Create tokenLookup entry for Worker token verification.
  batch.set(doc(db, 'tokenLookup', tokenHash), {
    type:      'device',
    revokedAt: null,
  });

  // 4. Remove the pending entry.
  batch.delete(doc(col.pendingDevices(), pendingDeviceId));

  // 5. Write permanent pendingId → deviceId mapping (backward compat for legacy BG).
  batch.set(doc(db, 'deviceApprovals', pendingDeviceId), {
    deviceId,
    createdAt: serverTimestamp(),
  });

  // 6. Create one-time approval claim for Bridge-Ground to auto-pickup credentials.
  //    Requires Firestore rule: allow read, delete: if true; on pendingDeviceApprovals.
  batch.set(doc(db, 'pendingDeviceApprovals', pendingDeviceId), {
    deviceId,
    deviceToken: rawToken,
    expiresAt:   claimExpiresAt,
  });

  await batch.commit();

  return { deviceId, deviceToken: rawToken };
}

// setDeviceApproval writes (or overwrites) the permanent pendingId → deviceId
// mapping used by the Worker to resolve Bridge-Ground requests without per-device tokens.
export async function setDeviceApproval(
  pendingId: string,
  deviceId:  string,
): Promise<void> {
  await setDoc(doc(db, 'deviceApprovals', pendingId), {
    deviceId,
    createdAt: serverTimestamp(),
  });
}

export async function rejectPendingDevice(pendingDeviceId: string): Promise<void> {
  await deleteDoc(doc(col.pendingDevices(), pendingDeviceId));
}

// ================================================================
// Screenshot Requests
// ================================================================

export async function requestScreenshot(deviceId: string): Promise<void> {
  await setDoc(doc(db, 'screenshotRequests', deviceId), {
    status:      'pending',
    requestedAt: serverTimestamp(),
    completedAt: null,
  });
  // Signal BG via RTDB SSE (unified signals path, type field routes the handler).
  await rtdbSet(rtdbRef(rtdb, `signals/${deviceId}`), { at: Date.now(), type: 'screenshot' }).catch(() => {});
}

export async function requestLogs(deviceId: string, date: string): Promise<void> {
  await rtdbSet(rtdbRef(rtdb, `signals/${deviceId}`), { at: Date.now(), type: 'log', date }).catch(() => {});
}

export async function cancelScreenshotRequest(deviceId: string): Promise<void> {
  await setDoc(doc(db, 'screenshotRequests', deviceId), { status: 'cancelled' }, { merge: true });
}

export function subscribeScreenshotRequest(
  deviceId: string,
  onUpdate: (data: { status: string; completedAt?: { toDate(): Date } | null } | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'screenshotRequests', deviceId),
    snap => onUpdate(snap.exists() ? (snap.data() as { status: string; completedAt?: { toDate(): Date } | null }) : null),
    _err => onUpdate(null),
  );
}

// ================================================================
// Device Settings
// ================================================================

export interface DeviceSettingsData {
  files:     Record<string, string>;
  fetchedAt: { toDate(): Date } | null;
}

export async function requestDeviceSettings(deviceId: string): Promise<void> {
  await updateDoc(doc(col.devices(), deviceId), { settingsRequested: true });
  await rtdbSet(rtdbRef(rtdb, `signals/${deviceId}`), { at: Date.now(), type: 'settings' }).catch(() => {});
}

export function subscribeDeviceSettings(
  deviceId: string,
  onUpdate: (data: DeviceSettingsData | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'devices', deviceId, 'settings', 'latest'),
    snap => onUpdate(snap.exists() ? (snap.data() as DeviceSettingsData) : null),
    _err => onUpdate(null),
  );
}

// ================================================================
// Site Logs
// ================================================================

export async function addSiteLog(
  log: Omit<SiteLog, 'id' | 'performedAt'>
): Promise<void> {
  await addDoc(col.siteLogs(), {
    ...log,
    performedAt: serverTimestamp(),
  });
}

export function subscribeSiteLogs(
  onUpdate: (logs: SiteLog[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(col.siteLogs(), orderBy('performedAt', 'desc'), limit(500)),
    snap => onUpdate(snap.docs.map(d => fromDoc<SiteLog>(d))),
    onError,
  );
}
