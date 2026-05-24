import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribePendingDevices,
  approveDevice,
  rejectPendingDevice,
  subscribeProjects,
} from '../lib/firestore';
import type { PendingDevice, ProjectDoc, AppName } from '../types';
import { CustomSelect } from '../components/CustomSelect';

// ── helpers ──────────────────────────────────────────────────────

const appBadge: Record<AppName, string> = {
  'Gido':           'text-blue-400   bg-blue-950/40   ring-1 ring-blue-900/50',
  'Gido-Touch':     'text-cyan-400   bg-cyan-950/40   ring-1 ring-cyan-900/50',
  'Gido-Touch-Mini':'text-teal-400   bg-teal-950/40   ring-1 ring-teal-900/50',
  'Grain-Link':     'text-purple-400 bg-purple-950/40 ring-1 ring-purple-900/50',
  'Bridge-Ground':  'text-orange-400 bg-orange-950/40 ring-1 ring-orange-900/50',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── 承認モーダル ──────────────────────────────────────────────────

interface ApprovalResult {
  deviceId:    string;
  deviceToken: string;
}

interface ApproveModalProps {
  pending:  PendingDevice;
  projects: ProjectDoc[];
  onClose:  () => void;
  onDone:   () => void;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div className="space-y-1.5">
      <label className="text-zinc-400 text-xs font-medium">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          readOnly
          className="flex-1 h-9 bg-[#1a1a1a] ring-1 ring-[#3d3d3d] text-white rounded-lg px-3 text-sm font-mono outline-none"
        />
        <button
          onClick={copy}
          className="h-9 px-3 rounded-lg text-xs font-medium text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] transition-colors cursor-pointer shrink-0"
        >
          {copied ? 'コピー済み' : 'コピー'}
        </button>
      </div>
    </div>
  );
}

