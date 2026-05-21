import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { facilities } from '../data/mock';
import { StatusBadge } from '../components/StatusBadge';
import type { DeviceStatus } from '../types';

function countByStatus(devices: { status: DeviceStatus }[], status: DeviceStatus) {
  return devices.filter(d => d.status === status).length;
}

export function Dashboard() {
  const { user } = useAuth();
  const email = user?.email ?? '';

  const allDevices   = facilities.flatMap(f => f.devices);
  const totalOnline  = countByStatus(allDevices, 'online');
  const totalOffline = countByStatus(allDevices, 'offline');
  const totalWarning = countByStatus(allDevices, 'warning');

  return (
    <div className="flex flex-col min-h-full">

      {/* ロゴエリアと高さを揃えるスペーサー */}
      <div className="h-[53px] border-b border-zinc-800" />

      {/* ページヘッダー */}
      <div className="flex items-center gap-4 py-6 px-4 sm:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-white text-3xl font-semibold">ホーム</h1>
          <p className="text-[#999999] text-base">{email}</p>
        </div>
      </div>

      {/* コンテンツ */}
      <div className="p-8">

        {/* サマリー */}
        <div className="grid grid-cols-4 gap-3 mb-10">
          {[
            { label: '施設数',            value: facilities.length,           color: 'text-zinc-100' },
            { label: '総デバイス数',       value: allDevices.length,           color: 'text-zinc-100' },
            { label: 'オンライン',         value: totalOnline,                 color: 'text-green-400' },
            { label: 'オフライン / 警告',  value: totalOffline + totalWarning, color: 'text-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4">
              <p className="text-xs text-zinc-500 mb-1">{label}</p>
              <p className={`text-3xl font-semibold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* 施設一覧 */}
        <h2 className="text-sm font-medium text-zinc-400 mb-3">施設一覧</h2>
        <div className="grid grid-cols-2 gap-3">
          {facilities.map(facility => {
            const online  = countByStatus(facility.devices, 'online');
            const offline = countByStatus(facility.devices, 'offline');
            const warning = countByStatus(facility.devices, 'warning');

            return (
              <Link
                key={facility.id}
                to={`/facilities/${facility.id}`}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 hover:bg-zinc-800/50 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-medium text-zinc-100 text-sm">{facility.name}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{facility.prefecture}</p>
                  </div>
                  <span className="text-xs text-zinc-600">{facility.devices.length} 台</span>
                </div>

                <div className="flex gap-3 mb-3">
                  <span className="flex items-center gap-1.5 text-xs text-green-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" />{online}
                  </span>
                  {warning > 0 && (
                    <span className="flex items-center gap-1.5 text-xs text-yellow-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />{warning}
                    </span>
                  )}
                  {offline > 0 && (
                    <span className="flex items-center gap-1.5 text-xs text-red-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />{offline}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {facility.devices.map(d => (
                    <StatusBadge key={d.id} status={d.status} />
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
