import { useState, useEffect } from 'react';
import { subscribeSiteLogs } from '../lib/firestore';
import type { SiteLog, SiteLogCategory } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';
import { Pagination } from '../components/Pagination';

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

// デバイスレベルの操作カテゴリ（プロジェクト欄は projectName、デバイス欄は deviceName で表示）
const DEVICE_CATEGORIES: SiteLogCategory[] = ['screenshot', 'log', 'device'];

function resolveColumns(log: SiteLog) {
  const isDevice = DEVICE_CATEGORIES.includes(log.category);
  return {
    projectCol: log.projectName || (isDevice ? '—' : log.targetName),
    deviceCol:  log.deviceName  || (isDevice ? log.targetName : '—'),
  };
}

// ── タブ ─────────────────────────────────────────────────────────

type Tab = 'site' | 'device';

// ── メインページ ──────────────────────────────────────────────────

export function Logs() {
  usePageTitle('ログ');
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
      <div className="flex items-start justify-between gap-4 py-6 px-4 sm:px-6 border-b border-[#3d3d3d]">
        <div className="flex flex-col gap-2">
          <h1 className="text-white text-3xl font-semibold leading-tight">ログ</h1>
          <p className="text-[#999999] text-base">操作履歴とデバイスログの確認</p>
        </div>
      </div>

      {/* タブ */}
      <header className="flex items-center h-[58px] gap-3 px-4 sm:px-6 border-b border-[#3d3d3d] bg-black">
        <div className="relative isolate min-w-0 font-medium">
          <div role="tablist" className="relative flex min-w-0 shrink items-stretch overflow-x-auto rounded-lg bg-[#222222] px-0.5 ring-1 ring-[#3d3d3d] h-9">
            <button
              onClick={() => setTab('site')}
              style={{ cursor: 'pointer' }}
              className={`no-underline relative z-2 flex items-center whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4693ff] text-base my-0.5 rounded-md px-2.5 transition-colors ${
                tab === 'site'
                  ? 'bg-[#111111] text-white shadow-sm ring-1 ring-[#3d3d3d]'
                  : 'bg-transparent text-[#999999] hover:text-white'
              }`}
            >
              操作ログ
            </button>
            <button
              onClick={() => setTab('device')}
              style={{ cursor: 'pointer' }}
              className={`no-underline relative z-2 flex items-center whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4693ff] text-base my-0.5 rounded-md px-2.5 transition-colors ${
                tab === 'device'
                  ? 'bg-[#111111] text-white shadow-sm ring-1 ring-[#3d3d3d]'
                  : 'bg-transparent text-[#999999] hover:text-white'
              }`}
            >
              デバイスログ
            </button>
          </div>
        </div>
      </header>

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
              {/* モバイルカード */}
              <div className="sm:hidden space-y-4">
                {paged.map(log => {
                  const { projectCol, deviceCol } = resolveColumns(log);
                  return (
                    <div key={log.id} className="rounded-lg bg-[#111111] ring-1 ring-[#3d3d3d] p-4 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`inline-flex items-center h-5 px-2 rounded-full text-xs font-medium ${categoryBadge[log.category]}`}>
                          {categoryLabel[log.category]}
                        </span>
                        <span className="text-zinc-500 text-xs tabular-nums">{formatDate(log.performedAt)}</span>
                      </div>
                      <p className="text-white text-sm">{actionLabel[`${log.category}.${log.action}`] ?? log.action}</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div>
                          <span className="text-zinc-600">プロジェクト</span>
                          <p className="text-zinc-300 truncate mt-0.5">{projectCol}</p>
                        </div>
                        <div>
                          <span className="text-zinc-600">デバイス</span>
                          <p className="text-zinc-300 truncate mt-0.5">{deviceCol}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center shrink-0 text-white text-[10px] font-medium">
                          {log.performedBy.displayName[0]?.toUpperCase() ?? '?'}
                        </div>
                        <span className="text-zinc-400 text-xs truncate">{log.performedBy.displayName}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* デスクトップテーブル */}
              <div className="hidden sm:block overflow-hidden rounded-lg ring-1 ring-[#3d3d3d]">
                <div className="grid grid-cols-[120px_1fr_1fr_1fr_1fr_160px] gap-4 px-4 py-3 bg-black border-b border-[#3d3d3d] text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  <span>種別</span>
                  <span>操作</span>
                  <span>プロジェクト</span>
                  <span>デバイス</span>
                  <span>実行者</span>
                  <span>日時</span>
                </div>
                {paged.map((log, i) => {
                  const { projectCol, deviceCol } = resolveColumns(log);
                  return (
                    <div
                      key={log.id}
                      className={`grid grid-cols-[120px_1fr_1fr_1fr_1fr_160px] gap-4 px-4 py-3.5 items-center bg-[#111111] hover:bg-[#161616] transition-colors ${
                        i < paged.length - 1 ? 'border-b border-[#3d3d3d]' : ''
                      }`}
                    >
                      <span className={`inline-flex items-center justify-center h-5 px-2 rounded-full text-xs font-medium w-fit ${categoryBadge[log.category]}`}>
                        {categoryLabel[log.category]}
                      </span>
                      <span className="text-white text-sm">
                        {actionLabel[`${log.category}.${log.action}`] ?? log.action}
                      </span>
                      <span className="text-zinc-400 text-sm truncate">{projectCol}</span>
                      <span className="text-zinc-400 text-sm truncate">{deviceCol}</span>
                      <span className="text-zinc-400 text-sm truncate">{log.performedBy.displayName}</span>
                      <span className="text-zinc-500 text-xs tabular-nums">{formatDate(log.performedAt)}</span>
                    </div>
                  );
                })}
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
