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
  serverTimestamp,
  writeBatch,
  Timestamp,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type {
  ProjectDoc,
  Device,
  UserRole,
  UserRoleRecord,
  ApiToken,
  ApiTokenType,
  PendingDevice,
  DeletionRequest,
  DeletionTargetType,
  PortalNotification,
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

export function subscribeDevices(
  onUpdate: (devices: Device[]) => void
): Unsubscribe {
  return onSnapshot(
    query(col.devices(), orderBy('name')),
    snap => onUpdate(snap.docs.map(d => fromDoc<Device>(d)))
  );
}

export function subscribeDevicesByFacility(
  facilityId: string,
  onUpdate: (devices: Device[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(col.devices(), where('facilityId', '==', facilityId)),
    snap => {
      const devs = snap.docs.map(d => fromDoc<Device>(d));
      devs.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
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
  const ref = await addDoc(col.apiTokens(), payload);
  return { id: ref.id, token };
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
  await updateDoc(doc(col.apiTokens(), tokenId), { revokedAt: serverTimestamp() });
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
      query(col.devices(), where('facilityId', '==', request.targetId))
    );
    devSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(doc(col.projects(), request.targetId));
  } else if (request.type === 'device') {
    batch.delete(doc(col.devices(), request.targetId));
  } else if (request.type === 'apiToken') {
    batch.update(doc(col.apiTokens(), request.targetId), { revokedAt: serverTimestamp() });
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
  facilityId: string,
  deviceName: string
): Promise<string> {
  const deviceId = await addDevice({
    name:       deviceName,
    facilityId,
    ip:         pending.ip,
    status:     'offline',
    lastSeen:   new Date().toISOString(),
    app:        pending.appName,
    appVersion: '',
    system:     { cpu: 0, memory: 0, temperature: 0, storage: 0, uptime: 0 },
  });
  await deleteDoc(doc(col.pendingDevices(), pendingDeviceId));
  return deviceId;
}

export async function rejectPendingDevice(pendingDeviceId: string): Promise<void> {
  await deleteDoc(doc(col.pendingDevices(), pendingDeviceId));
}
