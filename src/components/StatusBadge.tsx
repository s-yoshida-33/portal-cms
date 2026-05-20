import type { DeviceStatus } from '../types';

const config: Record<DeviceStatus, { label: string; className: string }> = {
  online:  { label: 'オンライン', className: 'bg-green-100 text-green-700' },
  offline: { label: 'オフライン', className: 'bg-red-100 text-red-700' },
  warning: { label: '警告',       className: 'bg-yellow-100 text-yellow-700' },
};

export function StatusBadge({ status }: { status: DeviceStatus }) {
  const { label, className } = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        status === 'online' ? 'bg-green-500' :
        status === 'offline' ? 'bg-red-500' : 'bg-yellow-500'
      }`} />
      {label}
    </span>
  );
}
