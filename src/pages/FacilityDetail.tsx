import { Link, useParams } from 'react-router-dom';
import { facilities } from '../data/mock';
import { StatusBadge } from '../components/StatusBadge';

function MetricBar({ label, value, unit, warn = 70, danger = 90 }: {
  label: string; value: number; unit: string; warn?: number; danger?: number;
}) {
  const color = value === 0 ? 'bg-gray-200'
    : value >= danger ? 'bg-red-500'
    : value >= warn   ? 'bg-yellow-400'
    : 'bg-green-500';

  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{label}</span>
        <span className="font-medium text-gray-700">{value}{unit}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
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
  const date = new Date(iso);
  return date.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function FacilityDetail() {
  const { id } = useParams<{ id: string }>();
  const facility = facilities.find(f => f.id === id);

  if (!facility) {
    return (
      <div className="p-8">
        <p className="text-gray-500">施設が見つかりません。</p>
        <Link to="/" className="text-blue-600 text-sm mt-2 inline-block hover:underline">← ダッシュボードに戻る</Link>
      </div>
    );
  }

  return (
    <div className="p-8">
      <Link to="/" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">← ダッシュボードに戻る</Link>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">{facility.name}</h1>
        <p className="text-sm text-gray-400 mt-0.5">{facility.address}</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {facility.devices.map(device => (
          <div key={device.id} className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-4">
                <div>
                  <p className="font-semibold text-gray-900">{device.name}</p>
                  <p className="text-sm text-gray-400 font-mono mt-0.5">{device.ip}</p>
                </div>
                <StatusBadge status={device.status} />
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-700">{device.app} <span className="text-gray-400 font-normal">v{device.appVersion}</span></p>
                <p className="text-xs text-gray-400 mt-0.5">最終確認: {formatLastSeen(device.lastSeen)}</p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-6">
              <div className="col-span-3 grid grid-cols-2 gap-x-8 gap-y-3">
                <MetricBar label="CPU"      value={device.system.cpu}         unit="%" />
                <MetricBar label="メモリ"   value={device.system.memory}      unit="%" />
                <MetricBar label="温度"     value={device.system.temperature} unit="°C" warn={65} danger={80} />
                <MetricBar label="ストレージ" value={device.system.storage}   unit="%" warn={80} danger={90} />
              </div>
              <div className="flex flex-col justify-center border-l border-gray-100 pl-6">
                <p className="text-xs text-gray-400 mb-1">稼働時間</p>
                <p className="text-lg font-semibold text-gray-800">{formatUptime(device.system.uptime)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
