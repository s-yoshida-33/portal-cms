import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { subscribeDevice, subscribeDeviceLogs, subscribeDevicesByProject, requestScreenshot as requestPortalScreenshot, cancelScreenshotRequest, subscribeScreenshotRequest, setDeviceApproval, type DeviceLog } from '../lib/firestore';
import { auth } from '../lib/firebase';
import { StatusBadge } from '../components/StatusBadge';
import type { Device } from '../types';

const WORKER_BASE_URL = 'https://portal-cms-api.tti-ninja.workers.dev';

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

type SsState = 'idle' | 'requesting' | 'ready' | 'error';

interface ScreenshotEntry {
  state:       SsState;
  blobUrl:     string | null;
  capturedAt:  string | null;
}

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

function UptimeClock({ uptimeSecs, lastSeen }: { uptimeSecs: number; lastSeen: string }) {
  const calc = () => Math.max(0, uptimeSecs + Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000));
  const [secs, setSecs] = useState(calc);
  useEffect(() => {
    setSecs(calc());
    const id = setInterval(() => setSecs(calc()), 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uptimeSecs, lastSeen]);
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
  const { deviceId, uuid, id: projectId } = useParams<{ deviceId: string; uuid: string; id: string }>();

  const [device,       setDevice]       = useState<Device | null>(null);
  const [deviceLoading, setDeviceLoading] = useState(true);

  const [apps,       setApps]       = useState<AppInfo[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError,  setAppsError]  = useState<string | null>(null);

  const [screenshots,    setScreenshots]    = useState<Record<string, ScreenshotEntry>>({});
  const [projectDevices, setProjectDevices] = useState<Device[]>([]);

  type PortalSsState = 'idle' | 'pending' | 'ready' | 'error';
  const [credPendingId,    setCredPendingId]    = useState('');
  const [credSendState,    setCredSendState]    = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  const [portalSsState,      setPortalSsState]      = useState<PortalSsState>('idle');
  const [portalSsBlobUrl,    setPortalSsBlobUrl]    = useState<string | null>(null);
  const [portalSsCapturedAt, setPortalSsCapturedAt] = useState<string | null>(null);
  const portalBlobRef = useRef<string | null>(null);

  const [logs,       setLogs]       = useState<DeviceLog[]>([]);
  const [logLevels,  setLogLevels]  = useState<Set<string>>(new Set(LOG_LEVELS));
  const [autoScroll, setAutoScroll] = useState(true);
  const logEndRef  = useRef<HTMLDivElement>(null);
  const blobUrlsRef = useRef<string[]>([]);

  // Subscribe to Firestore device document
  useEffect(() => {
    if (!deviceId) return;
    return subscribeDevice(deviceId, d => {
      setDevice(d);
      setDeviceLoading(false);
    });
  }, [deviceId]);

  // Subscribe to all devices in the same project (for Bridge-Ground app cross-referencing)
  useEffect(() => {
    if (!device || device.app !== 'Bridge-Ground' || !device.projectId) return;
    return subscribeDevicesByProject(device.projectId, setProjectDevices);
  }, [device?.app, device?.projectId]);

  // Subscribe to device logs
  useEffect(() => {
    if (!deviceId) return;
    return subscribeDeviceLogs(deviceId, setLogs);
  }, [deviceId]);

  // Auto-scroll log panel to bottom
  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const baseUrl = device?.app === 'Bridge-Ground' ? `http://${device.ip}:${device.port ?? 8090}` : null;

  // Map from app name → portal device ID (for linking from Bridge-Ground app cards)
  const appDeviceMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of projectDevices) {
      if (d.app !== 'Bridge-Ground') m.set(d.app, d.id);
    }
    return m;
  }, [projectDevices]);

  const filteredLogs = useMemo(
    () => logs.filter(l => logLevels.has(l.level || 'INFO')),
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

  // Fetch portal screenshot from Worker using Firebase ID token
  const fetchPortalScreenshot = useCallback(async () => {
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
      setPortalSsCapturedAt(new Date().toLocaleString('ja-JP'));
      setPortalSsState('ready');
    } catch {
      setPortalSsState('error');
    }
  }, [deviceId]);

  // Subscribe to screenshotRequests Firestore doc
  useEffect(() => {
    if (!deviceId || device?.app === 'Bridge-Ground') return;
    return subscribeScreenshotRequest(deviceId, data => {
      if (!data || data.status === 'cancelled') return;
      if (data.status === 'completed') {
        fetchPortalScreenshot();
      } else if (data.status === 'pending') {
        setPortalSsState('pending');
      }
    });
  }, [deviceId, device?.app, fetchPortalScreenshot]);

  async function handlePortalScreenshotRequest() {
    if (!deviceId) return;
    setPortalSsState('pending');
    setPortalSsBlobUrl(null);
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

  // Fetch screenshot blob and store as object URL
  const fetchScreenshot = useCallback(async (appId: string) => {
    if (!baseUrl) return;
    try {
      const res = await fetch(`${baseUrl}/api/apps/${appId}/screenshot`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error('fetch failed');
      const url = URL.createObjectURL(await res.blob());
      blobUrlsRef.current.push(url);
      setScreenshots(prev => ({
        ...prev,
        [appId]: { state: 'ready', blobUrl: url, capturedAt: new Date().toLocaleString('ja-JP') },
      }));
    } catch {
      setScreenshots(prev => ({
        ...prev,
        [appId]: { state: 'error', blobUrl: null, capturedAt: null },
      }));
    }
  }, [baseUrl]);

  // SSE for screenshot_ready events
  useEffect(() => {
    if (!baseUrl) return;
    const es = new EventSource(`${baseUrl}/api/events`);
    es.addEventListener('screenshot_ready', (e: MessageEvent) => {
      const { appId } = JSON.parse(e.data) as { appId: string };
      fetchScreenshot(appId);
    });
    return () => es.close();
  }, [baseUrl, fetchScreenshot]);

  // Revoke object URLs on unmount
  useEffect(() => {
    const urls = blobUrlsRef.current;
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }, []);

  async function requestScreenshot(appId: string) {
    if (!baseUrl) return;
    setScreenshots(prev => ({ ...prev, [appId]: { state: 'requesting', blobUrl: null, capturedAt: null } }));
    try {
      const res = await fetch(`${baseUrl}/api/apps/${appId}/screenshot/request`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error('request failed');
    } catch {
      setScreenshots(prev => ({ ...prev, [appId]: { state: 'error', blobUrl: null, capturedAt: null } }));
    }
  }

  function downloadScreenshot(appId: string, appName: string) {
    const ss = screenshots[appId];
    if (!ss?.blobUrl) return;
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href     = ss.blobUrl;
    a.download = `screenshot-${appName}-${ts}.jpg`;
    a.click();
  }

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
              <p className="text-lg font-semibold text-zinc-200"><UptimeClock uptimeSecs={device.system.uptime} lastSeen={device.lastSeen} /></p>
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
                  const ss = screenshots[app.id];
                  return (
                    <div key={app.id} className="bg-[#111111] ring-1 ring-[#3d3d3d] rounded-xl p-5">

                      {/* アプリヘッダー */}
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
                          {appDeviceMap.has(app.name) && (
                            <Link
                              to={`/${uuid}/projects/${projectId}/devices/${appDeviceMap.get(app.name)}`}
                              className="h-7 px-3 rounded-md text-xs text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] transition-colors flex items-center"
                            >
                              デバイスページ
                            </Link>
                          )}
                          <button
                            onClick={() => requestScreenshot(app.id)}
                            disabled={!app.online || ss?.state === 'requesting'}
                            className="h-7 px-3 rounded-md text-xs text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {ss?.state === 'requesting' ? '取得中...' : 'スクリーンショットを取得'}
                          </button>
                        </div>
                      </div>

                      {/* スクリーンショット表示エリア */}
                      {ss && ss.state !== 'idle' && (
                        <div className="mt-4 border-t border-zinc-800 pt-4">
                          {ss.state === 'requesting' && (
                            <div className="flex items-center justify-center h-28 rounded-lg bg-[#0a0a0a] ring-1 ring-[#3d3d3d]">
                              <p className="text-zinc-500 text-sm">スクリーンショットを取得中...</p>
                            </div>
                          )}
                          {ss.state === 'error' && (
                            <div className="flex items-center justify-center h-16 rounded-lg bg-[#0a0a0a] ring-1 ring-red-900/30">
                              <p className="text-red-400 text-sm">取得に失敗しました。</p>
                            </div>
                          )}
                          {ss.state === 'ready' && ss.blobUrl && (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-zinc-500">取得時刻: {ss.capturedAt}</p>
                                <button
                                  onClick={() => downloadScreenshot(app.id, app.name)}
                                  className="h-7 px-3 rounded-md text-xs text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] transition-colors cursor-pointer"
                                >
                                  ダウンロード
                                </button>
                              </div>
                              <img
                                src={ss.blobUrl}
                                alt={`${app.name} のスクリーンショット`}
                                className="w-full rounded-lg ring-1 ring-[#3d3d3d] object-contain max-h-[600px]"
                              />
                            </div>
                          )}
                        </div>
                      )}
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
              {portalSsState === 'idle' && (
                <div className="flex items-center justify-center h-28 text-zinc-600 text-sm">
                  ボタンを押してスクリーンショットを要求してください。
                </div>
              )}
              {portalSsState === 'pending' && (
                <div className="flex flex-col items-center justify-center h-28 gap-3">
                  <p className="text-zinc-500 text-sm">Bridge-Ground からの応答を待っています...</p>
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
              {portalSsState === 'error' && (
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
              {portalSsState === 'ready' && portalSsBlobUrl && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-zinc-500">取得時刻: {portalSsCapturedAt}</p>
                    <button
                      onClick={() => {
                        if (!portalSsBlobUrl) return;
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
                  <img
                    src={portalSsBlobUrl}
                    alt={`${device.name} のスクリーンショット`}
                    className="w-full rounded-lg ring-1 ring-[#3d3d3d] object-contain max-h-[600px]"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bridge-Ground 連携セクション（Bridge-Ground 以外のデバイス） */}
        {device.app !== 'Bridge-Ground' && (
          <div>
            <h2 className="text-white font-semibold text-base mb-3">Bridge-Ground 連携</h2>
            <div className="bg-[#111111] ring-1 ring-[#3d3d3d] rounded-xl p-5 space-y-4">
              {device.pendingDeviceId ? (
                <p className="text-xs text-zinc-500">
                  PendingID: <code className="mx-1 px-1 py-0.5 bg-zinc-800 rounded text-zinc-300">{device.pendingDeviceId}</code>
                  — 承認済み。Bridge-Ground は自動的に接続されます。
                </p>
              ) : (
                <>
                  <p className="text-xs text-zinc-500">
                    デバイスを承認済みの場合、Bridge-Ground の config.json 内の
                    <code className="mx-1 px-1 py-0.5 bg-zinc-800 rounded text-zinc-300">pendingId</code>
                    を入力して手動でリンクできます。
                  </p>
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="block text-xs text-zinc-500 mb-1">PendingID（Bridge-Ground config.json より）</label>
                      <input
                        type="text"
                        value={credPendingId}
                        onChange={e => setCredPendingId(e.target.value)}
                        placeholder="例: abc123def456..."
                        className="w-full h-8 px-3 rounded-md text-xs text-zinc-200 bg-[#0a0a0a] ring-1 ring-[#3d3d3d] focus:outline-none focus:ring-zinc-500 font-mono"
                      />
                    </div>
                    <button
                      onClick={async () => {
                        if (!credPendingId.trim()) return;
                        setCredSendState('sending');
                        try {
                          await setDeviceApproval(credPendingId.trim(), device.id);
                          setCredSendState('done');
                        } catch {
                          setCredSendState('error');
                        }
                      }}
                      disabled={!credPendingId.trim() || credSendState === 'sending'}
                      className="h-8 px-3 rounded-md text-xs text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                      {credSendState === 'sending' ? '送信中...'
                        : credSendState === 'done'    ? '設定済み ✓'
                        : credSendState === 'error'   ? 'エラー'
                        : 'リンクする'}
                    </button>
                  </div>
                </>
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
            </div>
          </div>

          <div className="bg-[#0a0a0a] ring-1 ring-[#3d3d3d] rounded-xl overflow-hidden">
            <div className="h-96 overflow-y-auto p-4 font-mono text-xs leading-5 space-y-0.5">
              {filteredLogs.length === 0 ? (
                <p className="text-zinc-600 text-center py-8">
                  {logs.length === 0 ? 'ログがありません。Bridge-Ground からの送信をお待ちください。' : '表示対象のログがありません。'}
                </p>
              ) : (
                filteredLogs.map(log => (
                  <div key={log.id} className="flex gap-2 min-w-0">
                    <span className="shrink-0 text-zinc-600">{log.timestamp || log.sentAt.slice(0, 23)}</span>
                    <span className={`shrink-0 w-10 ${logLevelClass(log.level)}`}>{log.level || '----'}</span>
                    {log.tag && <span className="shrink-0 text-zinc-500">[{log.tag}]</span>}
                    <span className="text-zinc-300 break-all">{log.message}</span>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
            <div className="flex items-center justify-between px-4 py-2 bg-black border-t border-[#3d3d3d] text-xs text-zinc-600">
              <span>{filteredLogs.length} 件表示（最大 500 件）</span>
              <span>最終更新: {logs.length > 0 ? new Date(logs[logs.length - 1].sentAt).toLocaleString('ja-JP') : '—'}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
