import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { subscribeDeletionRequests, approveDeletion, rejectDeletion, addSiteLog } from '../lib/firestore';
import type { DeletionRequest, DeletionTargetType } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';
import { useFormatDate } from '../hooks/useFormatDate';

// ── helpers ──────────────────────────────────────────────────────

const typeBadge: Record<DeletionTargetType, string> = {
  project:  'text-orange-400 bg-orange-500/10 ring-1 ring-orange-500/20',
  device:   'text-blue-400 bg-blue-500/10 ring-1 ring-blue-500/20',
  apiToken: 'text-purple-400 bg-purple-500/10 ring-1 ring-purple-500/20',
  group:    'text-green-400 bg-green-500/10 ring-1 ring-green-500/20',
};

// ── 承認確認モーダル ──────────────────────────────────────────────

interface ApproveConfirmProps {
  request:   DeletionRequest;
  onClose:   () => void;
  onConfirm: () => Promise<void>;
}

function ApproveConfirm({ request, onClose, onConfirm }: ApproveConfirmProps) {
  const { t } = useTranslation();
  const typeLabel: Record<DeletionTargetType, string> = {
    project:  t('deletionRequests.type.project'),
    device:   t('deletionRequests.type.device'),
    apiToken: t('deletionRequests.type.apiToken'),
    group:    t('deletionRequests.type.group'),
  };
  const [running, setRunning] = useState(false);

  async function handle() {
    setRunning(true);
    try { await onConfirm(); onClose(); }
    finally { setRunning(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-[var(--bg-surface)] ring-1 ring-[var(--border)] rounded-xl w-full max-w-md p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <h2 className="text-[var(--text)] text-lg font-semibold mb-2">{t('deletionRequests.approveModal.title')}</h2>
        <p className="text-[var(--text-dim)] text-sm mb-5">
          {t('deletionRequests.approveModal.body', { name: request.targetName, type: typeLabel[request.type] })}
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="h-9 px-4 rounded-lg text-sm text-[var(--text-muted)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]/60 ring-1 ring-[var(--border)] transition-colors cursor-pointer">
            {t('common.cancel')}
          </button>
          <button onClick={handle} disabled={running}
            className="h-9 px-4 rounded-lg text-sm font-medium text-white bg-[var(--danger)] hover:bg-[var(--danger-hover)] disabled:opacity-50 transition-colors cursor-pointer">
            {running ? t('deletionRequests.approveModal.deleting') : t('deletionRequests.approveModal.deleteBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 却下モーダル ──────────────────────────────────────────────────

interface RejectModalProps {
  request:   DeletionRequest;
  onClose:   () => void;
  onConfirm: (note: string) => Promise<void>;
}

function RejectModal({ request, onClose, onConfirm }: RejectModalProps) {
  const { t } = useTranslation();
  const [note,    setNote]    = useState('');
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) { setError(t('deletionRequests.rejectModal.reasonRequired')); return; }
    setRunning(true);
    try { await onConfirm(note.trim()); onClose(); }
    catch { setError(t('deletionRequests.rejectModal.failed')); setRunning(false); }
  }

  const textareaClass =
    'w-full bg-[var(--bg-raised)] ring-1 ring-[var(--border)] text-[var(--text)] rounded-lg px-3 py-2 text-sm outline-none focus:ring-[var(--accent)] focus:ring-2 placeholder:text-[var(--text-faint)] transition-all resize-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-[var(--bg-surface)] ring-1 ring-[var(--border)] rounded-xl w-full max-w-md p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <h2 className="text-[var(--text)] text-lg font-semibold mb-2">{t('deletionRequests.rejectModal.title')}</h2>
        <p className="text-[var(--text-dim)] text-sm mb-4">
          {t('deletionRequests.rejectModal.body', { name: request.targetName })}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea value={note} onChange={e => setNote(e.target.value)}
            rows={3} className={textareaClass} />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose}
              className="h-9 px-4 rounded-lg text-sm text-[var(--text-muted)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]/60 ring-1 ring-[var(--border)] transition-colors cursor-pointer">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={running}
              className="h-9 px-4 rounded-lg text-sm font-medium text-white bg-[var(--danger)] hover:bg-[var(--danger-hover)] disabled:opacity-50 transition-colors cursor-pointer">
              {running ? t('deletionRequests.rejectModal.processing') : t('deletionRequests.rejectModal.rejectBtn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── メインページ ──────────────────────────────────────────────────

export function DeletionRequests() {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  const typeLabel: Record<DeletionTargetType, string> = {
    project:  t('deletionRequests.type.project'),
    device:   t('deletionRequests.type.device'),
    apiToken: t('deletionRequests.type.apiToken'),
    group:    t('deletionRequests.type.group'),
  };
  usePageTitle(t('deletionRequests.title'));
  const { user, role } = useAuth();

  function siteLogActor() {
    return { uid: user?.uid ?? '', email: user?.email ?? '', displayName: user?.displayName ?? '' };
  }
  const [requests,      setRequests]      = useState<DeletionRequest[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [approveTarget, setApproveTarget] = useState<DeletionRequest | null>(null);
  const [rejectTarget,  setRejectTarget]  = useState<DeletionRequest | null>(null);

  useEffect(() => {
    const unsub = subscribeDeletionRequests(
      reqs => { setRequests(reqs); setLoading(false); },
      ()   => setLoading(false),
    );
    return unsub;
  }, []);

  if (role !== 'owner') {
    return (
      <div className="flex flex-col min-h-full">
        <div className="p-8">
          <p className="text-[var(--text-dim)] text-sm">{t('deletionRequests.accessDenied')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">

      {/* ページヘッダー */}
      <div className="flex items-start justify-between gap-4 py-6 px-4 sm:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-[var(--text)] text-3xl font-semibold leading-tight">{t('deletionRequests.title')}</h1>
          <p className="text-[var(--text-muted)] text-base">{t('deletionRequests.description')}</p>
        </div>
        {!loading && requests.length > 0 && (
          <span className="flex items-center justify-center h-6 min-w-6 px-2 rounded-full bg-red-600 text-[var(--text)] text-xs font-semibold mt-1">
            {requests.length}
          </span>
        )}
      </div>

      {/* コンテンツ */}
      <div className="px-4 sm:px-6 pt-8 pb-8">
        {loading ? (
          <div className="overflow-hidden rounded-lg bg-[var(--bg-surface)] ring-1 ring-[var(--border)] p-12 text-center">
            <p className="text-[var(--text-faint)] text-sm">{t('common.loading')}</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="overflow-hidden rounded-lg bg-[var(--bg-surface)] ring-1 ring-[var(--border)] p-12 text-center">
            <p className="text-[var(--text-faint)] text-sm">{t('deletionRequests.noRequests')}</p>
          </div>
        ) : (
          <>
            {/* モバイルカード */}
            <div className="sm:hidden space-y-4">
              {requests.map(req => (
                <div key={req.id} className="rounded-lg bg-[var(--bg-surface)] ring-1 ring-[var(--border)] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center h-5 px-2 rounded-full text-xs font-medium ${typeBadge[req.type]}`}>
                      {typeLabel[req.type]}
                    </span>
                    <span className="text-[var(--text-faint)] text-xs tabular-nums">{formatDate(req.requestedAt)}</span>
                  </div>
                  <div>
                    <p className="text-[var(--text)] text-sm font-medium truncate">{req.targetName}</p>
                    <p className="text-[var(--text-faint)] text-xs truncate mt-0.5">{req.requestedByEmail}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setApproveTarget(req)}
                      className="h-7 px-3 rounded-md text-xs font-medium text-white bg-[var(--danger)] hover:bg-[var(--danger-hover)] transition-colors cursor-pointer"
                    >
                      {t('deletionRequests.approveDeleteBtn')}
                    </button>
                    <button
                      onClick={() => setRejectTarget(req)}
                      className="h-7 px-3 rounded-md text-xs text-[var(--text-muted)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]/60 ring-1 ring-[var(--border)] transition-colors cursor-pointer"
                    >
                      {t('deletionRequests.rejectBtn')}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* デスクトップテーブル */}
            <div className="hidden sm:block overflow-hidden rounded-lg ring-1 ring-[var(--border)]">
              <div className="grid grid-cols-[88px_1fr_1fr_160px_176px] gap-4 px-4 py-3 bg-[var(--bg-base)] border-b border-[var(--border)] text-xs font-medium text-[var(--text-faint)] uppercase tracking-wider">
                <span>{t('deletionRequests.table.type')}</span>
                <span>{t('deletionRequests.table.target')}</span>
                <span>{t('deletionRequests.table.requester')}</span>
                <span>{t('deletionRequests.table.requestedAt')}</span>
                <span />
              </div>
              {requests.map((req, i) => (
                <div
                  key={req.id}
                  className={`grid grid-cols-[88px_1fr_1fr_160px_176px] gap-4 px-4 py-4 items-center bg-[var(--bg-surface)] transition-colors ${
                    i < requests.length - 1 ? 'border-b border-[var(--border)]' : ''
                  }`}
                >
                  <span className={`inline-flex items-center justify-center h-5 px-2 rounded-full text-xs font-medium ${typeBadge[req.type]}`}>
                    {typeLabel[req.type]}
                  </span>
                  <span className="text-[var(--text)] text-sm font-medium truncate">{req.targetName}</span>
                  <span className="text-[var(--text-dim)] text-sm truncate">{req.requestedByEmail}</span>
                  <span className="text-[var(--text-dim)] text-sm tabular-nums">{formatDate(req.requestedAt)}</span>
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => setApproveTarget(req)}
                      className="h-7 px-3 rounded-md text-xs font-medium text-white bg-[var(--danger)] hover:bg-[var(--danger-hover)] transition-colors cursor-pointer"
                    >
                      {t('deletionRequests.approveDeleteBtn')}
                    </button>
                    <button
                      onClick={() => setRejectTarget(req)}
                      className="h-7 px-3 rounded-md text-xs text-[var(--text-muted)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]/60 ring-1 ring-[var(--border)] transition-colors cursor-pointer"
                    >
                      {t('deletionRequests.rejectBtn')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* モーダル */}
      {approveTarget && (
        <ApproveConfirm
          request={approveTarget}
          onClose={() => setApproveTarget(null)}
          onConfirm={async () => {
            await approveDeletion(approveTarget.id, approveTarget);
            addSiteLog({ category: 'deletionRequest', action: 'approved', targetId: approveTarget.id, targetName: approveTarget.targetName, performedBy: siteLogActor() }).catch(() => {});
          }}
        />
      )}
      {rejectTarget && (
        <RejectModal
          request={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onConfirm={async (note: string) => {
            await rejectDeletion(rejectTarget.id, note);
            addSiteLog({ category: 'deletionRequest', action: 'rejected', targetId: rejectTarget.id, targetName: rejectTarget.targetName, performedBy: siteLogActor() }).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

