import { Link, useParams } from 'react-router-dom';
import { facilities } from '../data/mock';
import { StatusBadge } from '../components/StatusBadge';

function MetricBar({ label, value, unit, warn = 70, danger = 90 }: {
  label: string; value: number; unit: string; warn?: number; danger?: number;
}) {
  const color = value === 0 ? 'bg-zinc-700'
    : value >= danger ? 'bg-red-500'
    : value >= warn   ? 'bg-yellow-400'
    : 'bg-green-500';

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-zinc-500">{label}</span>
        <span className="text-zinc-300 font-medium tabular-nums">{value}{unit}</span>
      </div>
      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

function formatUptime(hours: number) {
  if (hours === 0) return '-';
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return d > 0 ? `${d}日 ${h}時間` : `${h}時間`;
}

function formatLastSeen(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function FacilityDetail() {
  const { id } = useParams<{ id: string }>();
  const facility = facilities.find(f => f.id === id);

  if (!facility) {
    return (
      <div className="p-8">
        <p className="text-zinc-400">施設が見つかりません。</p>
        <Link to="/" className="text-blue-400 text-sm mt-2 inline-block hover:text-blue-300">
          ← ダッシュボードに戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8">
      <Link to="/" className="text-sm text-zinc-500 hover:text-zinc-300 mb-6 inline-block transition-colors">
        ← ダッシュボードに戻る
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">{facility.name}</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{facility.address}</p>
      </div>

      <div className="space-y-3">
        {facility.devices.map(device => (
          <div key={device.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-medium text-zinc-100 text-sm">{device.name}</p>
                  <p className="text-xs text-zinc-500 font-mono mt-0.5">{device.ip}</p>
                </div>
                <StatusBadge status={device.status} />
              </div>
              <div className="text-right">
                <p className="text-sm text-zinc-300">
                  {device.app}{' '}
                  <span className="text-zinc-500 text-xs">v{device.appVersion}</span>
                </p>
                <p className="text-xs text-zinc-600 mt-0.5">最終確認: {formatLastSeen(device.lastSeen)}</p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-6">
              <div className="col-span-3 grid grid-cols-2 gap-x-8 gap-y-3">
                <MetricBar label="CPU"        value={device.system.cpu}         unit="%" />
                <MetricBar label="メモリ"     value={device.system.memory}      unit="%" />
                <MetricBar label="温度"       value={device.system.temperature} unit="°C" warn={65} danger={80} />
                <MetricBar label="ストレージ" value={device.system.storage}     unit="%" warn={80} danger={90} />
              </div>
              <div className="flex flex-col justify-center pl-5 border-l border-zinc-800">
                <p className="text-xs text-zinc-500 mb-1">稼働時間</p>
                <p className="text-lg font-semibold text-zinc-200">{formatUptime(device.system.uptime)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
