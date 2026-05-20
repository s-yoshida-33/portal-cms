import { Link } from 'react-router-dom';
import { facilities } from '../data/mock';
import { StatusBadge } from '../components/StatusBadge';
import type { DeviceStatus } from '../types';

function countByStatus(devices: { status: DeviceStatus }[], status: DeviceStatus) {
  return devices.filter(d => d.status === status).length;
}

export function Dashboard() {
  const allDevices = facilities.flatMap(f => f.devices);
  const totalOnline  = countByStatus(allDevices, 'online');
  const totalOffline = countByStatus(allDevices, 'offline');
  const totalWarning = countByStatus(allDevices, 'warning');

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">ダッシュボード</h1>
      <p className="text-sm text-gray-500 mb-8">全施設のデバイス稼働状況</p>

      {/* サマリーカード */}
      <div className="grid grid-cols-4 gap-4 mb-10">
        {[
          { label: '施設数',         value: facilities.length, color: 'text-gray-900' },
          { label: '総デバイス数',   value: allDevices.length, color: 'text-gray-900' },
          { label: 'オンライン',     value: totalOnline,       color: 'text-green-600' },
          { label: 'オフライン / 警告', value: totalOffline + totalWarning, color: 'text-red-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 px-6 py-5">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className={`text-3xl font-semibold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* 施設一覧 */}
      <h2 className="text-base font-semibold text-gray-700 mb-4">施設一覧</h2>
      <div className="grid grid-cols-2 gap-4">
        {facilities.map(facility => {
          const online  = countByStatus(facility.devices, 'online');
          const offline = countByStatus(facility.devices, 'offline');
          const warning = countByStatus(facility.devices, 'warning');

          return (
            <Link
              key={facility.id}
              to={`/facilities/${facility.id}`}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md hover:border-gray-300 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="font-semibold text-gray-900">{facility.name}</p>
                  <p className="text-sm text-gray-400 mt-0.5">{facility.prefecture}</p>
                </div>
                <span className="text-xs text-gray-400">{facility.devices.length} 台</span>
              </div>

              <div className="flex gap-3">
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                  {online}
                </span>
                {warning > 0 && (
                  <span className="flex items-center gap-1 text-sm text-yellow-600">
                    <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />
                    {warning}
                  </span>
                )}
                {offline > 0 && (
                  <span className="flex items-center gap-1 text-sm text-red-600">
                    <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                    {offline}
                  </span>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {facility.devices.map(d => (
                  <StatusBadge key={d.id} status={d.status} />
                ))}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
