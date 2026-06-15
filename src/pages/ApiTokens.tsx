import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { subscribeApiTokens, createApiToken, revokeApiToken, addSiteLog } from '../lib/firestore';
import type { ApiToken, ApiTokenType } from '../types';
import { CustomSelect } from '../components/CustomSelect';
import { usePageTitle } from '../hooks/usePageTitle';
import { Pagination } from '../components/Pagination';
import { useFormatDate } from '../hooks/useFormatDate';

// ── helpers ──────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const typeBadge: Record<ApiTokenType, string> = {
  registration: 'text-green-400 bg-green-500/10 ring-1 ring-green-500/20',
  device:       'text-blue-400 bg-blue-500/10 ring-1 ring-blue-500/20',
};

// ── ページネーション ───────────────────────────────────────────────


// ── トークン発行モーダル ──────────────────────────────────────────

interface CreateModalProps {
  onClose:   () => void;
  onCreated: (token: string, name: string, type: ApiTokenType) => void;
}

function CreateModal({ onClose, onCreated }: CreateModalProps) {
  const { t } = useTranslation();
  const [name,    setName]    = useState('');
  const [type,    setType]    = useState<ApiTokenType>('registration');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const inputClass =
    'w-full bg-[var(--bg-surface)] ring-1 ring-[var(--border)] text-[var(--text)] rounded-lg px-3 h-9 text-sm outline-none focus:ring-[var(--accent)] focus:ring-2 placeholder:text-[var(--text-faint)] transition-all';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError(t('apiTokens.createModal.nameRequired')); return; }
    setSaving(true);
    try {
      const { token } = await createApiToken(name.trim(), type);
      onCreated(token, name.trim(), type);
    } catch {
      setError(t('apiTokens.createModal.failed'));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-[var(--bg-surface)] ring-1 ring-[var(--border)] rounded-xl w-full max-w-md p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <h2 className="text-[var(--text)] text-lg font-semibold mb-5">{t('apiTokens.createModal.title')}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--text-dim)] mb-1.5">{t('apiTokens.createModal.nameLabel')}</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className={inputClass} />
          </div>
          <div>
            <label className="block text-sm text-[var(--text-dim)] mb-1.5">{t('apiTokens.createModal.typeLabel')}</label>
            <CustomSelect
              value={type}
              onChange={val => setType(val as ApiTokenType)}
              options={[
                { value: 'registration', label: t('apiTokens.createModal.registrationOption') },
                { value: 'device',       label: t('apiTokens.createModal.deviceOption') },
              ]}
              className="w-full"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="h-9 px-4 rounded-lg text-sm text-[var(--text-muted)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]/60 ring-1 ring-[var(--border)] transition-colors cursor-pointer">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving}
              className="h-9 px-4 rounded-lg text-sm font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors cursor-pointer">
              {saving ? t('apiTokens.createModal.issuing') : t('apiTokens.createModal.issueBtn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── トークン表示モーダル（発行直後の1回のみ） ────────────────────

interface TokenRevealProps {
  token:   string;
  onClose: () => void;
}

function TokenReveal({ token, onClose }: TokenRevealProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[var(--bg-surface)] ring-1 ring-[var(--border)] rounded-xl w-full max-w-lg p-6 shadow-2xl">
        <h2 className="text-[var(--text)] text-lg font-semibold mb-2">{t('apiTokens.revealModal.title')}</h2>
        <p className="text-[var(--text-dim)] text-sm mb-4">
          {t('apiTokens.revealModal.body')}
        </p>
        <div className="flex items-center gap-2 bg-[var(--bg-base)] ring-1 ring-[var(--border)] rounded-lg px-3 py-2.5 mb-5">
          <code className="flex-1 text-xs text-green-400 font-mono break-all">{token}</code>
          <button onClick={handleCopy}
            className="shrink-0 h-7 px-3 rounded-md text-xs text-[var(--text-muted)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]/60 ring-1 ring-[var(--border)] transition-colors cursor-pointer">
            {copied ? t('common.copied') : t('common.copy')}
          </button>
        </div>
        <div className="flex justify-end">
          <button onClick={onClose}
            className="h-9 px-4 rounded-lg text-sm font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors cursor-pointer">
            {t('apiTokens.revealModal.saved')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 失効確認モーダル ──────────────────────────────────────────────

interface RevokeConfirmProps {
  token:     ApiToken;
  onClose:   () => void;
  onConfirm: () => Promise<void>;
}

function RevokeConfirm({ token, onClose, onConfirm }: RevokeConfirmProps) {
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
        <h2 className="text-[var(--text)] text-lg font-semibold mb-2">{t('apiTokens.revokeModal.title')}</h2>
        <p className="text-[var(--text-dim)] text-sm mb-5">
          {t('apiTokens.revokeModal.body', { name: token.name })}
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="h-9 px-4 rounded-lg text-sm text-[var(--text-muted)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]/60 ring-1 ring-[var(--border)] transition-colors cursor-pointer">
            {t('common.cancel')}
          </button>
          <button onClick={handle} disabled={running}
            className="h-9 px-4 rounded-lg text-sm font-medium text-white bg-[var(--danger)] hover:bg-[var(--danger-hover)] disabled:opacity-50 transition-colors cursor-pointer">
            {running ? t('common.processing') : t('apiTokens.revokeModal.revoke')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── メインページ ──────────────────────────────────────────────────

export function ApiTokens() {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  usePageTitle(t('apiTokens.title'));
  const { user, role } = useAuth();

  function siteLogActor() {
    return { uid: user?.uid ?? '', email: user?.email ?? '', displayName: user?.displayName ?? '' };
  }
  const [tokens,         setTokens]         = useState<ApiToken[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [createOpen,     setCreateOpen]     = useState(false);
  const [revealToken,    setRevealToken]    = useState<string | null>(null);
  const [revokeTarget,   setRevokeTarget]   = useState<ApiToken | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [activePage,     setActivePage]     = useState(1);
  const [revokedPage,    setRevokedPage]    = useState(1);
  const [filterType,     setFilterType]     = useState('');
  const [filterStatus,   setFilterStatus]   = useState('');
  const headerMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribeApiTokens(ts => {
      setTokens(ts);
      setLoading(false);
      setActivePage(1);
      setRevokedPage(1);
    });
    return unsub;
  }, []);

  useEffect(() => {
    setActivePage(1);
    setRevokedPage(1);
  }, [filterType, filterStatus]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const canEdit = role === 'admin' || role === 'owner';

  if (!canEdit) {
    return (
      <div className="flex flex-col min-h-full">
        <div className="p-8">
          <p className="text-[var(--text-dim)] text-sm">{t('apiTokens.accessDenied')}</p>
        </div>
      </div>
    );
  }

  const filtered = tokens
    .filter(t => filterType   === '' || t.type === filterType)
    .filter(t => filterStatus === '' || (filterStatus === 'active' ? !t.revokedAt : !!t.revokedAt));

  const active  = filtered.filter(t => !t.revokedAt);
  const revoked = filtered.filter(t =>  t.revokedAt);

  const activeSlice  = active.slice((activePage  - 1) * PAGE_SIZE, activePage  * PAGE_SIZE);
  const revokedSlice = revoked.slice((revokedPage - 1) * PAGE_SIZE, revokedPage * PAGE_SIZE);

  // ── モバイルカード ────────────────────────────────────────────────
  function TokenCard({ t: tok }: { t: ApiToken }) {
    const isRevoked = !!tok.revokedAt;
    return (
      <div className="bg-[var(--bg-surface)] ring-1 ring-[var(--border)] rounded-xl px-4 py-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <span className={`text-sm font-semibold leading-snug truncate flex-1 ${isRevoked ? 'text-[var(--text-faint)] line-through' : 'text-[var(--text)]'}`}>
            {tok.name}
          </span>
          <span className={`shrink-0 inline-flex items-center h-5 px-2 rounded-full text-xs font-medium ${typeBadge[tok.type]}`}>
            {t(`apiTokens.typeLabel.${tok.type}`)}
          </span>
        </div>
        <div className="space-y-0.5 mb-3">
          <p className="text-[var(--text-faint)] text-xs">{t('apiTokens.table.issued')}: {formatDate(tok.createdAt)}</p>
          <p className="text-[var(--text-faint)] text-xs">{t('apiTokens.table.lastUsed')}: {formatDate(tok.lastUsedAt)}</p>
        </div>
        <div className="flex items-center justify-between">
          <span className={`text-xs font-medium ${isRevoked ? 'text-[var(--text-faint)]' : 'text-green-400'}`}>
            {isRevoked ? t('apiTokens.statusLabel.revoked') : t('apiTokens.statusLabel.active')}
          </span>
          {!isRevoked && (
            <button onClick={() => setRevokeTarget(tok)}
              className="h-7 px-3 rounded-md text-xs text-[var(--danger-text)] bg-[var(--danger-text)]/5 hover:bg-[var(--danger-text)]/10 ring-1 ring-[var(--danger-text)]/20 transition-colors cursor-pointer">
              {t('apiTokens.revokeBtn')}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── デスクトップ行 ─────────────────────────────────────────────────
  function TokenRow({ t: tok }: { t: ApiToken }) {
    const isRevoked = !!tok.revokedAt;
    return (
      <div className="grid grid-cols-[1fr_90px_160px_160px_100px_80px] gap-4 px-4 py-3.5 items-center bg-[var(--bg-surface)] transition-colors border-b border-[var(--border)] last:border-b-0">
        <span className={`text-sm font-medium truncate ${isRevoked ? 'text-[var(--text-faint)] line-through' : 'text-[var(--text)]'}`}>
          {tok.name}
        </span>
        <span className={`inline-flex items-center justify-center h-5 px-2 rounded-full text-xs font-medium w-fit ${typeBadge[tok.type]}`}>
          {t(`apiTokens.typeLabel.${tok.type}`)}
        </span>
        <span className="text-[var(--text-dim)] text-xs tabular-nums">{formatDate(tok.createdAt)}</span>
        <span className="text-[var(--text-dim)] text-xs tabular-nums">{formatDate(tok.lastUsedAt)}</span>
        <span className={`text-xs font-medium ${isRevoked ? 'text-[var(--text-faint)]' : 'text-green-400'}`}>
          {isRevoked ? t('apiTokens.statusLabel.revoked') : t('apiTokens.statusLabel.active')}
        </span>
        <div className="flex justify-end">
          {!isRevoked && (
            <button onClick={() => setRevokeTarget(tok)}
              className="h-7 px-3 rounded-md text-xs text-[var(--danger-text)] bg-[var(--danger-text)]/5 hover:bg-[var(--danger-text)]/10 ring-1 ring-[var(--danger-text)]/20 transition-colors cursor-pointer">
              {t('apiTokens.revokeBtn')}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">

      {/* Mobile header */}
      <div className="flex items-start gap-2 min-w-0 py-6 px-4 sm:hidden">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <h1 className="text-[var(--text)] text-3xl font-semibold leading-tight">{t('apiTokens.title')}</h1>
          <p className="text-[var(--text-muted)] text-base">{t('apiTokens.description')}</p>
        </div>
        {canEdit && (
          <div ref={headerMenuRef} className="relative shrink-0 mt-2">
            <button
              onClick={() => setHeaderMenuOpen(o => !o)}
              className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              aria-label={t('common.menu')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>
            {headerMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-[var(--bg-raised)] ring-1 ring-[var(--border)] rounded-lg shadow-xl overflow-hidden z-10">
                <button
                  onClick={() => { setHeaderMenuOpen(false); setCreateOpen(true); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer flex items-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  {t('apiTokens.issue')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Desktop header */}
      <div className="hidden sm:flex items-start justify-between gap-4 py-6 px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-[var(--text)] text-3xl font-semibold">{t('apiTokens.title')}</h1>
          <p className="text-[var(--text-muted)] text-base">{t('apiTokens.description')}</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t('apiTokens.issue')}
          </button>
        )}
      </div>

      {/* フィルターバー */}
      <div className="px-4 sm:px-6 pb-2 flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[var(--text-faint)] text-xs">{t('apiTokens.filterType')}</label>
          <CustomSelect
            value={filterType}
            onChange={v => setFilterType(v)}
            options={[
              { value: '',             label: t('common.all') },
              { value: 'registration', label: t('apiTokens.typeLabel.registration') },
              { value: 'device',       label: t('apiTokens.typeLabel.device') },
            ]}
            className="w-32"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[var(--text-faint)] text-xs">{t('apiTokens.filterStatus')}</label>
          <CustomSelect
            value={filterStatus}
            onChange={v => setFilterStatus(v)}
            options={[
              { value: '',        label: t('common.all') },
              { value: 'active',  label: t('apiTokens.statusLabel.active') },
              { value: 'revoked', label: t('apiTokens.statusLabel.revoked') },
            ]}
            className="w-32"
          />
        </div>
      </div>

      <div className="px-4 sm:px-6 pt-4 pb-8 space-y-6">
        {loading ? (
          <div className="rounded-lg bg-[var(--bg-surface)] ring-1 ring-[var(--border)] p-12 text-center">
            <p className="text-[var(--text-faint)] text-sm">{t('common.loading')}</p>
          </div>
        ) : (
          <>
            {/* 有効なトークン */}
            <div>
              <p className="text-sm font-medium text-[var(--text-dim)] mb-2">{t('apiTokens.active')} <span className="text-[var(--text-faint)]">({active.length})</span></p>
              {active.length === 0 ? (
                <div className="rounded-lg bg-[var(--bg-surface)] ring-1 ring-[var(--border)] p-8 text-center">
                  <p className="text-[var(--text-faint)] text-sm">{t('apiTokens.noActive')}</p>
                </div>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-4">
                    {activeSlice.map(t => <TokenCard key={t.id} t={t} />)}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-hidden rounded-lg ring-1 ring-[var(--border)]">
                    <div className="grid grid-cols-[1fr_90px_160px_160px_100px_80px] gap-4 px-4 py-3 bg-[var(--bg-base)] border-b border-[var(--border)] text-xs font-medium text-[var(--text-faint)] uppercase tracking-wider">
                      <span>{t('apiTokens.table.name')}</span><span>{t('apiTokens.table.type')}</span><span>{t('apiTokens.table.issued')}</span><span>{t('apiTokens.table.lastUsed')}</span><span>{t('apiTokens.table.status')}</span><span />
                    </div>
                    {activeSlice.map(t => <TokenRow key={t.id} t={t} />)}
                  </div>
                  <Pagination page={activePage} total={active.length} pageSize={PAGE_SIZE} onChange={setActivePage} />
                </>
              )}
            </div>

            {/* 失効済みトークン */}
            {revoked.length > 0 && (
              <div>
                <p className="text-sm font-medium text-[var(--text-dim)] mb-2">{t('apiTokens.revoked')} <span className="text-[var(--text-faint)]">({revoked.length})</span></p>
                <>
                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-4">
                    {revokedSlice.map(t => <TokenCard key={t.id} t={t} />)}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-hidden rounded-lg ring-1 ring-[var(--border)]">
                    <div className="grid grid-cols-[1fr_90px_160px_160px_100px_80px] gap-4 px-4 py-3 bg-[var(--bg-base)] border-b border-[var(--border)] text-xs font-medium text-[var(--text-faint)] uppercase tracking-wider">
                      <span>{t('apiTokens.table.name')}</span><span>{t('apiTokens.table.type')}</span><span>{t('apiTokens.table.issued')}</span><span>{t('apiTokens.table.lastUsed')}</span><span>{t('apiTokens.table.status')}</span><span />
                    </div>
                    {revokedSlice.map(t => <TokenRow key={t.id} t={t} />)}
                  </div>
                  <Pagination page={revokedPage} total={revoked.length} pageSize={PAGE_SIZE} onChange={setRevokedPage} />
                </>
              </div>
            )}
          </>
        )}
      </div>

      {createOpen && (
        <CreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={(token, tokenName, tokenType) => {
            setCreateOpen(false);
            setRevealToken(token);
            addSiteLog({ category: 'apiToken', action: 'issued', targetName: `${tokenName} (${tokenType})`, performedBy: siteLogActor() }).catch(() => {});
          }}
        />
      )}
      {revealToken && (
        <TokenReveal token={revealToken} onClose={() => setRevealToken(null)} />
      )}
      {revokeTarget && (
        <RevokeConfirm
          token={revokeTarget}
          onClose={() => setRevokeTarget(null)}
          onConfirm={async () => {
            await revokeApiToken(revokeTarget.id);
            addSiteLog({ category: 'apiToken', action: 'revoked', targetId: revokeTarget.id, targetName: revokeTarget.name, performedBy: siteLogActor() }).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

