import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeApiTokens, createApiToken, revokeApiToken } from '../lib/firestore';
import type { ApiToken, ApiTokenType } from '../types';
import { CustomSelect } from '../components/CustomSelect';

// ── helpers ──────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const typeLabel: Record<ApiTokenType, string> = {
  registration: '登録用',
  device:       'デバイス用',
};

const typeBadge: Record<ApiTokenType, string> = {
  registration: 'text-green-400 bg-green-950/40 ring-1 ring-green-900/50',
  device:       'text-blue-400 bg-blue-950/40 ring-1 ring-blue-900/50',
};

const filterTypeOptions = [
  { value: '',             label: '種別' },
  { value: 'registration', label: '登録用' },
  { value: 'device',       label: 'デバイス用' },
];

const filterStatusOptions = [
  { value: '',        label: '状態' },
  { value: 'active',  label: '有効' },
  { value: 'revoked', label: '失効済み' },
];

function formatDate(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── ページネーション ───────────────────────────────────────────────

function Pagination({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 pt-3">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 1}
        className="h-7 w-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-white hover:bg-[#2a2a2a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
        aria-label="前のページ"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <span className="text-xs text-zinc-500 tabular-nums">{page} / {pages}</span>
      <button
        onClick={() => onPage(page + 1)}
        disabled={page === pages}
        className="h-7 w-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-white hover:bg-[#2a2a2a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
        aria-label="次のページ"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
}

// ── トークン発行モーダル ──────────────────────────────────────────

interface CreateModalProps {
  onClose:   () => void;
  onCreated: (token: string) => void;
}

function CreateModal({ onClose, onCreated }: CreateModalProps) {
  const [name,    setName]    = useState('');
  const [type,    setType]    = useState<ApiTokenType>('registration');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const inputClass =
    'w-full bg-[#1a1a1a] ring-1 ring-[#3d3d3d] text-white rounded-lg px-3 h-9 text-sm outline-none focus:ring-[#4693ff] focus:ring-2 placeholder:text-zinc-600 transition-all';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('名前を入力してください。'); return; }
    setSaving(true);
    try {
      const { token } = await createApiToken(name.trim(), type);
      onCreated(token);
    } catch {
      setError('発行に失敗しました。');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-[#111111] ring-1 ring-[#3d3d3d] rounded-xl w-full max-w-md p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <h2 className="text-white text-lg font-semibold mb-5">トークンを発行</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">名前</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="例: AM須坂 登録用" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">種別</label>
            <CustomSelect
              value={type}
              onChange={val => setType(val as ApiTokenType)}
              options={[
                { value: 'registration', label: '登録用（新規デバイス登録）' },
                { value: 'device',       label: 'デバイス用（ステータス送信）' },
              ]}
              className="w-full"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="h-9 px-4 rounded-lg text-sm text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] transition-colors cursor-pointer">
              キャンセル
            </button>
            <button type="submit" disabled={saving}
              className="h-9 px-4 rounded-lg text-sm font-medium text-white bg-[#4693ff] hover:bg-[#3a7fe0] disabled:opacity-50 transition-colors cursor-pointer">
              {saving ? '発行中...' : '発行する'}
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
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-[#111111] ring-1 ring-[#3d3d3d] rounded-xl w-full max-w-lg p-6 shadow-2xl">
        <h2 className="text-white text-lg font-semibold mb-2">トークンを保存してください</h2>
        <p className="text-zinc-400 text-sm mb-4">
          このトークンは今後二度と表示されません。必ずコピーして安全な場所に保管してください。
        </p>
        <div className="flex items-center gap-2 bg-[#0d0d0d] ring-1 ring-[#3d3d3d] rounded-lg px-3 py-2.5 mb-5">
          <code className="flex-1 text-xs text-green-400 font-mono break-all">{token}</code>
          <button onClick={handleCopy}
            className="shrink-0 h-7 px-3 rounded-md text-xs text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] transition-colors cursor-pointer">
            {copied ? 'コピー済み' : 'コピー'}
          </button>
        </div>
        <div className="flex justify-end">
          <button onClick={onClose}
            className="h-9 px-4 rounded-lg text-sm font-medium text-white bg-[#4693ff] hover:bg-[#3a7fe0] transition-colors cursor-pointer">
            保存しました
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
        <h2 className="text-white text-lg font-semibold mb-2">トークンを失効</h2>
        <p className="text-zinc-400 text-sm mb-5">
          「{token.name}」を失効します。<br />
          このトークンを使用しているデバイスは認証できなくなります。
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="h-9 px-4 rounded-lg text-sm text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] transition-colors cursor-pointer">
            キャンセル
          </button>
          <button onClick={handle} disabled={running}
            className="h-9 px-4 rounded-lg text-sm font-medium text-white bg-[#e81403] hover:bg-[#b20f03] disabled:opacity-50 transition-colors cursor-pointer">
            {running ? '処理中...' : '失効する'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── メインページ ──────────────────────────────────────────────────

export function ApiTokens() {
  const { role } = useAuth();
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
          <p className="text-zinc-400 text-sm">このページは管理者以上のみアクセスできます。</p>
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
  function TokenCard({ t }: { t: ApiToken }) {
    const isRevoked = !!t.revokedAt;
    return (
      <div className="bg-[#111111] ring-1 ring-[#3d3d3d] rounded-xl px-4 py-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <span className={`text-sm font-semibold leading-snug truncate flex-1 ${isRevoked ? 'text-zinc-500 line-through' : 'text-white'}`}>
            {t.name}
          </span>
          <span className={`shrink-0 inline-flex items-center h-5 px-2 rounded-full text-xs font-medium ${typeBadge[t.type]}`}>
            {typeLabel[t.type]}
          </span>
        </div>
        <div className="space-y-0.5 mb-3">
          <p className="text-zinc-500 text-xs">発行: {formatDate(t.createdAt)}</p>
          <p className="text-zinc-500 text-xs">最終使用: {formatDate(t.lastUsedAt)}</p>
        </div>
        <div className="flex items-center justify-between">
          <span className={`text-xs font-medium ${isRevoked ? 'text-zinc-600' : 'text-green-400'}`}>
            {isRevoked ? '失効済み' : '有効'}
          </span>
          {!isRevoked && (
            <button onClick={() => setRevokeTarget(t)}
              className="h-7 px-3 rounded-md text-xs text-red-400 bg-red-950/30 hover:bg-red-950/50 ring-1 ring-red-900/50 transition-colors cursor-pointer">
              失効
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── デスクトップ行 ─────────────────────────────────────────────────
  function TokenRow({ t }: { t: ApiToken }) {
    const isRevoked = !!t.revokedAt;
    return (
      <div className="grid grid-cols-[1fr_90px_160px_160px_100px_80px] gap-4 px-4 py-3.5 items-center bg-[#111111] hover:bg-[#161616] transition-colors border-b border-[#3d3d3d] last:border-b-0">
        <span className={`text-sm font-medium truncate ${isRevoked ? 'text-zinc-500 line-through' : 'text-white'}`}>
          {t.name}
        </span>
        <span className={`inline-flex items-center justify-center h-5 px-2 rounded-full text-xs font-medium w-fit ${typeBadge[t.type]}`}>
          {typeLabel[t.type]}
        </span>
        <span className="text-zinc-400 text-xs tabular-nums">{formatDate(t.createdAt)}</span>
        <span className="text-zinc-400 text-xs tabular-nums">{formatDate(t.lastUsedAt)}</span>
        <span className={`text-xs font-medium ${isRevoked ? 'text-zinc-600' : 'text-green-400'}`}>
          {isRevoked ? '失効済み' : '有効'}
        </span>
        <div className="flex justify-end">
          {!isRevoked && (
            <button onClick={() => setRevokeTarget(t)}
              className="h-7 px-3 rounded-md text-xs text-red-400 bg-red-950/30 hover:bg-red-950/50 ring-1 ring-red-900/50 transition-colors cursor-pointer">
              失効
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
          <h1 className="text-white text-3xl font-semibold leading-tight">API トークン</h1>
          <p className="text-[#999999] text-base">デバイス認証用トークンの発行・管理</p>
        </div>
        {canEdit && (
          <div ref={headerMenuRef} className="relative shrink-0 mt-2">
            <button
              onClick={() => setHeaderMenuOpen(o => !o)}
              className="w-8 h-8 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-[#2a2a2a] transition-colors cursor-pointer"
              aria-label="メニュー"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>
            {headerMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-[#1a1a1a] ring-1 ring-[#3d3d3d] rounded-lg shadow-xl overflow-hidden z-10">
                <button
                  onClick={() => { setHeaderMenuOpen(false); setCreateOpen(true); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-[#2a2a2a] transition-colors cursor-pointer flex items-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  トークンを発行
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Desktop header */}
      <div className="hidden sm:flex items-start justify-between gap-4 py-6 px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-white text-3xl font-semibold">API トークン</h1>
          <p className="text-[#999999] text-base">デバイス認証用トークンの発行・管理</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium text-white bg-[#4693ff] hover:bg-[#3a7fe0] transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            トークンを発行
          </button>
        )}
      </div>

      {/* フィルターバー */}
      <div className="px-4 sm:px-6 pb-2 flex gap-2">
        <CustomSelect
          value={filterType}
          onChange={v => setFilterType(v)}
          options={filterTypeOptions}
          className="w-32"
        />
        <CustomSelect
          value={filterStatus}
          onChange={v => setFilterStatus(v)}
          options={filterStatusOptions}
          className="w-32"
        />
      </div>

      <div className="px-4 sm:px-6 pt-4 pb-8 space-y-6">
        {loading ? (
          <div className="rounded-lg bg-[#111111] ring-1 ring-[#3d3d3d] p-12 text-center">
            <p className="text-zinc-500 text-sm">読み込み中...</p>
          </div>
        ) : (
          <>
            {/* 有効なトークン */}
            <div>
              <p className="text-sm font-medium text-zinc-400 mb-2">有効 <span className="text-zinc-600">({active.length})</span></p>
              {active.length === 0 ? (
                <div className="rounded-lg bg-[#111111] ring-1 ring-[#3d3d3d] p-8 text-center">
                  <p className="text-zinc-500 text-sm">有効なトークンがありません。</p>
                </div>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-4">
                    {activeSlice.map(t => <TokenCard key={t.id} t={t} />)}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-hidden rounded-lg ring-1 ring-[#3d3d3d]">
                    <div className="grid grid-cols-[1fr_90px_160px_160px_100px_80px] gap-4 px-4 py-3 bg-black border-b border-[#3d3d3d] text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      <span>名前</span><span>種別</span><span>発行日時</span><span>最終使用</span><span>状態</span><span />
                    </div>
                    {activeSlice.map(t => <TokenRow key={t.id} t={t} />)}
                  </div>
                  <Pagination page={activePage} total={active.length} onPage={setActivePage} />
                </>
              )}
            </div>

            {/* 失効済みトークン */}
            {revoked.length > 0 && (
              <div>
                <p className="text-sm font-medium text-zinc-400 mb-2">失効済み <span className="text-zinc-600">({revoked.length})</span></p>
                <>
                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-4">
                    {revokedSlice.map(t => <TokenCard key={t.id} t={t} />)}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-hidden rounded-lg ring-1 ring-[#3d3d3d]">
                    <div className="grid grid-cols-[1fr_90px_160px_160px_100px_80px] gap-4 px-4 py-3 bg-black border-b border-[#3d3d3d] text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      <span>名前</span><span>種別</span><span>発行日時</span><span>最終使用</span><span>状態</span><span />
                    </div>
                    {revokedSlice.map(t => <TokenRow key={t.id} t={t} />)}
                  </div>
                  <Pagination page={revokedPage} total={revoked.length} onPage={setRevokedPage} />
                </>
              </div>
            )}
          </>
        )}
      </div>

      {createOpen && (
        <CreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={token => { setCreateOpen(false); setRevealToken(token); }}
        />
      )}
      {revealToken && (
        <TokenReveal token={revealToken} onClose={() => setRevealToken(null)} />
      )}
      {revokeTarget && (
        <RevokeConfirm
          token={revokeTarget}
          onClose={() => setRevokeTarget(null)}
          onConfirm={() => revokeApiToken(revokeTarget.id)}
        />
      )}
    </div>
  );
}
