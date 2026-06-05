import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { subscribeDevice, subscribeDevicesByProject, requestScreenshot as requestPortalScreenshot, cancelScreenshotRequest, subscribeScreenshotRequest, requestLogs } from '../lib/firestore';
import { auth, rtdb } from '../lib/firebase';
import { ref as rtdbRef, onValue } from 'firebase/database';
import { StatusBadge } from '../components/StatusBadge';
import type { Device } from '../types';

const WORKER_BASE_URL = 'https://portal-cms-api.tti-ninja.workers.dev';

interface RtdbLogEntry {
  timestamp: string;
  level:     string;
  tag:       string;
  message:   string;
}

// ── Bridge-Ground API types ───────────────────────────────────────

interface AppInfo {
  id:           string;
  name:         string;
  version:      string;
  hostname:     string;
  ip:           string;
  online:       boolean;
  registeredAt: string;
  lastSeen:     string;
  startedAt?:   string;
}

type PortalSsState = 'idle' | 'pending' | 'ready' | 'error';

// ── Helpers ───────────────────────────────────────────────────────

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

function UptimeClock({ uptimeSecs, lastSeen, status }: { uptimeSecs: number; lastSeen: string; status: string }) {
  const calc = () => Math.max(0, uptimeSecs + Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000));
  const [secs, setSecs] = useState(calc);
  useEffect(() => {
    if (status !== 'online') { setSecs(uptimeSecs); return; }
    setSecs(calc());
    const id = setInterval(() => setSecs(calc()), 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uptimeSecs, lastSeen, status]);
  if (secs <= 0) return <span className="font-mono">--:--:--</span>;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return (
    <span className="font-mono">
      {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  );
}

function formatLastSeen(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ── Log helpers ──────────────────────────────────────────────────

const LOG_LEVELS = ['INFO', 'WARN', 'ERROR', 'FATAL'] as const;

function logLevelClass(level: string) {
  switch (level) {
    case 'ERROR':
    case 'FATAL': return 'text-red-400';
    case 'WARN':  return 'text-yellow-400';
    case 'INFO':  return 'text-sky-400';
    default:      return 'text-zinc-500';
  }
}

function logLevelBadgeClass(level: string, active: boolean) {
  if (!active) return 'text-zinc-600 bg-zinc-800 ring-zinc-700';
  switch (level) {
    case 'ERROR':
    case 'FATAL': return 'text-red-400 bg-red-950/40 ring-red-800/50';
    case 'WARN':  return 'text-yellow-400 bg-yellow-950/40 ring-yellow-800/50';
    default:      return 'text-sky-400 bg-sky-950/40 ring-sky-800/50';
  }
}

// ── Main page ─────────────────────────────────────────────────────

export function DeviceDetail() {
  const { deviceId, id: projectId, uuid } = useParams<{ deviceId: string; uuid: string; id: string }>();

  const [device,        setDevice]        = useState<Device | null>(null);
  const [deviceLoading, setDeviceLoading] = useState(true);
  const [projectDevices, setProjectDevices] = useState<Device[]>([]);

  const [apps,        setApps]        = useState<AppInfo[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError,   setAppsError]   = useState<string | null>(null);


  const [portalSsState,      setPortalSsState]      = useState<PortalSsState>('idle');
  const [portalSsBlobUrl,    setPortalSsBlobUrl]    = useState<string | null>(null);
  const [portalSsCapturedAt, setPortalSsCapturedAt] = useState<string | null>(null);
  const portalBlobRef = useRef<string | null>(null);

  const [logs,            setLogs]            = useState<RtdbLogEntry[]>([]);
  const [logsLastFetched, setLogsLastFetched] = useState<Date | null>(null);
  const [logsRefreshing,  setLogsRefreshing]  = useState(false);
  const [logLevels,       setLogLevels]       = useState<Set<string>>(new Set(LOG_LEVELS));
  const [autoScroll,      setAutoScroll]      = useState(true);
  const logContainerRef  = useRef<HTMLDivElement>(null);
  const logRequestedAt   = useRef<number>(0);

  // Subscribe to Firestore device document
  useEffect(() => {
    if (!deviceId) return;
    return subscribeDevice(deviceId, d => {
      setDevice(d);
      setDeviceLoading(false);
    });
  }, [deviceId]);

  // Subscribe to all devices in the project so we can link to app device pages
  useEffect(() => {
    if (!projectId) return;
    return subscribeDevicesByProject(projectId, setProjectDevices);
  }, [projectId]);

  // Subscribe to RTDB logs/{deviceId} — updated by Bridge-Ground on demand.
  useEffect(() => {
    if (!deviceId) return;
    const logRef = rtdbRef(rtdb, `logs/${deviceId}`);
    return onValue(logRef, snap => {
      const data = snap.val() as { entries?: RtdbLogEntry[]; at?: number } | null;
      if (!data) return;
      setLogs(Array.isArray(data.entries) ? data.entries : []);
      const fetchedAt = data.at ? new Date(data.at) : new Date();
      setLogsLastFetched(fetchedAt);
      if (data.at && data.at >= logRequestedAt.current) {
        setLogsRefreshing(false);
      }
    });
  }, [deviceId]);

  // Timeout fallback: clear loading state after 30s in case BG is unreachable.
  useEffect(() => {
    if (!logsRefreshing) return;
    const id = window.setTimeout(() => setLogsRefreshing(false), 30_000);
    return () => window.clearTimeout(id);
  }, [logsRefreshing]);

  const handleRefreshLogs = useCallback(async () => {
    if (!deviceId || logsRefreshing) return;
    setLogsRefreshing(true);
    logRequestedAt.current = Date.now();
    try {
      await requestLogs(deviceId);
    } catch {
      setLogsRefreshing(false);
    }
  }, [deviceId, logsRefreshing]);

  // Auto-scroll log container only (page itself does not scroll)
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const baseUrl = device?.app === 'Bridge-Ground' ? `http://${device.ip}:${device.port ?? 8090}` : null;

  const filteredLogs = useMemo(
    () => logs.filter(l => logLevels.has(l.level || 'INFO')).map((l, i) => ({ ...l, _key: i })),
    [logs, logLevels]
  );

  function toggleLevel(level: string) {
    setLogLevels(prev => {
      const next = new Set(prev);
      if (next.has(level)) { next.delete(level); } else { next.add(level); }
      return next;
    });
  }

  // Fetch app list from Bridge-Ground
  const fetchApps = useCallback(async () => {
    if (!baseUrl) return;
    setAppsLoading(true);
    setAppsError(null);
    try {
      const res = await fetch(`${baseUrl}/api/apps`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setApps(await res.json() as AppInfo[]);
    } catch {
      setAppsError('Bridge-Ground に接続できませんでした。デバイスがオンラインか確認してください。');
      setApps([]);
    } finally {
      setAppsLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    if (baseUrl) fetchApps();
  }, [baseUrl, fetchApps]);

  // Fetch portal screenshot from Worker using Firebase ID token.
  // completedAt is the Firestore Timestamp from the screenshotRequests doc.
  const fetchPortalScreenshot = useCallback(async (completedAt?: { toDate(): Date } | null) => {
    if (!deviceId) return;
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) { setPortalSsState('error'); return; }
      const res = await fetch(`${WORKER_BASE_URL}/v1/screenshot/${deviceId}`, {
        headers: { Authorization: `Bearer ${idToken}` },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('fetch failed');
      if (portalBlobRef.current) URL.revokeObjectURL(portalBlobRef.current);
      const url = URL.createObjectURL(await res.blob());
      portalBlobRef.current = url;
      setPortalSsBlobUrl(url);
      const capturedDate = completedAt?.toDate() ?? null;
      setPortalSsCapturedAt(capturedDate ? capturedDate.toLocaleString('ja-JP') : null);
      setPortalSsState('ready');
    } catch {
      setPortalSsState('error');
    }
  }, [deviceId]);

  // Subscribe to screenshotRequests Firestore doc.
  // On initial snapshot we silently restore a previous screenshot without updating state;
  // pending/completed transitions after that drive the UI normally.
  useEffect(() => {
    if (!deviceId || device?.app === 'Bridge-Ground') return;
    let isFirst = true;
    return subscribeScreenshotRequest(deviceId, data => {
      if (!data || data.status === 'cancelled') { isFirst = false; return; }
      if (data.status === 'completed') {
        fetchPortalScreenshot(data.completedAt);
      } else if (data.status === 'pending' && !isFirst) {
        setPortalSsState('pending');
      }
      isFirst = false;
    });
  }, [deviceId, device?.app, fetchPortalScreenshot]);

  async function handlePortalScreenshotRequest() {
    if (!deviceId) return;
    setPortalSsState('pending');
    // Keep the existing blob URL so the previous screenshot stays visible while fetching.
    try {
      await requestPortalScreenshot(deviceId);
    } catch {
      setPortalSsState('error');
    }
  }

  // 3-minute timeout: if still pending, show error so the user can retry
  useEffect(() => {
    if (portalSsState !== 'pending') return;
    const id = window.setTimeout(() => setPortalSsState('error'), 3 * 60 * 1000);
    return () => window.clearTimeout(id);
  }, [portalSsState]);

  // Revoke portal blob URL on unmount
  useEffect(() => {
    return () => { if (portalBlobRef.current) URL.revokeObjectURL(portalBlobRef.current); };
  }, []);

  // ── Loading / not found ────────────────────────────────────────

  if (deviceLoading) {
    return (
      <div className="flex flex-col min-h-full">
        <div className="flex items-center justify-center flex-1">
          <p className="text-zinc-500 text-sm">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="flex flex-col min-h-full">
        <div className="p-8">
          <p className="text-zinc-400 mb-2">デバイスが見つかりません。</p>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-full">

      {/* ページヘッダー */}
      <div className="flex items-start justify-between gap-4 py-6 px-4 sm:px-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-white text-3xl font-semibold">{device.name}</h1>
          <p className="text-[#999999] text-base font-mono">{device.ip}</p>
        </div>
        <div className="mt-7">
          <StatusBadge status={device.status} />
        </div>
      </div>

      <div className="px-4 sm:px-6 pt-8 pb-8 space-y-6">

        {/* システム情報カード */}
        <div className="bg-[#111111] ring-1 ring-[#3d3d3d] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-medium text-sm">システム情報</h2>
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
              <p className="text-lg font-semibold text-zinc-200">
                <UptimeClock uptimeSecs={device.system.uptime} lastSeen={device.lastSeen} status={device.status} />
              </p>
            </div>
          </div>
        </div>

        {/* 外部アプリセクション（Bridge-Ground のみ表示） */}
        {device.app === 'Bridge-Ground' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-semibold text-base">外部アプリ</h2>
              <button
                onClick={fetchApps}
                disabled={appsLoading}
                className="h-7 px-3 rounded-md text-xs text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] transition-colors cursor-pointer disabled:opacity-50"
              >
                {appsLoading ? '更新中...' : '更新'}
              </button>
            </div>

            {appsLoading ? (
              <div className="bg-[#111111] ring-1 ring-[#3d3d3d] rounded-xl p-8 text-center">
                <p className="text-zinc-500 text-sm">読み込み中...</p>
              </div>
            ) : appsError ? (
              <div className="bg-[#111111] ring-1 ring-[#3d3d3d] rounded-xl p-8 text-center">
                <p className="text-zinc-500 text-sm">{appsError}</p>
              </div>
            ) : apps.length === 0 ? (
              <div className="bg-[#111111] ring-1 ring-[#3d3d3d] rounded-xl p-8 text-center">
                <p className="text-zinc-500 text-sm">登録されている外部アプリはありません。</p>
              </div>
            ) : (
              <div className="space-y-3">
                {apps.map(app => {
                  const appDevice = projectDevices.find(
                    d => d.app === app.name && (d.hostname === app.hostname || d.hostname == null)
                      && d.id !== deviceId
                  );
                  return (
                  <div key={app.id} className="bg-[#111111] ring-1 ring-[#3d3d3d] rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="font-medium text-zinc-100 text-sm">{app.name}</p>
                          <p className="text-xs text-zinc-500 font-mono mt-0.5">{app.hostname}</p>
                        </div>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                          app.online
                            ? 'bg-green-500/10 text-green-400'
                            : 'bg-zinc-700/50 text-zinc-400'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${app.online ? 'bg-green-400' : 'bg-zinc-500'}`} />
                          {app.online ? 'オンライン' : 'オフライン'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-500">v{app.version}</span>
                        {appDevice && (
                          <Link
                            to={`/${uuid}/projects/${projectId}/devices/${appDevice.id}`}
                            className="h-6 px-2.5 rounded-md text-xs text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] transition-colors inline-flex items-center"
                          >
                            詳細
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* スクリーンショットセクション（Bridge-Ground 以外） */}
        {device.app !== 'Bridge-Ground' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-semibold text-base">スクリーンショット</h2>
              <button
                onClick={handlePortalScreenshotRequest}
                disabled={portalSsState === 'pending'}
                className="h-7 px-3 rounded-md text-xs text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {portalSsState === 'pending' ? '取得中...' : 'スクリーンショットを取得'}
              </button>
            </div>

            <div className="bg-[#111111] ring-1 ring-[#3d3d3d] rounded-xl p-5">
              {/* 画像なし・idle */}
              {!portalSsBlobUrl && portalSsState === 'idle' && (
                <div className="flex items-center justify-center h-28 text-zinc-600 text-sm">
                  ボタンを押してスクリーンショットを要求してください。
                </div>
              )}
              {/* 画像なし・pending */}
              {!portalSsBlobUrl && portalSsState === 'pending' && (
                <div className="flex flex-col items-center justify-center h-28 gap-3">
                  <p className="text-zinc-500 text-sm">取得中...</p>
                  <button
                    onClick={() => {
                      setPortalSsState('idle');
                      if (deviceId) cancelScreenshotRequest(deviceId).catch(() => {});
                    }}
                    className="h-6 px-3 rounded-md text-xs text-zinc-500 bg-zinc-800 hover:bg-zinc-700 ring-1 ring-zinc-700 transition-colors cursor-pointer"
                  >
                    キャンセル
                  </button>
                </div>
              )}
              {/* 画像なし・error */}
              {!portalSsBlobUrl && portalSsState === 'error' && (
                <div className="flex flex-col items-center justify-center h-20 gap-2 rounded-lg bg-[#0a0a0a] ring-1 ring-red-900/30">
                  <p className="text-red-400 text-sm">取得に失敗しました（タイムアウトまたはエラー）。</p>
                  <button
                    onClick={handlePortalScreenshotRequest}
                    className="h-6 px-3 rounded-md text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 ring-1 ring-zinc-700 transition-colors cursor-pointer"
                  >
                    再試行
                  </button>
                </div>
              )}
              {/* 画像あり（ready / pending / error すべてで表示） */}
              {portalSsBlobUrl && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-zinc-500">
                      {portalSsCapturedAt ? `最終取得時刻: ${portalSsCapturedAt}` : '最終取得時刻: —'}
                    </p>
                    <div className="flex items-center gap-2">
                      {portalSsState === 'error' && (
                        <button
                          onClick={handlePortalScreenshotRequest}
                          className="h-7 px-3 rounded-md text-xs text-red-400 bg-red-950/30 hover:bg-red-950/50 ring-1 ring-red-900/50 transition-colors cursor-pointer"
                        >
                          再試行
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const a = document.createElement('a');
                          const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                          a.href = portalSsBlobUrl;
                          a.download = `screenshot-${device.name}-${ts}.jpg`;
                          a.click();
                        }}
                        className="h-7 px-3 rounded-md text-xs text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] transition-colors cursor-pointer"
                      >
                        ダウンロード
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <img
                      src={portalSsBlobUrl}
                      alt={`${device.name} のスクリーンショット`}
                      className="w-full rounded-lg ring-1 ring-[#3d3d3d] object-contain max-h-[600px]"
                    />
                    {/* 取得中オーバーレイ */}
                    {portalSsState === 'pending' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-black/60">
                        <p className="text-zinc-300 text-sm">取得中...</p>
                        <button
                          onClick={() => {
                            setPortalSsState('ready');
                            if (deviceId) cancelScreenshotRequest(deviceId).catch(() => {});
                          }}
                          className="h-6 px-3 rounded-md text-xs text-zinc-400 bg-zinc-800 hover:bg-zinc-700 ring-1 ring-zinc-700 transition-colors cursor-pointer"
                        >
                          キャンセル
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ログセクション */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold text-base">ログ</h2>
            <div className="flex items-center gap-2">
              {LOG_LEVELS.map(level => (
                <button
                  key={level}
                  onClick={() => toggleLevel(level)}
                  className={`h-6 px-2.5 rounded-md text-xs font-medium ring-1 transition-colors cursor-pointer ${logLevelBadgeClass(level, logLevels.has(level))}`}
                >
                  {level}
                </button>
              ))}
              <div className="w-px h-4 bg-zinc-700 mx-1" />
              <button
                onClick={() => setAutoScroll(v => !v)}
                className={`h-6 px-2.5 rounded-md text-xs font-medium ring-1 transition-colors cursor-pointer ${
                  autoScroll
                    ? 'text-zinc-300 bg-zinc-700/50 ring-zinc-600'
                    : 'text-zinc-600 bg-zinc-800 ring-zinc-700'
                }`}
              >
                自動スクロール
              </button>
              <div className="w-px h-4 bg-zinc-700 mx-1" />
              <button
                onClick={handleRefreshLogs}
                disabled={logsRefreshing}
                className="h-6 px-2.5 rounded-md text-xs font-medium ring-1 transition-colors cursor-pointer text-zinc-400 bg-zinc-800 ring-zinc-700 hover:bg-zinc-700 disabled:opacity-50"
              >
                {logsRefreshing ? '更新中...' : '更新'}
              </button>
            </div>
          </div>

          <div className="bg-[#0a0a0a] ring-1 ring-[#3d3d3d] rounded-xl overflow-hidden">
            <div ref={logContainerRef} className="h-96 overflow-y-auto p-4 font-mono text-xs leading-5 space-y-0.5">
              {filteredLogs.length === 0 ? (
                <p className="text-zinc-600 text-center py-8">
                  {logs.length === 0 ? 'ログがありません。「更新」ボタンを押してログを取得してください。' : '表示対象のログがありません。'}
                </p>
              ) : (
                filteredLogs.map(log => (
                  <div key={log._key} className="flex gap-2 min-w-0">
                    <span className="shrink-0 text-zinc-600">{log.timestamp}</span>
                    <span className={`shrink-0 w-10 ${logLevelClass(log.level)}`}>{log.level || '----'}</span>
                    {log.tag && <span className="shrink-0 text-zinc-500">[{log.tag}]</span>}
                    <span className="text-zinc-300 break-all">{log.message}</span>
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center justify-between px-4 py-2 bg-black border-t border-[#3d3d3d] text-xs text-zinc-600">
              <span>{filteredLogs.length} 件表示（最大 200 件）</span>
              <span>最終取得: {logsLastFetched ? logsLastFetched.toLocaleString('ja-JP') : '—'}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
