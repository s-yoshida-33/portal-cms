export type DeviceStatus        = 'online' | 'offline' | 'warning';
export type AppName             = 'Gido' | 'Gido-Touch' | 'Gido-Touch-Mini' | 'Grain-Link' | 'Bridge-Ground';
export type UserRole            = 'owner' | 'admin' | 'user';
export type DeletionTargetType  = 'project' | 'device' | 'apiToken';
export type DeletionStatus      = 'pending' | 'approved' | 'rejected';
export type ApiTokenType        = 'registration' | 'device';

export interface SystemInfo {
  cpu:         number;
  memory:      number;
  temperature: number;
  storage:     number;
  uptime:      number;
}

// Firestore /devices/{deviceId}
export interface Device {
  id:        string;
  projectId: string;
  name:       string;
  ip:         string;
  port?:      number;
  status:     DeviceStatus;
  lastSeen:   string;
  app:        AppName;
  appVersion: string;
  system:     SystemInfo;
  createdAt:  string;
  updatedAt:  string;
}

// Firestore /projects/{projectId}
export interface ProjectDoc {
  id:         string;
  name:       string;
  prefecture: string;
  address:    string;
  createdAt:  string;
  updatedAt:  string;
}

// Firestore /userRoles/{uid}
export interface UserRoleRecord {
  uid:         string;
  role:        UserRole;
  displayName: string;
  email:       string;
  assignedAt:  string;
}

// Firestore /apiTokens/{tokenId}
export interface ApiToken {
  id:          string;
  name:        string;
  type:        ApiTokenType;
  tokenHash:   string;
  createdAt:   string;
  lastUsedAt:  string | null;
  revokedAt:   string | null;
  deviceId?:   string;
}

// Firestore /pendingDevices/{deviceId}
export interface PendingDevice {
  id:          string;
  appName:     AppName;
  hostname:    string;
  ip:          string;
  requestedAt: string;
}

// Firestore /deletionRequests/{requestId}
export interface DeletionRequest {
  id:               string;
  type:             DeletionTargetType;
  targetId:         string;
  targetName:       string;
  requestedBy:      string;
  requestedByEmail: string;
  requestedAt:      string;
  status:           DeletionStatus;
  reviewedAt:       string | null;
  reviewNote:       string | null;
}

// Firestore /notifications/{notificationId}
export interface PortalNotification {
  id:        string;
  type:      string;
  message:   string;
  relatedId: string | null;
  createdAt: string;
  read:      boolean;
}
