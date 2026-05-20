export type DeviceStatus = 'online' | 'offline' | 'warning';
export type AppName = 'Gido' | 'Gido-Touch' | 'Gido-Touch-Mini' | 'Grain-Link';

export interface SystemInfo {
  cpu: number;
  memory: number;
  temperature: number;
  storage: number;
  uptime: number;
}

export interface Device {
  id: string;
  name: string;
  ip: string;
  status: DeviceStatus;
  lastSeen: string;
  app: AppName;
  appVersion: string;
  system: SystemInfo;
}

export interface Facility {
  id: string;
  name: string;
  prefecture: string;
  address: string;
  devices: Device[];
}