function ApproveModal({ pending, projects, onClose, onDone }: ApproveModalProps) {
  const [deviceName,     setDeviceName]     = useState(pending.hostname);
  const [projectId,      setProjectId]      = useState(projects[0]?.id ?? '');
  const [running,        setRunning]        = useState(false);
  const [error,          setError]          = useState('');
  const [approvalResult, setApprovalResult] = useState<ApprovalResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!deviceName.trim()) { setError('デバイス名を入力してください。'); return; }
    if (!projectId)         { setError('プロジェクトを選択してください。'); return; }
    setRunning(true);
    try {
      const result = await approveDevice(pending.id, pending, projectId, deviceName.trim());
      onDone();
      setApprovalResult(result);
    } catch {
      setError('承認に失敗しました。');
      setRunning(false);
    }
  }

  const inputClass =
    'w-full h-9 bg-[#1a1a1a] ring-1 ring-[#3d3d3d] text-white rounded-lg px-3 text-sm outline-none focus:ring-[#4693ff] focus:ring-2 placeholder:text-zinc-600 transition-all';

  // 承認完了 → 認証情報表示画面
  if (approvalResult) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="bg-[#111111] ring-1 ring-[#3d3d3d] rounded-xl w-full max-w-md p-6 shadow-2xl">
          <div className="flex items-center gap-2 mb-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="#2db35e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <h2 className="text-white text-lg font-semibold">承認完了</h2>
          </div>
          <p className="text-zinc-400 text-sm mb-5">
            以下の認証情報を Bridge-Ground の設定画面に入力してください。
          </p>

          <div className="space-y-4">
            <CopyField label="デバイス ID" value={approvalResult.deviceId} />
            <CopyField label="デバイストークン" value={approvalResult.deviceToken} />
          </div>

          <p className="text-amber-400 text-xs mt-4 flex items-start gap-1.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            デバイストークンはこの画面を閉じると確認できなくなります。
          </p>

          <div className="flex justify-end pt-5">
            <button onClick={onClose}
              className="h-9 px-4 rounded-lg text-sm font-medium text-white bg-[#1a6aff] hover:bg-[#1558d4] transition-colors cursor-pointer">
              閉じる
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-[#111111] ring-1 ring-[#3d3d3d] rounded-xl w-full max-w-md p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <h2 className="text-white text-lg font-semibold mb-1">デバイスを承認</h2>
        <p className="text-zinc-400 text-sm mb-5">
          デバイス名とプロジェクトを設定してください。
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 申請情報 */}
          <div className="bg-[#1a1a1a] ring-1 ring-[#3d3d3d] rounded-lg px-4 py-3 space-y-1.5 text-sm">
            <div className="flex gap-2">
              <span className="text-zinc-500 w-20 shrink-0">アプリ</span>
              <span className={`inline-flex items-center h-5 px-2 rounded-full text-xs font-medium ${appBadge[pending.appName]}`}>
                {pending.appName}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-zinc-500 w-20 shrink-0">ホスト名</span>
              <span className="text-zinc-300 font-mono">{pending.hostname}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-zinc-500 w-20 shrink-0">IP</span>
              <span className="text-zinc-300 font-mono">{pending.ip}</span>
            </div>
          </div>

          {/* デバイス名 */}
          <div className="space-y-1.5">
            <label className="text-zinc-400 text-xs font-medium">デバイス名</label>
            <input
              type="text"
              value={deviceName}
              onChange={e => setDeviceName(e.target.value)}
              placeholder="例：1F エントランス"
              className={inputClass}
            />
          </div>

          {/* プロジェクト選択 */}
          <div className="space-y-1.5">
            <label className="text-zinc-400 text-xs font-medium">プロジェクト</label>
            {projects.length === 0 ? (
              <p className="text-zinc-500 text-sm">プロジェクトがありません</p>
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
              className="h-9 px-4 rounded-lg text-sm text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] transition-colors cursor-pointer">
              キャンセル
            </button>
            <button type="submit" disabled={running || projects.length === 0}
              className="h-9 px-4 rounded-lg text-sm font-medium text-white bg-[#1a6aff] hover:bg-[#1558d4] disabled:opacity-50 transition-colors cursor-pointer">
              {running ? '承認中...' : '承認する'}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-[#111111] ring-1 ring-[#3d3d3d] rounded-xl w-full max-w-md p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <h2 className="text-white text-lg font-semibold mb-2">申請を却下</h2>
        <p className="text-zinc-400 text-sm mb-5">
          <span className="text-white font-medium">{pending.hostname}</span>（{pending.ip}）の登録申請を却下します。
          <br />この操作は取り消せません。
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="h-9 px-4 rounded-lg text-sm text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] transition-colors cursor-pointer">
            キャンセル
          </button>
          <button onClick={handle} disabled={running}
            className="h-9 px-4 rounded-lg text-sm font-medium text-white bg-[#e81403] hover:bg-[#b20f03] disabled:opacity-50 transition-colors cursor-pointer">
            {running ? '処理中...' : '却下する'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── メインページ ──────────────────────────────────────────────────

export function PendingDevices() {
  const { role } = useAuth();
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
        <div className="py-3 border-b border-zinc-800"><div className="h-7" /></div>
        <div className="p-8">
          <p className="text-zinc-400 text-sm">このページは管理者以上のみアクセスできます。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="py-3 border-b border-zinc-800">
        <div className="h-7" />
      </div>

      <div className="flex items-center justify-between gap-4 py-6 px-4 sm:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-white text-3xl font-semibold">承認待ちデバイス</h1>
          <p className="text-[#999999] text-base">登録申請されたデバイスを確認・承認</p>
        </div>
        {!loading && devices.length > 0 && (
          <span className="flex items-center justify-center h-6 min-w-6 px-2 rounded-full bg-blue-600 text-white text-xs font-semibold">
            {devices.length}
          </span>
        )}
      </div>

      <div className="px-4 sm:px-6 pb-8">
        {loading ? (
          <div className="overflow-hidden rounded-lg bg-[#111111] ring-1 ring-[#3d3d3d] p-12 text-center">
            <p className="text-zinc-500 text-sm">読み込み中...</p>
          </div>
        ) : devices.length === 0 ? (
          <div className="overflow-hidden rounded-lg bg-[#111111] ring-1 ring-[#3d3d3d] p-12 text-center">
            <p className="text-zinc-500 text-sm">承認待ちのデバイスはありません。</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg ring-1 ring-[#3d3d3d]">
            <div className="grid grid-cols-[120px_1fr_140px_160px_160px] gap-4 px-4 py-3 bg-black border-b border-[#3d3d3d] text-xs font-medium text-zinc-500 uppercase tracking-wider">
              <span>アプリ</span>
              <span>ホスト名</span>
              <span>IPアドレス</span>
              <span>申請日時</span>
              <span />
            </div>

            {devices.map((d, i) => (
              <div
                key={d.id}
                className={`grid grid-cols-[120px_1fr_140px_160px_160px] gap-4 px-4 py-4 items-center bg-[#111111] hover:bg-[#161616] transition-colors ${
                  i < devices.length - 1 ? 'border-b border-[#3d3d3d]' : ''
                }`}
              >
                <span className={`inline-flex items-center justify-center h-5 px-2 rounded-full text-xs font-medium ${appBadge[d.appName]}`}>
                  {d.appName}
                </span>
                <span className="text-white text-sm font-mono truncate">{d.hostname}</span>
                <span className="text-zinc-400 text-sm font-mono">{d.ip}</span>
                <span className="text-zinc-400 text-sm tabular-nums">{formatDate(d.requestedAt)}</span>
                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={() => setApproveTarget(d)}
                    className="h-7 px-3 rounded-md text-xs font-medium text-white bg-[#1a6aff] hover:bg-[#1558d4] transition-colors cursor-pointer"
                  >
                    承認
                  </button>
                  <button
                    onClick={() => setRejectTarget(d)}
                    className="h-7 px-3 rounded-md text-xs text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] transition-colors cursor-pointer"
                  >
                    却下
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {approveTarget && (
        <ApproveModal
          pending={approveTarget}
          projects={projects}
          onClose={() => setApproveTarget(null)}
          onDone={() => {}}
        />
      )}
      {rejectTarget && (
        <RejectConfirm
          pending={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onDone={() => {}}
        />
      )}
    </div>
  );
}
