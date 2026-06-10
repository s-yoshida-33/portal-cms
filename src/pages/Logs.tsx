import { useState, useEffect } from 'react';
import { subscribeSiteLogs } from '../lib/firestore';
import type { SiteLog, SiteLogCategory } from '../types';

// ── helpers ──────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const categoryLabel: Record<SiteLogCategory, string> = {
  screenshot:      'スクリーンショット',
  log:             'ログ',
  apiToken:        'APIトークン',
  user:            'ユーザー',
  deletionRequest: '削除依頼',
  project:         'プロジェクト',
  device:          'デバイス',
};

const categoryBadge: Record<SiteLogCategory, string> = {
  screenshot:      'text-cyan-400 bg-cyan-950/40 ring-1 ring-cyan-900/50',
  log:             'text-indigo-400 bg-indigo-950/40 ring-1 ring-indigo-900/50',
  apiToken:        'text-purple-400 bg-purple-950/40 ring-1 ring-purple-900/50',
  user:            'text-yellow-400 bg-yellow-950/40 ring-1 ring-yellow-900/50',
  deletionRequest: 'text-red-400 bg-red-950/40 ring-1 ring-red-900/50',
  project:         'text-orange-400 bg-orange-950/40 ring-1 ring-orange-900/50',
  device:          'text-blue-400 bg-blue-950/40 ring-1 ring-blue-900/50',
};

const actionLabel: Record<string, string> = {
  'screenshot.captured':          'スクリーンショットを取得',
  'screenshot.downloaded':        'スクリーンショットをダウンロード',
  'log.fetched':                  'ログを取得',
  'log.downloaded':               'ログをダウンロード',
  'apiToken.issued':              'APIトークンを発行',
  'apiToken.revoked':             'APIトークンを失効',
  'user.added':                   'ユーザーを追加',
  'user.roleChanged':             'ロールを変更',
  'user.removed':                 'ユーザーを除名',
  'deletionRequest.approved':     '削除依頼を承認',
  'deletionRequest.rejected':     '削除依頼を却下',
  'project.created':              'プロジェクトを作成',
  'project.updated':              'プロジェクトを更新',
  'project.deletionRequested':    'プロジェクトの削除を依頼',
  'device.added':                 'デバイスを追加',
  'device.deletionRequested':     'デバイスの削除を依頼',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// ── ページネーション ──────────────────────────────────────────────

interface PaginationProps {
  page:     number;
  total:    number;
  pageSize: number;
  onChange: (p: number) => void;
}

function Pagination({ page, total, pageSize, onChange }: PaginationProps) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (last <= 1) return null;
  const btn = (label: string, target: number, disabled: boolean) => (
    <button
      onClick={() => onChange(target)}
      disabled={disabled}
      className="h-7 min-w-7 px-2 rounded-md text-xs text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-center justify-between mt-4">
      <span className="text-zinc-500 text-xs">{total} 件中 {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} 件</span>
      <div className="flex gap-1">
        {btn('«', 1,        page === 1)}
        {btn('‹', page - 1, page === 1)}
        <span className="h-7 px-2 flex items-center text-xs text-zinc-400">{page} / {last}</span>
        {btn('›', page + 1, page === last)}
        {btn('»', last,     page === last)}
      </div>
    </div>
  );
}

// ── タブ ─────────────────────────────────────────────────────────

type Tab = 'site' | 'device';

// ── メインページ ──────────────────────────────────────────────────

export function Logs() {
  const [tab,     setTab]     = useState<Tab>('site');
  const [logs,    setLogs]    = useState<SiteLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);

  useEffect(() => {
    const unsub = subscribeSiteLogs(
      data => { setLogs(data); setLoading(false); },
      ()   => setLoading(false),
    );
    return unsub;
  }, []);

  useEffect(() => { setPage(1); }, [logs]);

  const paged = logs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="flex flex-col min-h-full">

      {/* ページヘッダー */}
      <div className="flex items-start justify-between gap-4 py-6 px-4 sm:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-white text-3xl font-semibold leading-tight">ログ</h1>
          <p className="text-[#999999] text-base">操作履歴とデバイスログの確認</p>
        </div>
      </div>

      {/* タブ */}
      <div className="px-4 sm:px-6 border-b border-[#3d3d3d]">
        <div className="flex gap-1">
          {([
            { key: 'site',   label: '操作ログ',   enabled: true  },
            { key: 'device', label: 'デバイスログ', enabled: false },
          ] as { key: Tab; label: string; enabled: boolean }[]).map(t => (
            <button
              key={t.key}
              onClick={() => t.enabled && setTab(t.key)}
              disabled={!t.enabled}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? 'text-white border-white'
                  : t.enabled
                    ? 'text-zinc-500 border-transparent hover:text-zinc-300 cursor-pointer'
                    : 'text-zinc-700 border-transparent cursor-not-allowed'
              }`}
            >
              {t.label}
              {!t.enabled && <span className="ml-1.5 text-zinc-700 text-xs font-normal">準備中</span>}
            </button>
          ))}
        </div>
      </div>

      {/* コンテンツ */}
      <div className="px-4 sm:px-6 pt-6 pb-8">

        {tab === 'site' && (
          loading ? (
            <div className="overflow-hidden rounded-lg bg-[#111111] ring-1 ring-[#3d3d3d] p-12 text-center">
              <p className="text-zinc-500 text-sm">読み込み中...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="overflow-hidden rounded-lg bg-[#111111] ring-1 ring-[#3d3d3d] p-12 text-center">
              <p className="text-zinc-500 text-sm">操作ログはまだありません。</p>
            </div>
          ) : (
            <>
              {/* テーブル */}
              <div className="overflow-hidden rounded-lg ring-1 ring-[#3d3d3d]">
                <div className="grid grid-cols-[120px_1fr_1fr_1fr_160px] gap-4 px-4 py-3 bg-black border-b border-[#3d3d3d] text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  <span>種別</span>
                  <span>操作</span>
                  <span>対象</span>
                  <span>実行者</span>
                  <span>日時</span>
                </div>
                {paged.map((log, i) => (
                  <div
                    key={log.id}
                    className={`grid grid-cols-[120px_1fr_1fr_1fr_160px] gap-4 px-4 py-3.5 items-center bg-[#111111] hover:bg-[#161616] transition-colors ${
                      i < paged.length - 1 ? 'border-b border-[#3d3d3d]' : ''
                    }`}
                  >
                    <span className={`inline-flex items-center justify-center h-5 px-2 rounded-full text-xs font-medium w-fit ${categoryBadge[log.category]}`}>
                      {categoryLabel[log.category]}
                    </span>
                    <span className="text-white text-sm">
                      {actionLabel[`${log.category}.${log.action}`] ?? log.action}
                    </span>
                    <span className="text-zinc-400 text-sm truncate">{log.targetName}</span>
                    <span className="text-zinc-400 text-sm truncate">{log.performedBy.displayName}</span>
                    <span className="text-zinc-500 text-xs tabular-nums">{formatDate(log.performedAt)}</span>
                  </div>
                ))}
              </div>
              <Pagination page={page} total={logs.length} pageSize={PAGE_SIZE} onChange={setPage} />
            </>
          )
        )}

        {tab === 'device' && (
          <div className="overflow-hidden rounded-lg bg-[#111111] ring-1 ring-[#3d3d3d] p-12 text-center">
            <p className="text-zinc-500 text-sm">デバイスログは準備中です。</p>
          </div>
        )}
      </div>
    </div>
  );
}
