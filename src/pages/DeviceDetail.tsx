import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { subscribeDevice } from '../lib/firestore';
import { StatusBadge } from '../components/StatusBadge';
import type { Device } from '../types';

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

// ── Main page ─────────────────────────────────────────────────────

export function DeviceDetail() {
  const { deviceId } = useParams<{ deviceId: string }>();

  const [device,       setDevice]       = useState<Device | null>(null);
  const [deviceLoading, setDeviceLoading] = useState(true);

  const [apps,       setApps]       = useState<AppInfo[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError,  setAppsError]  = useState<string | null>(null);

  const [screenshots, setScreenshots] = useState<Record<string, ScreenshotEntry>>({});

  const blobUrlsRef = useRef<string[]>([]);

  // Subscribe to Firestore device document
  useEffect(() => {
    if (!deviceId) return;
    return subscribeDevice(deviceId, d => {
      setDevice(d);
      setDeviceLoading(false);
    });
  }, [deviceId]);

  const baseUrl = device ? `http://${device.ip}:${device.port ?? 8090}` : null;

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

        {/* 外部アプリセクション */}
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
      </div>
    </div>
  );
}
