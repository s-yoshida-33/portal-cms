import { useTranslation } from 'react-i18next';
import type { DeviceStatus } from '../types';

export function StatusBadge({ status }: { status: DeviceStatus }) {
  const { t } = useTranslation();
  const config: Record<DeviceStatus, { label: string; dot: string; className: string }> = {
    online:  { label: t('status.online'),  dot: 'bg-green-400',  className: 'bg-green-950/60  text-green-400  border-green-900/50' },
    offline: { label: t('status.offline'), dot: 'bg-red-400',    className: 'bg-red-950/60    text-red-400    border-red-900/50' },
    warning: { label: t('status.warning'), dot: 'bg-yellow-400', className: 'bg-yellow-950/60 text-yellow-400 border-yellow-900/50' },
  };
  const { label, dot, className } = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
