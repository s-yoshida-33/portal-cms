import { useState, useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { subscribeProjects, subscribeDevices } from '../lib/firestore';
import { StatusBadge } from '../components/StatusBadge';
import type { ProjectDoc, Device, DeviceStatus } from '../types';

function countByStatus(devices: Device[], status: DeviceStatus) {
  return devices.filter(d => d.status === status).length;
}

function StatCard({ label, value, color = 'text-white' }: {
  label: string; value: number | string; color?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg bg-[#111111] shadow-xs ring-1 ring-[#3d3d3d] w-full flex flex-col">
      <header className="flex items-center gap-2 bg-black border-b border-[#3d3d3d] h-14 px-4">
        <span className="truncate text-sm font-medium text-white">{label}</span>
      </header>
      <div className="p-4 flex flex-col justify-center min-h-22">
        <span className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</span>
      </div>
    </div>
  );
}

export function Home() {
  const { user } = useAuth();
  const { uuid } = useParams<{ uuid: string }>();

  const [projects, setProjects] = useState<ProjectDoc[]>([]);
  const [devices,  setDevices]  = useState<Device[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    let p = false, d = false;
    const done = () => { if (p && d) setLoading(false); };
    const u1 = subscribeProjects(ps => { setProjects(ps); p = true; done(); });
    const u2 = subscribeDevices(ds  => { setDevices(ds);  d = true; done(); });
    return () => { u1(); u2(); };
  }, []);

  const totalOnline  = countByStatus(devices, 'online');
  const totalOffline = countByStatus(devices, 'offline');
  const totalWarning = countByStatus(devices, 'warning');

  const devicesByProject = useMemo(() => {
    const map = new Map<string, Device[]>();
    for (const d of devices) {
      const list = map.get(d.facilityId) ?? [];
      list.push(d);
      map.set(d.facilityId, list);
    }
    return map;
  }, [devices]);

  return (
    <div className="flex flex-col min-h-full">
      <div className="py-3 border-b border-zinc-800">
        <div className="h-7" />
      </div>

      <div className="flex items-center gap-4 py-6 px-4 sm:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-white text-3xl font-semibold">ホーム</h1>
          <p className="text-[#999999] text-base">{user?.email ?? ''}</p>
        </div>
      </div>

      <div className="p-8">
        <div className="w-full space-y-8">

          {/* ステータスセクション */}
          <div>
            <h5 className="text-lg font-semibold text-white mb-4">ステータス</h5>
            <div className="grid gap-4 md:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="プロジェクト数"    value={loading ? '…' : projects.length} />
              <StatCard label="総デバイス数"       value={loading ? '…' : devices.length} />
              <StatCard label="オンライン"         value={loading ? '…' : totalOnline}  color="text-[#2db35e]" />
              <StatCard label="オフライン / 警告"  value={loading ? '…' : totalOffline + totalWarning} color="text-[#fc574a]" />
            </div>
          </div>

          {/* プロジェクト一覧セクション */}
          <div>
            <h5 className="text-lg font-semibold text-white mb-4">プロジェクト一覧</h5>

            {loading ? (
              <div className="rounded-lg bg-[#111111] ring-1 ring-[#3d3d3d] p-12 text-center">
                <p className="text-zinc-500 text-sm">読み込み中...</p>
              </div>
            ) : projects.length === 0 ? (
              <div className="rounded-lg bg-[#111111] ring-1 ring-[#3d3d3d] p-12 text-center">
                <p className="text-zinc-500 text-sm">プロジェクトが登録されていません。</p>
              </div>
            ) : (
              <div className="grid gap-4 md:gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {projects.map(project => {
                  const devs    = devicesByProject.get(project.id) ?? [];
                  const online  = countByStatus(devs, 'online');
                  const offline = countByStatus(devs, 'offline');
                  const warning = countByStatus(devs, 'warning');

                  return (
                    <div key={project.id} className="overflow-hidden rounded-lg bg-[#111111] shadow-xs ring-1 ring-[#3d3d3d] w-full h-full flex flex-col transition-colors hover:ring-[#4693ff]">
                      <Link to={`/${uuid}/projects/${project.id}`} className="flex-1 flex flex-col no-underline text-inherit group outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4693ff] cursor-pointer">

                        <header className="justify-between py-0 flex items-center gap-2 bg-black group-hover:bg-[#111111] transition-colors border-b border-[#3d3d3d] h-14 px-4 text-base font-medium text-[#999999]">
                          <div role="heading" aria-level={2} className="flex min-w-0 items-center gap-2">
                            <span className="truncate flex items-center gap-2">
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
                                <path d="M240,208H224V96a16,16,0,0,0-16-16H144V32a16,16,0,0,0-16-16H48A16,16,0,0,0,32,32V208H16a8,8,0,0,0,0,16H240a8,8,0,0,0,0-16ZM144,96h64V208H144ZM48,32h80V208H48Zm40,32H72a8,8,0,0,1,0-16H88a8,8,0,0,1,0,16Zm0,32H72a8,8,0,0,1,0-16H88a8,8,0,0,1,0,16Zm0,32H72a8,8,0,0,1,0-16H88a8,8,0,0,1,0,16Zm0,32H72a8,8,0,0,1,0-16H88a8,8,0,0,1,0,16Zm80-64H168a8,8,0,0,1,0-16h16a8,8,0,0,1,0,16Zm0,32H168a8,8,0,0,1,0-16h16a8,8,0,0,1,0,16Zm0,32H168a8,8,0,0,1,0-16h16a8,8,0,0,1,0,16Z"/>
                              </svg>
                              <span className="text-white">{project.name}</span>
                            </span>
                          </div>
                          <span className="shrink-0 text-xs">{project.prefecture}</span>
                        </header>

                        <div className="relative flex flex-col overflow-hidden bg-[#111111] group-hover:bg-[#1a1a1a] transition-colors flex-1">
                          <div className="grid h-full auto-rows-fr grid-cols-2">
                            <div className="flex min-h-22 flex-col gap-2 px-4 pt-4 pb-4 justify-center border-b border-r border-[#3d3d3d]">
                              <div className="text-xs font-medium text-[#999999]">デバイス数</div>
                              <span className="text-xl leading-none font-semibold text-white">{devs.length}</span>
                            </div>
                            <div className="flex min-h-22 flex-col gap-2 px-4 pt-4 pb-4 justify-center border-b border-[#3d3d3d]">
                              <div className="text-xs font-medium text-[#999999]">オンライン</div>
                              <span className="text-xl leading-none font-semibold text-[#2db35e]">{online}</span>
                            </div>
                            <div className="flex min-h-22 flex-col gap-2 px-4 pt-4 pb-4 justify-center border-r border-[#3d3d3d]">
                              <div className="text-xs font-medium text-[#999999]">警告</div>
                              <span className="text-xl leading-none font-semibold text-[#f0ad4e]">{warning}</span>
                            </div>
                            <div className="flex min-h-22 flex-col gap-2 px-4 pt-4 pb-4 justify-center">
                              <div className="text-xs font-medium text-[#999999]">オフライン</div>
                              <span className="text-xl leading-none font-semibold text-[#fc574a]">{offline}</span>
                            </div>
                          </div>

                          {devs.length > 0 && (
                            <div className="px-4 py-3 border-t border-[#3d3d3d] flex flex-wrap gap-1.5">
                              {devs.map(d => (
                                <StatusBadge key={d.id} status={d.status} />
                              ))}
                            </div>
                          )}
                        </div>
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
