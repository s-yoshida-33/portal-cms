import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { facilities } from '../data/mock';
import { StatusBadge } from '../components/StatusBadge';
import type { DeviceStatus, Device } from '../types';

function countByStatus(devices: { status: DeviceStatus }[], status: DeviceStatus) {
  return devices.filter(d => d.status === status).length;
}

export function Home() {
  const { user } = useAuth();
  const email = user?.email ?? '';

  const allDevices   = facilities.flatMap(f => f.devices);
  const totalOnline  = countByStatus(allDevices, 'online');
  const totalOffline = countByStatus(allDevices, 'offline');
  const totalWarning = countByStatus(allDevices, 'warning');

  return (
    <div className="flex flex-col min-h-full">

      {/* ロゴエリアと高さを揃えるスペーサー（サイドバーと同じ py-3 + h-7 で高さを一致） */}
      <div className="py-3 border-b border-zinc-800">
        <div className="h-7" />
      </div>

      {/* ページヘッダー（変更なし） */}
      <div className="flex items-center gap-4 py-6 px-4 sm:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-white text-3xl font-semibold">ホーム</h1>
          <p className="text-[#999999] text-base">{email}</p>
        </div>
      </div>

      {/* コンテンツ */}
      <div className="p-8">
        <div className="w-full space-y-8">
          
          {/* ステータスセクション */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <h5 className="text-lg font-semibold text-white">
                  <span className="text-balance">ステータス</span>
                </h5>
              </div>
            </div>

            {/* 各項目ごとの独立したカード（4列グリッド表示） */}
            <div className="grid gap-4 md:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              
              {/* 施設数カード */}
              <div className="overflow-hidden rounded-lg bg-[#111111] shadow-xs ring-1 ring-[#3d3d3d] w-full flex flex-col">
                <header className="justify-between py-0 flex items-center gap-2 bg-black border-b border-[#3d3d3d] h-14 px-4 text-base font-medium text-[#999999]">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-white">施設数</span>
                  </div>
                </header>
                <div className="p-4 flex flex-col justify-center min-h-22">
                  <span className="text-2xl font-semibold text-white">{facilities.length}</span>
                </div>
              </div>

              {/* 総デバイス数カード */}
              <div className="overflow-hidden rounded-lg bg-[#111111] shadow-xs ring-1 ring-[#3d3d3d] w-full flex flex-col">
                <header className="justify-between py-0 flex items-center gap-2 bg-black border-b border-[#3d3d3d] h-14 px-4 text-base font-medium text-[#999999]">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-white">総デバイス数</span>
                  </div>
                </header>
                <div className="p-4 flex flex-col justify-center min-h-22">
                  <span className="text-2xl font-semibold text-white">{allDevices.length}</span>
                </div>
              </div>

              {/* オンラインカード */}
              <div className="overflow-hidden rounded-lg bg-[#111111] shadow-xs ring-1 ring-[#3d3d3d] w-full flex flex-col">
                <header className="justify-between py-0 flex items-center gap-2 bg-black border-b border-[#3d3d3d] h-14 px-4 text-base font-medium text-[#999999]">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-white">オンライン</span>
                  </div>
                </header>
                <div className="p-4 flex flex-col justify-center min-h-22">
                  <span className="text-2xl font-semibold text-[#2db35e]">{totalOnline}</span>
                </div>
              </div>

              {/* オフライン / 警告カード */}
              <div className="overflow-hidden rounded-lg bg-[#111111] shadow-xs ring-1 ring-[#3d3d3d] w-full flex flex-col">
                <header className="justify-between py-0 flex items-center gap-2 bg-black border-b border-[#3d3d3d] h-14 px-4 text-base font-medium text-[#999999]">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-white">オフライン / 警告</span>
                  </div>
                </header>
                <div className="p-4 flex flex-col justify-center min-h-22">
                  <span className="text-2xl font-semibold text-[#fc574a]">{totalOffline + totalWarning}</span>
                </div>
              </div>

            </div>
          </div>

          {/* プロジェクト一覧セクション */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <h5 className="text-lg font-semibold text-white">
                  <span className="text-balance">プロジェクト一覧</span>
                </h5>
              </div>
            </div>

            {/* 施設ごとのカードグリッド（3列表示） */}
            <div className="grid gap-4 md:gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {facilities.map(facility => {
                const online  = countByStatus(facility.devices, 'online');
                const offline = countByStatus(facility.devices, 'offline');
                const warning = countByStatus(facility.devices, 'warning');

                return (
                  <div key={facility.id} className="overflow-hidden rounded-lg bg-[#111111] shadow-xs ring-1 ring-[#3d3d3d] w-full h-full flex flex-col transition-colors hover:ring-[#4693ff]">
                    <Link to={`/facilities/${facility.id}`} className="flex-1 flex flex-col no-underline text-inherit group outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4693ff] cursor-pointer">
                      
                      {/* ホバー時の色も bg-[#111111] に調整 */}
                      <header className="justify-between py-0 flex items-center gap-2 bg-black group-hover:bg-[#111111] transition-colors border-b border-[#3d3d3d] h-14 px-4 text-base font-medium text-[#999999]">
                        <div role="heading" aria-level={2} className="flex min-w-0 items-center gap-2">
                          <span className="truncate">
                            <span className="flex items-center gap-2">
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256"><path d="M240,208H224V96a16,16,0,0,0-16-16H144V32a16,16,0,0,0-16-16H48A16,16,0,0,0,32,32V208H16a8,8,0,0,0,0,16H240a8,8,0,0,0,0-16ZM144,96h64V208H144ZM48,32h80V208H48Zm40,32H72a8,8,0,0,1,0-16H88a8,8,0,0,1,0,16Zm0,32H72a8,8,0,0,1,0-16H88a8,8,0,0,1,0,16Zm0,32H72a8,8,0,0,1,0-16H88a8,8,0,0,1,0,16Zm0,32H72a8,8,0,0,1,0-16H88a8,8,0,0,1,0,16Zm80-64H168a8,8,0,0,1,0-16h16a8,8,0,0,1,0,16Zm0,32H168a8,8,0,0,1,0-16h16a8,8,0,0,1,0,16Zm0,32H168a8,8,0,0,1,0-16h16a8,8,0,0,1,0,16Z"></path></svg>
                              <span className="text-white">{facility.name}</span>
                            </span>
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center justify-center gap-1.5 pointer-events-none text-xs">
                          {facility.prefecture}
                        </div>
                      </header>

                      <div className="relative flex flex-col overflow-hidden bg-[#111111] group-hover:bg-[#1a1a1a] transition-colors flex-1 p-0">
                        <div className="grid h-full auto-rows-fr grid-cols-2">
                          <div className="flex min-h-22 flex-col gap-2 px-4 pt-4 pb-4 justify-center border-b border-r border-[#3d3d3d]">
                            <div className="flex items-center gap-1 text-xs font-medium text-[#999999]">デバイス数</div>
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="text-xl leading-none font-semibold text-white">{facility.devices.length}</span>
                            </div>
                          </div>
                          <div className="flex min-h-22 flex-col gap-2 px-4 pt-4 pb-4 justify-center border-b border-[#3d3d3d]">
                            <div className="flex items-center gap-1 text-xs font-medium text-[#999999]">オンライン</div>
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="text-xl leading-none font-semibold text-[#2db35e]">{online}</span>
                            </div>
                          </div>
                          <div className="flex min-h-22 flex-col gap-2 px-4 pt-4 pb-4 justify-center border-r border-[#3d3d3d]">
                            <div className="flex items-center gap-1 text-xs font-medium text-[#999999]">警告</div>
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="text-xl leading-none font-semibold text-[#f0ad4e]">{warning}</span>
                            </div>
                          </div>
                          <div className="flex min-h-22 flex-col gap-2 px-4 pt-4 pb-4 justify-center">
                            <div className="flex items-center gap-1 text-xs font-medium text-[#999999]">オフライン</div>
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="text-xl leading-none font-semibold text-[#fc574a]">{offline}</span>
                            </div>
                          </div>
                        </div>

                        {/* ステータスバッジのリスト */}
                        <div className="px-4 py-3 border-t border-[#3d3d3d] flex flex-wrap gap-1.5">
                          {facility.devices.map((d: Device) => (
                            <StatusBadge key={d.id} status={d.status} />
                          ))}
                        </div>
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}