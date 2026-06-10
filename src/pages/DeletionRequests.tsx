import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeDeletionRequests, approveDeletion, rejectDeletion, addSiteLog } from '../lib/firestore';
import type { DeletionRequest, DeletionTargetType } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';

// ── helpers ──────────────────────────────────────────────────────

const typeLabel: Record<DeletionTargetType, string> = {
  project:  'プロジェクト',
  device:   'デバイス',
  apiToken: 'APIトークン',
  group:    'グループ',
};

const typeBadge: Record<DeletionTargetType, string> = {
  project:  'text-orange-400 bg-orange-950/40 ring-1 ring-orange-900/50',
  device:   'text-blue-400 bg-blue-950/40 ring-1 ring-blue-900/50',
  apiToken: 'text-purple-400 bg-purple-950/40 ring-1 ring-purple-900/50',
  group:    'text-green-400 bg-green-950/40 ring-1 ring-green-900/50',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── 承認確認モーダル ──────────────────────────────────────────────

interface ApproveConfirmProps {
  request:   DeletionRequest;
  onClose:   () => void;
  onConfirm: () => Promise<void>;
}

function ApproveConfirm({ request, onClose, onConfirm }: ApproveConfirmProps) {
  const [running, setRunning] = useState(false);

  async function handle() {
    setRunning(true);
    try { await onConfirm(); onClose(); }
    finally { setRunning(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-[#111111] ring-1 ring-[#3d3d3d] rounded-xl w-full max-w-md p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <h2 className="text-white text-lg font-semibold mb-2">削除を承認</h2>
        <p className="text-zinc-400 text-sm mb-5">
          「{request.targetName}」（{typeLabel[request.type]}）を完全に削除します。<br />
          この操作は取り消せません。
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="h-9 px-4 rounded-lg text-sm text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] transition-colors cursor-pointer">
            キャンセル
          </button>
          <button onClick={handle} disabled={running}
            className="h-9 px-4 rounded-lg text-sm font-medium text-white bg-[#e81403] hover:bg-[#b20f03] disabled:opacity-50 transition-colors cursor-pointer">
            {running ? '削除中...' : '削除を実行'}
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
  const [note,    setNote]    = useState('');
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) { setError('却下理由を入力してください。'); return; }
    setRunning(true);
    try { await onConfirm(note.trim()); onClose(); }
    catch { setError('処理に失敗しました。'); setRunning(false); }
  }

  const textareaClass =
    'w-full bg-[#1a1a1a] ring-1 ring-[#3d3d3d] text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-[#4693ff] focus:ring-2 placeholder:text-zinc-600 transition-all resize-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-[#111111] ring-1 ring-[#3d3d3d] rounded-xl w-full max-w-md p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <h2 className="text-white text-lg font-semibold mb-2">削除依頼を却下</h2>
        <p className="text-zinc-400 text-sm mb-4">
          「{request.targetName}」の削除依頼を却下します。<br />
          却下理由を入力してください。
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="却下理由を入力..." rows={3} className={textareaClass} />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose}
              className="h-9 px-4 rounded-lg text-sm text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] transition-colors cursor-pointer">
              キャンセル
            </button>
            <button type="submit" disabled={running}
              className="h-9 px-4 rounded-lg text-sm font-medium text-white bg-[#e81403] hover:bg-[#b20f03] disabled:opacity-50 transition-colors cursor-pointer">
              {running ? '処理中...' : '却下する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── メインページ ──────────────────────────────────────────────────

export function DeletionRequests() {
  usePageTitle('削除依頼');
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
          <p className="text-zinc-400 text-sm">このページはオーナーのみアクセスできます。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">

      {/* ページヘッダー */}
      <div className="flex items-start justify-between gap-4 py-6 px-4 sm:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-white text-3xl font-semibold leading-tight">削除依頼</h1>
          <p className="text-[#999999] text-base">承認待ちの削除依頼を確認・処理</p>
        </div>
        {!loading && requests.length > 0 && (
          <span className="flex items-center justify-center h-6 min-w-6 px-2 rounded-full bg-red-600 text-white text-xs font-semibold mt-1">
            {requests.length}
          </span>
        )}
      </div>

      {/* コンテンツ */}
      <div className="px-4 sm:px-6 pt-8 pb-8">
        {loading ? (
          <div className="overflow-hidden rounded-lg bg-[#111111] ring-1 ring-[#3d3d3d] p-12 text-center">
            <p className="text-zinc-500 text-sm">読み込み中...</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="overflow-hidden rounded-lg bg-[#111111] ring-1 ring-[#3d3d3d] p-12 text-center">
            <p className="text-zinc-500 text-sm">承認待ちの削除依頼はありません。</p>
          </div>
        ) : (
          <>
            {/* モバイルカード */}
            <div className="sm:hidden space-y-4">
              {requests.map(req => (
                <div key={req.id} className="rounded-lg bg-[#111111] ring-1 ring-[#3d3d3d] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center h-5 px-2 rounded-full text-xs font-medium ${typeBadge[req.type]}`}>
                      {typeLabel[req.type]}
                    </span>
                    <span className="text-zinc-500 text-xs tabular-nums">{formatDate(req.requestedAt)}</span>
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium truncate">{req.targetName}</p>
                    <p className="text-zinc-500 text-xs truncate mt-0.5">{req.requestedByEmail}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setApproveTarget(req)}
                      className="h-7 px-3 rounded-md text-xs font-medium text-white bg-[#e81403] hover:bg-[#b20f03] transition-colors cursor-pointer"
                    >
                      承認・削除
                    </button>
                    <button
                      onClick={() => setRejectTarget(req)}
                      className="h-7 px-3 rounded-md text-xs text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] transition-colors cursor-pointer"
                    >
                      却下
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* デスクトップテーブル */}
            <div className="hidden sm:block overflow-hidden rounded-lg ring-1 ring-[#3d3d3d]">
              <div className="grid grid-cols-[88px_1fr_1fr_160px_176px] gap-4 px-4 py-3 bg-black border-b border-[#3d3d3d] text-xs font-medium text-zinc-500 uppercase tracking-wider">
                <span>種別</span>
                <span>対象名</span>
                <span>依頼者</span>
                <span>依頼日時</span>
                <span />
              </div>
              {requests.map((req, i) => (
                <div
                  key={req.id}
                  className={`grid grid-cols-[88px_1fr_1fr_160px_176px] gap-4 px-4 py-4 items-center bg-[#111111] hover:bg-[#161616] transition-colors ${
                    i < requests.length - 1 ? 'border-b border-[#3d3d3d]' : ''
                  }`}
                >
                  <span className={`inline-flex items-center justify-center h-5 px-2 rounded-full text-xs font-medium ${typeBadge[req.type]}`}>
                    {typeLabel[req.type]}
                  </span>
                  <span className="text-white text-sm font-medium truncate">{req.targetName}</span>
                  <span className="text-zinc-400 text-sm truncate">{req.requestedByEmail}</span>
                  <span className="text-zinc-400 text-sm tabular-nums">{formatDate(req.requestedAt)}</span>
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => setApproveTarget(req)}
                      className="h-7 px-3 rounded-md text-xs font-medium text-white bg-[#e81403] hover:bg-[#b20f03] transition-colors cursor-pointer"
                    >
                      承認・削除
                    </button>
                    <button
                      onClick={() => setRejectTarget(req)}
                      className="h-7 px-3 rounded-md text-xs text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] transition-colors cursor-pointer"
                    >
                      却下
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
