import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribePendingDevices,
  approveDevice,
  rejectPendingDevice,
  subscribeProjects,
  addSiteLog,
} from '../lib/firestore';
import type { PendingDevice, ProjectDoc, AppName } from '../types';
import { CustomSelect } from '../components/CustomSelect';
import { usePageTitle } from '../hooks/usePageTitle';
import { useFormatDate } from '../hooks/useFormatDate';

// ── helpers ──────────────────────────────────────────────────────

const appBadge: Record<AppName, string> = {
  'Gido':           'text-blue-400   bg-blue-500/10   ring-1 ring-blue-500/20',
  'Gido-Touch':     'text-red-400    bg-red-500/10    ring-1 ring-red-500/20',
  'Gido-Touch-Mini':'text-green-400  bg-green-500/10  ring-1 ring-green-500/20',
  'Grain-Link':     'text-orange-400 bg-orange-500/10 ring-1 ring-orange-500/20',
  'Bridge-Ground':  'text-purple-400 bg-purple-500/10 ring-1 ring-purple-500/20',
};

// ── 承認モーダル ──────────────────────────────────────────────────

interface ApprovalResult {
  deviceId:    string;
  deviceToken: string;
}

interface ApproveModalProps {
  pending:  PendingDevice;
  projects: ProjectDoc[];
  onClose:  () => void;
  onDone:   (deviceName: string, projectName: string) => void;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div className="space-y-1.5">
      <label className="text-[var(--text-dim)] text-xs font-medium">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          readOnly
          className="flex-1 h-9 bg-[var(--bg-raised)] ring-1 ring-[var(--border)] text-[var(--text)] rounded-lg px-3 text-sm font-mono outline-none"
        />
        <button
          onClick={copy}
          className="h-9 px-3 rounded-lg text-xs font-medium text-[var(--text-muted)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]/60 ring-1 ring-[var(--border)] transition-colors cursor-pointer shrink-0"
        >
          {copied ? t('common.copied') : t('common.copy')}
        </button>
      </div>
    </div>
  );
}

