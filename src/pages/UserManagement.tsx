import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeUserRoles, setUserRole, removeUserRole } from '../lib/firestore';
import type { UserRoleRecord, UserRole } from '../types';
import { CustomSelect } from '../components/CustomSelect';

// ── helpers ──────────────────────────────────────────────────────

const roleLabel: Record<UserRole, string> = {
  owner: 'オーナー',
  admin: '管理者',
  user:  '一般',
};

const roleBadge: Record<UserRole, string> = {
  owner: 'text-yellow-400 bg-yellow-950/40 ring-1 ring-yellow-900/50',
  admin: 'text-blue-400 bg-blue-950/40 ring-1 ring-blue-900/50',
  user:  'text-zinc-400 bg-zinc-800/60 ring-1 ring-zinc-700/50',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'numeric', day: 'numeric',
  });
}

// ── 除名確認モーダル ──────────────────────────────────────────────

interface RemoveConfirmProps {
  target:    UserRoleRecord;
  onClose:   () => void;
  onConfirm: () => Promise<void>;
}

function RemoveConfirm({ target, onClose, onConfirm }: RemoveConfirmProps) {
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
        <h2 className="text-white text-lg font-semibold mb-2">ユーザーを除名</h2>
        <p className="text-zinc-400 text-sm mb-5">
          「{target.displayName}」（{target.email}）をシステムから除名します。<br />
          Firebase アカウントは残りますが、次回ログイン時に一般ユーザーとして自動再登録されます。
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="h-9 px-4 rounded-lg text-sm text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] transition-colors cursor-pointer">
            キャンセル
          </button>
          <button onClick={handle} disabled={running}
            className="h-9 px-4 rounded-lg text-sm font-medium text-white bg-[#e81403] hover:bg-[#b20f03] disabled:opacity-50 transition-colors cursor-pointer">
            {running ? '処理中...' : '除名する'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── メインページ ──────────────────────────────────────────────────

export function UserManagement() {
  const { user, role } = useAuth();
  const [users,        setUsers]        = useState<UserRoleRecord[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [removeTarget, setRemoveTarget] = useState<UserRoleRecord | null>(null);
  const [updating,     setUpdating]     = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeUserRoles(us => {
      setUsers(us);
      setLoading(false);
    });
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

  async function handleRoleChange(target: UserRoleRecord, newRole: UserRole) {
    setUpdating(target.uid);
    try {
      await setUserRole(target.uid, { ...target, role: newRole });
    } finally {
      setUpdating(null);
    }
  }

  async function handleRemove(target: UserRoleRecord) {
    await removeUserRole(target.uid);
  }

  return (
    <div className="flex flex-col min-h-full">

      {/* ページヘッダー */}
      <div className="flex items-start justify-between gap-4 py-6 px-4 sm:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-white text-3xl font-semibold leading-tight">ユーザー管理</h1>
          <p className="text-[#999999] text-base">ユーザーのロール管理・除名</p>
        </div>
        {!loading && (
          <span className="text-sm text-zinc-500 mt-1">{users.length} 名</span>
        )}
      </div>

      {/* コンテンツ */}
      <div className="px-4 sm:px-6 pt-8 pb-8">
        {loading ? (
          <div className="overflow-hidden rounded-lg bg-[#111111] ring-1 ring-[#3d3d3d] p-12 text-center">
            <p className="text-zinc-500 text-sm">読み込み中...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="overflow-hidden rounded-lg bg-[#111111] ring-1 ring-[#3d3d3d] p-12 text-center">
            <p className="text-zinc-500 text-sm">ユーザーが登録されていません。</p>
          </div>
        ) : (
          <div className="rounded-lg ring-1 ring-[#3d3d3d]">
            {/* テーブルヘッダー */}
            <div className="grid grid-cols-[1fr_1fr_160px_120px_120px] gap-4 px-4 py-3 bg-black rounded-t-lg border-b border-[#3d3d3d] text-xs font-medium text-zinc-500 uppercase tracking-wider">
              <span>表示名</span>
              <span>メール</span>
              <span>ロール</span>
              <span>登録日</span>
              <span />
            </div>

            {users.map((u, i) => {
              const isSelf    = u.uid === user?.uid;
              const isUpdating = updating === u.uid;

              return (
                <div
                  key={u.uid}
                  className={`grid grid-cols-[1fr_1fr_160px_120px_120px] gap-4 px-4 py-3.5 items-center bg-[#111111] hover:bg-[#161616] transition-colors ${
                    i < users.length - 1 ? 'border-b border-[#3d3d3d]' : 'rounded-b-lg'
                  }`}
                >
                  {/* 表示名 */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0 text-white text-xs font-medium">
                      {u.displayName[0]?.toUpperCase() ?? '?'}
                    </div>
                    <span className="text-white text-sm truncate">
                      {u.displayName}
                      {isSelf && <span className="ml-1.5 text-zinc-500 text-xs">（自分）</span>}
                    </span>
                  </div>

                  {/* メール */}
                  <span className="text-zinc-400 text-sm truncate">{u.email}</span>

                  {/* ロール */}
                  {isSelf ? (
                    <span className={`inline-flex items-center justify-center h-5 px-2 rounded-full text-xs font-medium w-fit ${roleBadge[u.role]}`}>
                      {roleLabel[u.role]}
                    </span>
                  ) : (
                    <CustomSelect
                      value={u.role}
                      disabled={isUpdating}
                      onChange={val => handleRoleChange(u, val as UserRole)}
                      options={[
                        { value: 'owner', label: 'オーナー' },
                        { value: 'admin', label: '管理者' },
                        { value: 'user',  label: '一般' },
                      ]}
                      className="w-36"
                    />
                  )}

                  {/* 登録日 */}
                  <span className="text-zinc-500 text-xs tabular-nums">{formatDate(u.assignedAt)}</span>

                  {/* 操作 */}
                  <div className="flex justify-end">
                    {!isSelf && (
                      <button
                        onClick={() => setRemoveTarget(u)}
                        disabled={isUpdating}
                        className="h-7 px-3 rounded-md text-xs text-red-400 bg-red-950/30 hover:bg-red-950/50 ring-1 ring-red-900/50 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        除名
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* モーダル */}
      {removeTarget && (
        <RemoveConfirm
          target={removeTarget}
          onClose={() => setRemoveTarget(null)}
          onConfirm={() => handleRemove(removeTarget)}
        />
      )}
    </div>
  );
}
