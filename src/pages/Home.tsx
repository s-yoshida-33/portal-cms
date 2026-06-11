import { useState, useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { fetchProjects, fetchDevices } from '../lib/firestore';
import type { ProjectDoc, Device, DeviceStatus } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';

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

function SplitStatCard({ leftLabel, leftValue, leftColor, rightLabel, rightValue, rightColor }: {
  leftLabel: string; leftValue: number | string; leftColor?: string;
  rightLabel: string; rightValue: number | string; rightColor?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg bg-[#111111] shadow-xs ring-1 ring-[#3d3d3d] w-full flex flex-col">
      <header className="flex items-center gap-2 bg-black border-b border-[#3d3d3d] h-14 px-4">
        <span className="truncate text-sm font-medium text-white">接続状況</span>
      </header>
      <div className="flex flex-1">
        <div className="flex-1 px-4 py-4 flex flex-col justify-center min-h-22 border-r border-[#3d3d3d]">
          <div className="text-xs font-medium text-[#999999] mb-1">{leftLabel}</div>
          <span className={`text-2xl font-semibold tabular-nums ${leftColor ?? 'text-white'}`}>{leftValue}</span>
        </div>
        <div className="flex-1 px-4 py-4 flex flex-col justify-center min-h-22">
          <div className="text-xs font-medium text-[#999999] mb-1">{rightLabel}</div>
          <span className={`text-2xl font-semibold tabular-nums ${rightColor ?? 'text-white'}`}>{rightValue}</span>
        </div>
      </div>
    </div>
  );
}

export function Home() {
  usePageTitle('ホーム');
  const { user } = useAuth();
  const { uuid } = useParams<{ uuid: string }>();

  const [projects, setProjects] = useState<ProjectDoc[]>([]);
  const [devices,  setDevices]  = useState<Device[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const [ps, ds] = await Promise.all([fetchProjects(), fetchDevices()]);
      if (cancelled) return;
      setProjects(ps);
      setDevices(ds);
      setLoading(false);
    }
    poll();
    const id = setInterval(poll, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Bridge-Ground の数 = 物理デバイス数（各端末に必ず1つ存在）
  const physicalDevices = useMemo(() => devices.filter(d => d.app === 'Bridge-Ground'), [devices]);

  // 接続状況は全アプリを対象にカウント
  const totalOnline  = countByStatus(devices, 'online');
  const totalOffline = countByStatus(devices, 'offline');
  const totalWarning = countByStatus(devices, 'warning');

  // デバイス数カウント用（Bridge-Groundのみ = 物理台数）
  const devicesByProject = useMemo(() => {
    const map = new Map<string, Device[]>();
    for (const d of devices) {
      if (d.app !== 'Bridge-Ground') continue;
      const list = map.get(d.projectId) ?? [];
      list.push(d);
      map.set(d.projectId, list);
    }
    return map;
  }, [devices]);

  // 接続状況カウント用（全アプリ対象）
  const allDevicesByProject = useMemo(() => {
    const map = new Map<string, Device[]>();
    for (const d of devices) {
      const list = map.get(d.projectId) ?? [];
      list.push(d);
      map.set(d.projectId, list);
    }
    return map;
  }, [devices]);

  return (
    <div className="flex flex-col min-h-full">

      <div className="flex items-start gap-4 py-6 px-4 sm:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-white text-3xl font-semibold leading-tight">ホーム</h1>
          <p className="text-[#999999] text-base">{user?.email ?? ''}</p>
        </div>
      </div>

      <div className="p-8">
        <div className="w-full space-y-8">

          {/* ステータスセクション */}
          <div>
            <h5 className="text-lg font-semibold text-white mb-4">ステータス</h5>
            <div className="grid gap-4 md:gap-5 grid-cols-1 md:grid-cols-3">
              <StatCard label="プロジェクト数" value={loading ? '…' : projects.length} />
              <StatCard label="総デバイス数"   value={loading ? '…' : physicalDevices.length} />
              <SplitStatCard
                leftLabel="オンライン"        leftValue={loading ? '…' : totalOnline}               leftColor="text-[#2db35e]"
                rightLabel="オフライン / 警告" rightValue={loading ? '…' : totalOffline + totalWarning} rightColor="text-[#fc574a]"
              />
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
              <div className="grid gap-4 md:gap-5 grid-cols-1 md:grid-cols-3">
                {projects.map(project => {
                  const devs    = devicesByProject.get(project.id) ?? [];
                  const allDevs = allDevicesByProject.get(project.id) ?? [];
                  const online  = countByStatus(allDevs, 'online');
                  const offline = countByStatus(allDevs, 'offline');
                  const warning = countByStatus(allDevs, 'warning');

                  return (
                    <Link key={project.id} to={`/${uuid}/projects/${project.id}`} className="overflow-hidden rounded-lg bg-[#111111] shadow-xs ring-1 ring-[#3d3d3d] w-full h-full flex flex-col transition-colors hover:ring-[#4693ff] no-underline text-inherit group outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4693ff] cursor-pointer">

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

                        </div>
                    </Link>
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
