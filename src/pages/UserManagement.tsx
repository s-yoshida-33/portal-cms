import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { subscribeUserRoles, setUserRole, removeUserRole, addSiteLog } from '../lib/firestore';
import type { UserRoleRecord, UserRole } from '../types';
import { CustomSelect } from '../components/CustomSelect';
import { usePageTitle } from '../hooks/usePageTitle';
import { useFormatDate } from '../hooks/useFormatDate';

// ── helpers ──────────────────────────────────────────────────────

const roleBadge: Record<UserRole, string> = {
  owner: 'text-yellow-400 bg-yellow-950/40 ring-1 ring-yellow-900/50',
  admin: 'text-blue-400 bg-blue-950/40 ring-1 ring-blue-900/50',
  user:  'text-[var(--text-dim)] bg-[var(--bg-subtle)]/60 ring-1 ring-[var(--border)]/50',
};

// ── 除名確認モーダル ──────────────────────────────────────────────

interface RemoveConfirmProps {
  target:    UserRoleRecord;
  onClose:   () => void;
  onConfirm: () => Promise<void>;
}

function RemoveConfirm({ target, onClose, onConfirm }: RemoveConfirmProps) {
  const { t } = useTranslation();
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
        <h2 className="text-[var(--text)] text-lg font-semibold mb-2">{t('users.removeModal.title')}</h2>
        <p className="text-[var(--text-dim)] text-sm mb-5">
          {t('users.removeModal.body', { name: target.displayName, email: target.email })}
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="h-9 px-4 rounded-lg text-sm text-[var(--text-muted)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]/60 ring-1 ring-[var(--border)] transition-colors cursor-pointer">
            {t('common.cancel')}
          </button>
          <button onClick={handle} disabled={running}
            className="h-9 px-4 rounded-lg text-sm font-medium text-[var(--text)] bg-[var(--danger)] hover:bg-[var(--danger-hover)] disabled:opacity-50 transition-colors cursor-pointer">
            {running ? t('common.processing') : t('users.removeModal.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── メインページ ──────────────────────────────────────────────────

export function UserManagement() {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  usePageTitle(t('users.title'));
  const { user, role } = useAuth();

  const roleLabel: Record<UserRole, string> = {
    owner: t('users.roleLabel.owner'),
    admin: t('users.roleLabel.admin'),
    user:  t('users.roleLabel.user'),
  };

  function siteLogActor() {
    return { uid: user?.uid ?? '', email: user?.email ?? '', displayName: user?.displayName ?? '' };
  }
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
          <p className="text-[var(--text-dim)] text-sm">{t('users.accessDenied')}</p>
        </div>
      </div>
    );
  }

  async function handleRoleChange(target: UserRoleRecord, newRole: UserRole) {
    setUpdating(target.uid);
    try {
      await setUserRole(target.uid, { ...target, role: newRole });
      addSiteLog({ category: 'user', action: 'roleChanged', targetId: target.uid, targetName: target.displayName, performedBy: siteLogActor() }).catch(() => {});
    } finally {
      setUpdating(null);
    }
  }

  async function handleRemove(target: UserRoleRecord) {
    await removeUserRole(target.uid);
    addSiteLog({ category: 'user', action: 'removed', targetId: target.uid, targetName: target.displayName, performedBy: siteLogActor() }).catch(() => {});
  }

  return (
    <div className="flex flex-col min-h-full">

      {/* ページヘッダー */}
      <div className="flex items-start justify-between gap-4 py-6 px-4 sm:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-[var(--text)] text-3xl font-semibold leading-tight">{t('users.title')}</h1>
          <p className="text-[var(--text-muted)] text-base">{t('users.description')}</p>
        </div>
        {!loading && (
          <span className="text-sm text-[var(--text-faint)] mt-1">{t('users.count', { count: users.length })}</span>
        )}
      </div>

      {/* コンテンツ */}
      <div className="px-4 sm:px-6 pt-8 pb-8">
        {loading ? (
          <div className="overflow-hidden rounded-lg bg-[var(--bg-surface)] ring-1 ring-[var(--border)] p-12 text-center">
            <p className="text-[var(--text-faint)] text-sm">{t('common.loading')}</p>
          </div>
        ) : users.length === 0 ? (
          <div className="overflow-hidden rounded-lg bg-[var(--bg-surface)] ring-1 ring-[var(--border)] p-12 text-center">
            <p className="text-[var(--text-faint)] text-sm">{t('users.noUsers')}</p>
          </div>
        ) : (
          <>
            {/* ── モバイルカード ── */}
            <div className="sm:hidden space-y-4">
              {users.map(u => {
                const isSelf     = u.uid === user?.uid;
                const isUpdating = updating === u.uid;
                return (
                  <div key={u.uid} className="bg-[var(--bg-surface)] ring-1 ring-[var(--border)] rounded-xl p-4">
                    {/* アバター + 表示名 + ロール */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center shrink-0 text-[var(--text)] text-sm font-medium">
                          {u.displayName[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[var(--text)] text-sm font-medium truncate">
                            {u.displayName}
                            {isSelf && <span className="ml-1.5 text-[var(--text-faint)] text-xs">{t('users.self')}</span>}
                          </div>
                          <div className="text-[var(--text-faint)] text-xs truncate mt-0.5">{u.email}</div>
                        </div>
                      </div>
                      {isSelf ? (
                        <span className={`inline-flex items-center justify-center h-5 px-2 rounded-full text-xs font-medium shrink-0 ${roleBadge[u.role]}`}>
                          {roleLabel[u.role]}
                        </span>
                      ) : (
                        <CustomSelect
                          value={u.role}
                          disabled={isUpdating}
                          onChange={val => handleRoleChange(u, val as UserRole)}
                          options={[
                            { value: 'owner', label: t('users.roleLabel.owner') },
                            { value: 'admin', label: t('users.roleLabel.admin') },
                            { value: 'user',  label: t('users.roleLabel.user') },
                          ]}
                          className="w-28 shrink-0"
                        />
                      )}
                    </div>
                    {/* 登録日 + 除名ボタン */}
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-faint)] text-xs tabular-nums">{t('users.registered', { date: formatDate(u.assignedAt, true) })}</span>
                      {!isSelf && (
                        <button
                          onClick={() => setRemoveTarget(u)}
                          disabled={isUpdating}
                          className="h-7 px-3 rounded-md text-xs text-[var(--danger-text)] bg-[var(--danger-text)]/5 hover:bg-[var(--danger-text)]/10 ring-1 ring-[var(--danger-text)]/20 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {t('users.removeBtn')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── PCテーブル ── */}
            <div className="hidden sm:block rounded-lg ring-1 ring-[var(--border)]">
              {/* テーブルヘッダー */}
              <div className="grid grid-cols-[1fr_1fr_160px_120px_120px] gap-4 px-4 py-3 bg-[var(--bg-base)] rounded-t-lg border-b border-[var(--border)] text-xs font-medium text-[var(--text-faint)] uppercase tracking-wider">
                <span>{t('users.table.displayName')}</span>
                <span>{t('users.table.email')}</span>
                <span>{t('users.table.role')}</span>
                <span>{t('users.table.registeredAt')}</span>
                <span />
              </div>

              {users.map((u, i) => {
                const isSelf     = u.uid === user?.uid;
                const isUpdating = updating === u.uid;

                return (
                  <div
                    key={u.uid}
                    className={`grid grid-cols-[1fr_1fr_160px_120px_120px] gap-4 px-4 py-3.5 items-center bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]/60 transition-colors ${
                      i < users.length - 1 ? 'border-b border-[var(--border)]' : 'rounded-b-lg'
                    }`}
                  >
                    {/* 表示名 */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-[var(--accent)] flex items-center justify-center shrink-0 text-[var(--text)] text-xs font-medium">
                        {u.displayName[0]?.toUpperCase() ?? '?'}
                      </div>
                      <span className="text-[var(--text)] text-sm truncate">
                        {u.displayName}
                        {isSelf && <span className="ml-1.5 text-[var(--text-faint)] text-xs">{t('users.self')}</span>}
                      </span>
                    </div>
                    {/* メール */}
                    <span className="text-[var(--text-dim)] text-sm truncate">{u.email}</span>
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
                          { value: 'owner', label: t('users.roleLabel.owner') },
                          { value: 'admin', label: t('users.roleLabel.admin') },
                          { value: 'user',  label: t('users.roleLabel.user') },
                        ]}
                        className="w-36"
                      />
                    )}
                    {/* 登録日 */}
                    <span className="text-[var(--text-faint)] text-xs tabular-nums">{formatDate(u.assignedAt, true)}</span>
                    {/* 操作 */}
                    <div className="flex justify-end">
                      {!isSelf && (
                        <button
                          onClick={() => setRemoveTarget(u)}
                          disabled={isUpdating}
                          className="h-7 px-3 rounded-md text-xs text-[var(--danger-text)] bg-[var(--danger-text)]/5 hover:bg-[var(--danger-text)]/10 ring-1 ring-[var(--danger-text)]/20 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {t('users.removeBtn')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
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