function ApproveModal({ pending, projects, onClose, onDone }: ApproveModalProps) {
  const { t } = useTranslation();
  const [deviceName,     setDeviceName]     = useState(pending.hostname);
  const [projectId,      setProjectId]      = useState(projects[0]?.id ?? '');
  const [running,        setRunning]        = useState(false);
  const [error,          setError]          = useState('');
  const [approvalResult, setApprovalResult] = useState<ApprovalResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!deviceName.trim()) { setError(t('pendingDevices.approveModal.nameRequired')); return; }
    if (!projectId)         { setError(t('pendingDevices.approveModal.projectRequired')); return; }
    setRunning(true);
    try {
      const result = await approveDevice(pending.id, pending, projectId, deviceName.trim());
      const pName = projects.find(p => p.id === projectId)?.name ?? '';
      onDone(deviceName.trim(), pName);
      setApprovalResult(result);
    } catch {
      setError(t('pendingDevices.approveModal.failed'));
      setRunning(false);
    }
  }

  const inputClass =
    'w-full h-9 bg-[var(--bg-raised)] ring-1 ring-[var(--border)] text-[var(--text)] rounded-lg px-3 text-sm outline-none focus:ring-[var(--accent)] focus:ring-2 placeholder:text-[var(--text-faint)] transition-all';

  // 承認完了 → 認証情報表示画面
  if (approvalResult) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
        <div className="bg-[var(--bg-surface)] ring-1 ring-[var(--border)] rounded-xl w-full max-w-md p-6 shadow-2xl">
          <div className="flex items-center gap-2 mb-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="#2db35e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <h2 className="text-[var(--text)] text-lg font-semibold">{t('pendingDevices.approveModal.doneTitle')}</h2>
          </div>
          <p className="text-[var(--text-dim)] text-sm mb-5">
            {t('pendingDevices.approveModal.doneBody')}
          </p>

          <div className="space-y-4">
            <CopyField label={t('pendingDevices.approveModal.deviceId')} value={approvalResult.deviceId} />
            <CopyField label={t('pendingDevices.approveModal.deviceToken')} value={approvalResult.deviceToken} />
          </div>

          <p className="text-amber-400 text-xs mt-4 flex items-start gap-1.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {t('pendingDevices.approveModal.tokenWarning')}
          </p>

          <div className="flex justify-end pt-5">
            <button onClick={onClose}
              className="h-9 px-4 rounded-lg text-sm font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors cursor-pointer">
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-[var(--bg-surface)] ring-1 ring-[var(--border)] rounded-xl w-full max-w-md p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <h2 className="text-[var(--text)] text-lg font-semibold mb-1">{t('pendingDevices.approveModal.title')}</h2>
        <p className="text-[var(--text-dim)] text-sm mb-5">
          {t('pendingDevices.approveModal.description')}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 申請情報 */}
          <div className="bg-[var(--bg-raised)] ring-1 ring-[var(--border)] rounded-lg px-4 py-3 space-y-1.5 text-sm">
            <div className="flex gap-2">
              <span className="text-[var(--text-faint)] w-20 shrink-0">{t('pendingDevices.approveModal.appLabel')}</span>
              <span className={`inline-flex items-center h-5 px-2 rounded-full text-xs font-medium ${appBadge[pending.appName]}`}>
                {pending.appName}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-[var(--text-faint)] w-20 shrink-0">{t('pendingDevices.approveModal.hostnameLabel')}</span>
              <span className="text-[var(--text-muted)] font-mono">{pending.hostname}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-[var(--text-faint)] w-20 shrink-0">{t('pendingDevices.approveModal.ipLabel')}</span>
              <span className="text-[var(--text-muted)] font-mono">{pending.ip}</span>
            </div>
          </div>

          {/* デバイス名 */}
          <div className="space-y-1.5">
            <label className="text-[var(--text-dim)] text-xs font-medium">{t('pendingDevices.approveModal.nameLabel')}</label>
            <input
              type="text"
              value={deviceName}
              onChange={e => setDeviceName(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* プロジェクト選択 */}
          <div className="space-y-1.5">
            <label className="text-[var(--text-dim)] text-xs font-medium">{t('pendingDevices.approveModal.projectLabel')}</label>
            {projects.length === 0 ? (
              <p className="text-[var(--text-faint)] text-sm">{t('pendingDevices.approveModal.noProjects')}</p>
            ) : (
              <CustomSelect
                value={projectId}
                onChange={setProjectId}
                options={projects.map(p => ({ value: p.id, label: p.name }))}
                className="w-full"
              />
            )}
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="h-9 px-4 rounded-lg text-sm text-[var(--text-muted)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]/60 ring-1 ring-[var(--border)] transition-colors cursor-pointer">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={running || projects.length === 0}
              className="h-9 px-4 rounded-lg text-sm font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors cursor-pointer">
              {running ? t('pendingDevices.approveModal.approving') : t('pendingDevices.approveModal.approveBtn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 却下確認モーダル ──────────────────────────────────────────────

interface RejectConfirmProps {
  pending: PendingDevice;
  onClose: () => void;
  onDone:  () => void;
}

function RejectConfirm({ pending, onClose, onDone }: RejectConfirmProps) {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);

  async function handle() {
    setRunning(true);
    try {
      await rejectPendingDevice(pending.id);
      onDone();
      onClose();
    } finally { setRunning(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-[var(--bg-surface)] ring-1 ring-[var(--border)] rounded-xl w-full max-w-md p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <h2 className="text-[var(--text)] text-lg font-semibold mb-2">{t('pendingDevices.rejectModal.title')}</h2>
        <p className="text-[var(--text-dim)] text-sm mb-5">
          {t('pendingDevices.rejectModal.body', { hostname: pending.hostname, ip: pending.ip })}
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="h-9 px-4 rounded-lg text-sm text-[var(--text-muted)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]/60 ring-1 ring-[var(--border)] transition-colors cursor-pointer">
            {t('common.cancel')}
          </button>
          <button onClick={handle} disabled={running}
            className="h-9 px-4 rounded-lg text-sm font-medium text-white bg-[var(--danger)] hover:bg-[var(--danger-hover)] disabled:opacity-50 transition-colors cursor-pointer">
            {running ? t('pendingDevices.rejectModal.rejecting') : t('pendingDevices.rejectModal.rejectBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── メインページ ──────────────────────────────────────────────────

export function PendingDevices() {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  usePageTitle(t('pendingDevices.title'));
  const { user, role } = useAuth();

  function siteLogActor() {
    return { uid: user?.uid ?? '', email: user?.email ?? '', displayName: user?.displayName ?? '' };
  }
  const [devices,       setDevices]       = useState<PendingDevice[]>([]);
  const [projects,      setProjects]      = useState<ProjectDoc[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [approveTarget, setApproveTarget] = useState<PendingDevice | null>(null);
  const [rejectTarget,  setRejectTarget]  = useState<PendingDevice | null>(null);

  useEffect(() => {
    const unsubDevices  = subscribePendingDevices(d => { setDevices(d); setLoading(false); });
    const unsubProjects = subscribeProjects(setProjects);
    return () => { unsubDevices(); unsubProjects(); };
  }, []);

  if (role !== 'admin' && role !== 'owner') {
    return (
      <div className="flex flex-col min-h-full">
        <div className="p-8">
          <p className="text-[var(--text-dim)] text-sm">{t('pendingDevices.accessDenied')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">

      <div className="flex items-start justify-between gap-4 py-6 px-4 sm:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-[var(--text)] text-3xl font-semibold leading-tight">{t('pendingDevices.title')}</h1>
          <p className="text-[var(--text-muted)] text-base">{t('pendingDevices.description')}</p>
        </div>
        {!loading && devices.length > 0 && (
          <span className="flex items-center justify-center h-6 min-w-6 px-2 rounded-full bg-[var(--accent)] text-white text-xs font-semibold mt-1">
            {devices.length}
          </span>
        )}
      </div>

      <div className="px-4 sm:px-6 pt-8 pb-8">
        {loading ? (
          <div className="overflow-hidden rounded-lg bg-[var(--bg-surface)] ring-1 ring-[var(--border)] p-12 text-center">
            <p className="text-[var(--text-faint)] text-sm">{t('common.loading')}</p>
          </div>
        ) : devices.length === 0 ? (
          <div className="overflow-hidden rounded-lg bg-[var(--bg-surface)] ring-1 ring-[var(--border)] p-12 text-center">
            <p className="text-[var(--text-faint)] text-sm">{t('pendingDevices.noDevices')}</p>
          </div>
        ) : (
          <>
            {/* モバイルカード */}
            <div className="sm:hidden space-y-4">
              {devices.map(d => (
                <div key={d.id} className="rounded-lg bg-[var(--bg-surface)] ring-1 ring-[var(--border)] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center h-5 px-2 rounded-full text-xs font-medium ${appBadge[d.appName]}`}>
                      {d.appName}
                    </span>
                    <span className="text-[var(--text-faint)] text-xs tabular-nums">{formatDate(d.requestedAt)}</span>
                  </div>
                  <div>
                    <p className="text-[var(--text)] text-sm font-mono truncate">{d.hostname}</p>
                    <p className="text-[var(--text-faint)] text-xs font-mono mt-0.5">{d.ip}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setApproveTarget(d)}
                      className="h-7 px-3 rounded-md text-xs font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
                    >
                      {t('pendingDevices.approveBtn')}
                    </button>
                    <button
                      onClick={() => setRejectTarget(d)}
                      className="h-7 px-3 rounded-md text-xs text-[var(--text-muted)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]/60 ring-1 ring-[var(--border)] transition-colors cursor-pointer"
                    >
                      {t('pendingDevices.rejectBtn')}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* デスクトップテーブル */}
            <div className="hidden sm:block overflow-hidden rounded-lg ring-1 ring-[var(--border)]">
              <div className="grid grid-cols-[120px_1fr_140px_160px_160px] gap-4 px-4 py-3 bg-[var(--bg-base)] border-b border-[var(--border)] text-xs font-medium text-[var(--text-faint)] uppercase tracking-wider">
                <span>{t('pendingDevices.table.app')}</span>
                <span>{t('pendingDevices.table.hostname')}</span>
                <span>{t('pendingDevices.table.ip')}</span>
                <span>{t('pendingDevices.table.requestedAt')}</span>
                <span />
              </div>
              {devices.map((d, i) => (
                <div
                  key={d.id}
                  className={`grid grid-cols-[120px_1fr_140px_160px_160px] gap-4 px-4 py-4 items-center bg-[var(--bg-surface)] transition-colors ${
                    i < devices.length - 1 ? 'border-b border-[var(--border)]' : ''
                  }`}
                >
                  <span className={`inline-flex items-center justify-center h-5 px-2 rounded-full text-xs font-medium ${appBadge[d.appName]}`}>
                    {d.appName}
                  </span>
                  <span className="text-[var(--text)] text-sm font-mono truncate">{d.hostname}</span>
                  <span className="text-[var(--text-dim)] text-sm font-mono">{d.ip}</span>
                  <span className="text-[var(--text-dim)] text-sm tabular-nums">{formatDate(d.requestedAt)}</span>
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => setApproveTarget(d)}
                      className="h-7 px-3 rounded-md text-xs font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
                    >
                      {t('pendingDevices.approveBtn')}
                    </button>
                    <button
                      onClick={() => setRejectTarget(d)}
                      className="h-7 px-3 rounded-md text-xs text-[var(--text-muted)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]/60 ring-1 ring-[var(--border)] transition-colors cursor-pointer"
                    >
                      {t('pendingDevices.rejectBtn')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {approveTarget && (
        <ApproveModal
          pending={approveTarget}
          projects={projects}
          onClose={() => setApproveTarget(null)}
          onDone={(deviceName, projectName) => {
            setApproveTarget(null);
            addSiteLog({ category: 'device', action: 'added', targetId: approveTarget?.id, targetName: deviceName, projectName, deviceName, performedBy: siteLogActor() }).catch(() => {});
          }}
        />
      )}
      {rejectTarget && (
        <RejectConfirm
          pending={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onDone={() => {
            setRejectTarget(null);
            addSiteLog({ category: 'device', action: 'rejected', targetId: rejectTarget?.id, targetName: rejectTarget?.hostname ?? '', performedBy: siteLogActor() }).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

