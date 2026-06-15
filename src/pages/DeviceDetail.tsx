import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { subscribeDevice, subscribeProject, requestScreenshot as requestPortalScreenshot, cancelScreenshotRequest, subscribeScreenshotRequest, requestLogs, addSiteLog } from '../lib/firestore';
import { auth, rtdb } from '../lib/firebase';
import { ref as rtdbRef, onValue } from 'firebase/database';
import { useAuth } from '../contexts/AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import type { Device } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';
import { useFormatDate } from '../hooks/useFormatDate';
import { DateRangePicker } from '../components/DateRangePicker';

const WORKERS_BASE_URL = 'https://portal-cms-api.tti-ninja.workers.dev';

interface RtdbLogEntry {
  timestamp: string;
  level:     string;
  tag:       string;
  message:   string;
}

type PortalSsState = 'idle' | 'pending' | 'ready' | 'error';

// ── Helpers ───────────────────────────────────────────────────────

function MetricBar({ label, value, unit, warn = 70, danger = 90 }: {
  label: string; value: number; unit: string; warn?: number; danger?: number;
}) {
  const color = value === 0 ? 'bg-[var(--bg-subtle)]'
    : value >= danger ? 'bg-red-500'
    : value >= warn   ? 'bg-yellow-400'
    : 'bg-green-500';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-[var(--text-faint)]">{label}</span>
        <span className="text-[var(--text-muted)] font-medium tabular-nums">{value}{unit}</span>
      </div>
      <div className="h-1 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
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

// ── Log helpers ──────────────────────────────────────────────────

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const LOG_LEVELS = ['INFO', 'WARN', 'ERROR', 'FATAL'] as const;

function logLevelClass(level: string) {
  switch (level) {
    case 'ERROR':
    case 'FATAL': return 'text-red-400';
    case 'WARN':  return 'text-yellow-400';
    case 'INFO':  return 'text-green-400';
    default:      return 'text-[var(--text-faint)]';
  }
}

function logLevelBadgeClass(level: string, active: boolean) {
  if (!active) return 'text-[var(--text-faint)] bg-[var(--bg-subtle)] ring-[var(--border)]';
  switch (level) {
    case 'ERROR':
    case 'FATAL': return 'text-red-400 bg-red-950/40 ring-red-800/50';
    case 'WARN':  return 'text-yellow-400 bg-yellow-950/40 ring-yellow-800/50';
    case 'INFO':  return 'text-green-400 bg-green-950/40 ring-green-800/50';
    default:      return 'text-[var(--text-dim)] bg-[var(--bg-subtle)]/40 ring-[var(--border)]/50';
  }
}

// ── Main page ─────────────────────────────────────────────────────

export function DeviceDetail() {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  const { deviceId } = useParams<{ deviceId: string }>();
  const { user }     = useAuth();

  const [device,        setDevice]        = useState<Device | null>(null);
  usePageTitle(device?.name ?? t('deviceDetail.defaultTitle'));
  const [deviceLoading, setDeviceLoading] = useState(true);
  const projectNameRef = useRef('');

  const [portalSsState,      setPortalSsState]      = useState<PortalSsState>('idle');
  const [portalSsBlobUrl,    setPortalSsBlobUrl]    = useState<string | null>(null);
  const [portalSsCapturedAt, setPortalSsCapturedAt] = useState<string | null>(null);
  const portalBlobRef = useRef<string | null>(null);

  const todayStr   = localDateStr(new Date());
  const minLogDate = localDateStr(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  const [logs,             setLogs]             = useState<RtdbLogEntry[]>([]);
  const [logsLastFetched,  setLogsLastFetched]  = useState<Date | null>(null);
  const [logsRefreshing,   setLogsRefreshing]   = useState(false);
  const [logLevels,        setLogLevels]        = useState<Set<string>>(new Set(LOG_LEVELS));
  const [selectedLogDate,  setSelectedLogDate]  = useState(todayStr);
  const [logCopied,        setLogCopied]        = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const logRequestedAt  = useRef<number>(0);

  // Subscribe to Firestore device document
  useEffect(() => {
    if (!deviceId) return;
    return subscribeDevice(deviceId, d => {
      setDevice(d);
      setDeviceLoading(false);
    });
  }, [deviceId]);

  useEffect(() => {
    if (!device?.projectId) return;
    return subscribeProject(device.projectId, p => { projectNameRef.current = p?.name ?? ''; });
  }, [device?.projectId]);

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
      await requestLogs(deviceId, selectedLogDate);
      addSiteLog({ category: 'log', action: 'fetched', targetId: deviceId, targetName: device?.name ?? deviceId, projectName: projectNameRef.current, deviceName: device?.name ?? deviceId, performedBy: siteLogActor() }).catch(() => {});
    } catch {
      setLogsRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, logsRefreshing, selectedLogDate, device?.name, user]);

  // Scroll to bottom when new log data arrives.
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

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

  // Fetch portal screenshot directly from Firebase Storage using Firebase ID token.
  // Firebase Storage has strong read-after-write consistency, so a single fetch
  // always returns the fresh image (Workers patches Firestore completedAt only
  // after the Storage upload completes).
  const fetchPortalScreenshot = useCallback(async (completedAt?: { toDate(): Date } | null) => {
    if (!deviceId) return;
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) { setPortalSsState('error'); return; }

      const res = await fetch(
        `${WORKERS_BASE_URL}/v1/screenshot?deviceId=${encodeURIComponent(deviceId)}`,
        { headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store' },
      );
      if (!res.ok) throw new Error(`fetch failed (${res.status})`);

      if (portalBlobRef.current) URL.revokeObjectURL(portalBlobRef.current);
      const url = URL.createObjectURL(await res.blob());
      portalBlobRef.current = url;
      setPortalSsBlobUrl(url);
      const capturedDate = completedAt?.toDate() ?? null;
      setPortalSsCapturedAt(capturedDate ? formatDate(capturedDate.toISOString()) : null);
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

  function siteLogActor() {
    return {
      uid:         user?.uid          ?? '',
      email:       user?.email        ?? '',
      displayName: user?.displayName  ?? '',
    };
  }

  async function handlePortalScreenshotRequest() {
    if (!deviceId) return;
    setPortalSsState('pending');
    // Keep the existing blob URL so the previous screenshot stays visible while fetching.
    try {
      await requestPortalScreenshot(deviceId);
      addSiteLog({ category: 'screenshot', action: 'captured', targetId: deviceId, targetName: device?.name ?? deviceId, projectName: projectNameRef.current, deviceName: device?.name ?? deviceId, performedBy: siteLogActor() }).catch(() => {});
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
          <p className="text-[var(--text-faint)] text-sm">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="flex flex-col min-h-full">
        <div className="p-8">
          <p className="text-[var(--text-dim)] mb-2">{t('deviceDetail.notFound')}</p>
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
          <h1 className="text-[var(--text)] text-3xl font-semibold">{device.name}</h1>
          <p className="text-[var(--text-muted)] text-base font-mono">{device.ip}</p>
        </div>
        <div className="mt-7">
          <StatusBadge status={device.status} />
        </div>
      </div>

      <div className="px-4 sm:px-6 pt-8 pb-8 space-y-6">

        {/* システム情報セクション */}
        <div>
          <h2 className="text-[var(--text)] font-semibold text-base mb-3">{t('deviceDetail.systemInfo')}</h2>
          <div className="bg-[var(--bg-surface)] ring-1 ring-[var(--border)] rounded-xl p-5">
            <div className="mb-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-sm text-[var(--text-muted)]">{device.app}</span>
                <span className="text-[var(--text-faint)] text-xs">v{device.appVersion}</span>
              </div>
              <p className="text-xs text-[var(--text-faint)]">{t('deviceDetail.lastSeen', { time: formatDate(device.lastSeen) })}</p>
            </div>
            <p className="text-xs text-[var(--text-faint)] mt-2 mb-4">
              {t('deviceDetail.uptime')}:{' '}
              <span className="text-sm font-semibold text-[var(--text)]">
                <UptimeClock uptimeSecs={device.system.uptime} lastSeen={device.lastSeen} status={device.status} />
              </span>
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 sm:gap-x-8">
              <MetricBar label="CPU"        value={device.system.cpu}         unit="%" />
              <MetricBar label={t('deviceDetail.memory')}      value={device.system.memory}      unit="%" />
              <MetricBar label={t('deviceDetail.temperature')} value={device.system.temperature} unit="°C" warn={65} danger={80} />
              <MetricBar label={t('deviceDetail.storage')}     value={device.system.storage}     unit="%" warn={80} danger={90} />
            </div>
          </div>
        </div>

        {/* スクリーンショットセクション（Bridge-Ground 以外） */}
        {device.app !== 'Bridge-Ground' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[var(--text)] font-semibold text-base">{t('deviceDetail.screenshot')}</h2>
              <button
                onClick={handlePortalScreenshotRequest}
                disabled={portalSsState === 'pending'}
                className="h-7 px-3 rounded-md text-xs text-[var(--text-muted)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] ring-1 ring-[var(--border)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {portalSsState === 'pending' ? t('deviceDetail.requesting') : t('deviceDetail.requestScreenshot')}
              </button>
            </div>

            <div className="bg-[var(--bg-surface)] ring-1 ring-[var(--border)] rounded-xl p-5">
              {/* 画像なし・idle */}
              {!portalSsBlobUrl && portalSsState === 'idle' && (
                <div className="flex items-center justify-center h-28 text-[var(--text-faint)] text-sm">
                  {t('deviceDetail.ssIdle')}
                </div>
              )}
              {/* 画像なし・pending */}
              {!portalSsBlobUrl && portalSsState === 'pending' && (
                <div className="flex flex-col items-center justify-center h-28 gap-3">
                  <p className="text-[var(--text-faint)] text-sm">{t('deviceDetail.requesting')}</p>
                  <button
                    onClick={() => {
                      setPortalSsState('idle');
                      if (deviceId) cancelScreenshotRequest(deviceId).catch(() => {});
                    }}
                    className="h-6 px-3 rounded-md text-xs text-[var(--text-faint)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] ring-1 ring-[var(--border)] transition-colors cursor-pointer"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              )}
              {/* 画像なし・error */}
              {!portalSsBlobUrl && portalSsState === 'error' && (
                <div className="flex flex-col items-center justify-center h-20 gap-2 rounded-lg bg-[var(--bg-base)] ring-1 ring-red-900/30">
                  <p className="text-red-400 text-sm">{t('deviceDetail.ssError')}</p>
                  <button
                    onClick={handlePortalScreenshotRequest}
                    className="h-6 px-3 rounded-md text-xs text-[var(--text-muted)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] ring-1 ring-[var(--border)] transition-colors cursor-pointer"
                  >
                    {t('common.retry')}
                  </button>
                </div>
              )}
              {/* 画像あり（ready / pending / error すべてで表示） */}
              {portalSsBlobUrl && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-[var(--text-faint)]">
                      {portalSsCapturedAt ? t('deviceDetail.lastCaptured', { time: portalSsCapturedAt }) : t('deviceDetail.lastCapturedNone')}
                    </p>
                    <div className="flex items-center gap-2">
                      {portalSsState === 'error' && (
                        <button
                          onClick={handlePortalScreenshotRequest}
                          className="h-7 px-3 rounded-md text-xs text-red-400 bg-red-950/30 hover:bg-red-950/50 ring-1 ring-red-900/50 transition-colors cursor-pointer"
                        >
                          {t('common.retry')}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const a = document.createElement('a');
                          const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                          a.href = portalSsBlobUrl;
                          a.download = `screenshot-${device.name}-${ts}.jpg`;
                          a.click();
                          addSiteLog({ category: 'screenshot', action: 'downloaded', targetId: deviceId, targetName: device.name, projectName: projectNameRef.current, deviceName: device.name, performedBy: siteLogActor() }).catch(() => {});
                        }}
                        className="h-7 px-3 rounded-md text-xs text-[var(--text-muted)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] ring-1 ring-[var(--border)] transition-colors cursor-pointer"
                      >
                        {t('common.download')}
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <img
                      src={portalSsBlobUrl}
                      alt={t('deviceDetail.ssAlt', { name: device.name })}
                      className="w-full rounded-lg ring-1 ring-[var(--border)] object-contain max-h-[600px]"
                    />
                    {/* 取得中オーバーレイ */}
                    {portalSsState === 'pending' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-black/60">
                        <p className="text-[var(--text-muted)] text-sm">{t('deviceDetail.requesting')}</p>
                        <button
                          onClick={() => {
                            setPortalSsState('ready');
                            if (deviceId) cancelScreenshotRequest(deviceId).catch(() => {});
                          }}
                          className="h-6 px-3 rounded-md text-xs text-[var(--text-dim)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] ring-1 ring-[var(--border)] transition-colors cursor-pointer"
                        >
                          {t('common.cancel')}
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
          {/* 外枠の外: タイトル + ログレベル + 日付 + 更新（PC: 1行、スマホ: 折り返し） */}
          <div className="flex items-start sm:items-center justify-between gap-3 mb-3">
            <h2 className="text-[var(--text)] font-semibold text-base shrink-0">{t('deviceDetail.logs')}</h2>
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end">
              {LOG_LEVELS.map(level => (
                <button
                  key={level}
                  onClick={() => toggleLevel(level)}
                  className={`h-6 px-2.5 rounded-md text-xs font-medium ring-1 transition-colors cursor-pointer ${logLevelBadgeClass(level, logLevels.has(level))}`}
                >
                  {level}
                </button>
              ))}
              <div className="hidden sm:block w-px h-4 bg-[var(--border)] mx-1" />
              <DateRangePicker
                mode="single"
                from={selectedLogDate}
                to=""
                onApply={(date) => setSelectedLogDate(date)}
                min={minLogDate}
                max={todayStr}
                size="sm"
              />
              <button
                onClick={handleRefreshLogs}
                disabled={logsRefreshing}
                className="h-6 px-2.5 rounded-md text-xs font-medium ring-1 transition-colors cursor-pointer text-[var(--text-dim)] bg-[var(--bg-subtle)] ring-[var(--border)] hover:bg-[var(--bg-hover)] disabled:opacity-50"
              >
                {logsRefreshing ? t('deviceDetail.refreshingLogs') : t('deviceDetail.refreshLogs')}
              </button>
            </div>
          </div>

          {/* 外枠 */}
          <div className="bg-[var(--bg-surface)] ring-1 ring-[var(--border)] rounded-xl p-4">
            {/* 外枠と内枠の間: 件数・最終取得・ダウンロード */}
            <div className="flex items-start sm:items-center justify-between mb-3">
              {/* スマホ: 2行 / PC: 1行 */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-0 sm:gap-3">
                <span className="text-xs text-[var(--text-faint)]">{t('deviceDetail.logCount', { count: filteredLogs.length })}</span>
                <span className="text-xs text-[var(--text-faint)]">
                  {logsLastFetched ? t('deviceDetail.lastFetched', { time: formatDate(logsLastFetched.toISOString()) }) : t('deviceDetail.lastFetchedNone')}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={async () => {
                    if (filteredLogs.length === 0) return;
                    const text = filteredLogs.map(log =>
                      `[${log.timestamp}] ${(log.level || '----').padEnd(5)} ${log.tag ? `[${log.tag}] ` : ''}${log.message}`
                    ).join('\n');
                    await navigator.clipboard.writeText(text);
                    setLogCopied(true);
                    setTimeout(() => setLogCopied(false), 2000);
                  }}
                  disabled={filteredLogs.length === 0}
                  className="h-7 px-3 rounded-md text-xs text-[var(--text-muted)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] ring-1 ring-[var(--border)] transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {logCopied ? t('common.copied') : t('common.copy')}
                </button>
                <button
                  onClick={() => {
                    if (filteredLogs.length === 0) return;
                    const lines = filteredLogs.map(log =>
                      `[${log.timestamp}] ${(log.level || '----').padEnd(5)} ${log.tag ? `[${log.tag}] ` : ''}${log.message}`
                    ).join('\n');
                    const blob = new Blob([lines], { type: 'text/plain' });
                    const url  = URL.createObjectURL(blob);
                    const a    = document.createElement('a');
                    a.href     = url;
                    a.download = `${device?.name ?? deviceId}-${selectedLogDate}.log`;
                    a.click();
                    URL.revokeObjectURL(url);
                    addSiteLog({ category: 'log', action: 'downloaded', targetId: deviceId, targetName: device?.name ?? deviceId ?? '', projectName: projectNameRef.current, deviceName: device?.name ?? deviceId ?? '', performedBy: siteLogActor() }).catch(() => {});
                  }}
                  disabled={filteredLogs.length === 0}
                  className="h-7 px-3 rounded-md text-xs text-[var(--text-muted)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] ring-1 ring-[var(--border)] transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {t('common.download')}
                </button>
              </div>
            </div>

            {/* 内枠: ログビューア */}
            <div className="bg-[#0a0a0a] ring-1 ring-[var(--border)] rounded-xl overflow-hidden">
              <div ref={logContainerRef} className="h-96 overflow-y-auto overflow-x-auto p-4 font-log text-xs leading-5 space-y-0.5 scrollbar-subtle">
                {filteredLogs.length === 0 ? (
                  <p className="text-[var(--text-faint)] text-center py-8 whitespace-nowrap">
                    {logs.length === 0 ? t('deviceDetail.noLogs') : t('deviceDetail.noFilteredLogs')}
                  </p>
                ) : (
                  filteredLogs.map((log, i) => (
                    <div key={log._key} className="flex gap-2 whitespace-nowrap">
                      <span className="shrink-0 select-none text-[var(--text-faint)] tabular-nums whitespace-pre pr-2">
                        {String(i + 1).padStart(String(filteredLogs.length).length)}
                      </span>
                      <span className="shrink-0 text-[var(--text-faint)]">{log.timestamp}</span>
                      <span className={`shrink-0 w-10 ${logLevelClass(log.level)}`}>{log.level || '----'}</span>
                      {log.tag && <span className="shrink-0 text-[var(--text-faint)]">[{log.tag}]</span>}
                      <span className="text-[var(--text-muted)]">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
