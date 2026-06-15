import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { subscribeSiteLogs, subscribeProjects } from '../lib/firestore';
import type { SiteLog, SiteLogCategory, ProjectDoc } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';
import { Pagination } from '../components/Pagination';
import { CustomSelect } from '../components/CustomSelect';
import type { SelectOption } from '../components/CustomSelect';
import { DateRangePicker } from '../components/DateRangePicker';
import { useFormatDate } from '../hooks/useFormatDate';

// ── helpers ──────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const categoryBadge: Record<SiteLogCategory, string> = {
  screenshot:      'text-cyan-400 bg-cyan-950/40 ring-1 ring-cyan-900/50',
  log:             'text-indigo-400 bg-indigo-950/40 ring-1 ring-indigo-900/50',
  apiToken:        'text-purple-400 bg-purple-950/40 ring-1 ring-purple-900/50',
  user:            'text-yellow-400 bg-yellow-950/40 ring-1 ring-yellow-900/50',
  deletionRequest: 'text-red-400 bg-red-950/40 ring-1 ring-red-900/50',
  project:         'text-orange-400 bg-orange-950/40 ring-1 ring-orange-900/50',
  device:          'text-blue-400 bg-blue-950/40 ring-1 ring-blue-900/50',
};

const DEVICE_CATEGORIES: SiteLogCategory[] = ['screenshot', 'log', 'device'];

function resolveColumns(log: SiteLog) {
  const isDevice = DEVICE_CATEGORIES.includes(log.category);
  return {
    projectCol: log.projectName || (isDevice ? '—' : log.targetName),
    deviceCol:  log.deviceName  || (isDevice ? log.targetName : '—'),
  };
}

// ── フィルター ────────────────────────────────────────────────────

interface FilterState {
  category:  SiteLogCategory | '';
  projectId: string;
  dateFrom:  string;
  dateTo:    string;
}

const EMPTY_FILTER: FilterState = { category: '', projectId: '', dateFrom: '', dateTo: '' };

function hasActiveFilter(f: FilterState) {
  return f.category !== '' || f.projectId !== '' || f.dateFrom !== '' || f.dateTo !== '';
}

interface FilterBarProps {
  filter:   FilterState;
  projects: ProjectDoc[];
  onChange: (f: FilterState) => void;
  onClear:  () => void;
}

function FilterBar({ filter, projects, onChange, onClear }: FilterBarProps) {
  const { t } = useTranslation();
  const set = <K extends keyof FilterState>(key: K, val: FilterState[K]) =>
    onChange({ ...filter, [key]: val });

  const categoryOptions: SelectOption<SiteLogCategory | ''>[] = [
    { value: '', label: t('common.all') },
    { value: 'screenshot', label: t('logs.category.screenshot') },
    { value: 'log', label: t('logs.category.log') },
    { value: 'apiToken', label: t('logs.category.apiToken') },
    { value: 'user', label: t('logs.category.user') },
    { value: 'deletionRequest', label: t('logs.category.deletionRequest') },
    { value: 'project', label: t('logs.category.project') },
    { value: 'device', label: t('logs.category.device') },
  ];

  const projectOptions: SelectOption<string>[] = [
    { value: '', label: t('common.all') },
    ...projects.map(p => ({ value: p.id, label: p.name })),
  ];

  return (
    <div className="flex flex-wrap items-end gap-2 mb-4">

      {/* 種別 */}
      <div className="flex flex-col gap-1">
        <label className="text-[var(--text-faint)] text-xs">{t('logs.filter.type')}</label>
        <CustomSelect
          value={filter.category}
          onChange={v => set('category', v)}
          options={categoryOptions}
          className="w-[130px]"
        />
      </div>

      {/* プロジェクト */}
      <div className="flex flex-col gap-1">
        <label className="text-[var(--text-faint)] text-xs">{t('logs.filter.project')}</label>
        <CustomSelect
          value={filter.projectId}
          onChange={v => set('projectId', v)}
          options={projectOptions}
          className="w-[160px]"
        />
      </div>

      {/* 日付範囲 */}
      <div className="flex flex-col gap-1">
        <label className="text-[var(--text-faint)] text-xs">{t('logs.filter.date')}</label>
        <DateRangePicker
          mode="range"
          from={filter.dateFrom}
          to={filter.dateTo}
          onApply={(from, to) => onChange({ ...filter, dateFrom: from, dateTo: to })}
        />
      </div>

      {/* クリア */}
      {hasActiveFilter(filter) && (
        <button
          onClick={onClear}
          className="h-9 px-3 rounded-lg text-xs text-[var(--text-dim)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]/60 ring-1 ring-[var(--border)] transition-colors cursor-pointer"
        >
          {t('logs.filter.clear')}
        </button>
      )}
    </div>
  );
}

function applyFilter(logs: SiteLog[], filter: FilterState, projects: ProjectDoc[]): SiteLog[] {
  let result = logs;

  if (filter.category) {
    result = result.filter(l => l.category === filter.category);
  }

  if (filter.projectId) {
    const name = projects.find(p => p.id === filter.projectId)?.name ?? '';
    result = result.filter(l => l.projectName === name);
  }

  if (filter.dateFrom) {
    const from = new Date(filter.dateFrom).getTime();
    result = result.filter(l => new Date(l.performedAt).getTime() >= from);
  }

  if (filter.dateTo) {
    // 終了日の23:59:59まで含める
    const to = new Date(filter.dateTo).getTime() + 86399999;
    result = result.filter(l => new Date(l.performedAt).getTime() <= to);
  }

  return result;
}

// ── タブ ─────────────────────────────────────────────────────────

type Tab = 'site' | 'device';

// ── メインページ ──────────────────────────────────────────────────

export function Logs() {
  const { t, i18n } = useTranslation();
  const formatDate = useFormatDate();
  usePageTitle(t('logs.title'));
  const [tab,      setTab]      = useState<Tab>('site');
  const [logs,     setLogs]     = useState<SiteLog[]>([]);
  const [projects, setProjects] = useState<ProjectDoc[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(1);
  const [filter,   setFilter]   = useState<FilterState>(EMPTY_FILTER);

  useEffect(() => {
    const unsubLogs     = subscribeSiteLogs(data => { setLogs(data); setLoading(false); }, () => setLoading(false));
    const unsubProjects = subscribeProjects(setProjects);
    return () => { unsubLogs(); unsubProjects(); };
  }, []);

  const filtered = useMemo(() => applyFilter(logs, filter, projects), [logs, filter, projects]);

  // フィルターまたはログ変更でページを1に戻す
  useEffect(() => { setPage(1); }, [filtered]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleFilterChange(f: FilterState) {
    setFilter(f);
  }

  const categoryLabel: Record<SiteLogCategory, string> = {
    screenshot:      t('logs.category.screenshot'),
    log:             t('logs.category.log'),
    apiToken:        t('logs.category.apiToken'),
    user:            t('logs.category.user'),
    deletionRequest: t('logs.category.deletionRequest'),
    project:         t('logs.category.project'),
    device:          t('logs.category.device'),
  };

  function tAction(category: string, action: string): string {
    const key = `${category}.${action}`;
    const bundle = i18n.getResourceBundle(i18n.language, 'translation') as { logs?: { action?: Record<string, string> } } | null;
    return bundle?.logs?.action?.[key] ?? key;
  }

  return (
    <div className="flex flex-col min-h-full">

      {/* ページヘッダー */}
      <div className="flex items-start justify-between gap-4 py-6 px-4 sm:px-6 border-b border-[var(--border)]">
        <div className="flex flex-col gap-2">
          <h1 className="text-[var(--text)] text-3xl font-semibold leading-tight">{t('logs.title')}</h1>
          <p className="text-[var(--text-muted)] text-base">{t('logs.description')}</p>
        </div>
      </div>

      {/* タブ */}
      <header className="flex items-center h-[58px] gap-3 px-4 sm:px-6 border-b border-[var(--border)] bg-[var(--bg-base)]">
        <div className="relative isolate min-w-0 font-medium">
          <div role="tablist" className="relative flex min-w-0 shrink items-stretch overflow-x-auto rounded-lg bg-[var(--bg-subtle)] px-0.5 ring-1 ring-[var(--border)] h-9">
            <button
              onClick={() => setTab('site')}
              style={{ cursor: 'pointer' }}
              className={`no-underline relative z-2 flex items-center whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] text-base my-0.5 rounded-md px-2.5 transition-colors ${
                tab === 'site'
                  ? 'bg-[var(--bg-surface)] text-[var(--text)] shadow-sm ring-1 ring-[var(--border)]'
                  : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {t('logs.operationLogs')}
            </button>
            <button
              onClick={() => setTab('device')}
              style={{ cursor: 'pointer' }}
              className={`no-underline relative z-2 flex items-center whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] text-base my-0.5 rounded-md px-2.5 transition-colors ${
                tab === 'device'
                  ? 'bg-[var(--bg-surface)] text-[var(--text)] shadow-sm ring-1 ring-[var(--border)]'
                  : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {t('logs.deviceLogs')}
            </button>
          </div>
        </div>
      </header>

      {/* コンテンツ */}
      <div className="px-4 sm:px-6 pt-6 pb-8">

        {tab === 'site' && (
          loading ? (
            <div className="overflow-hidden rounded-lg bg-[var(--bg-surface)] ring-1 ring-[var(--border)] p-12 text-center">
              <p className="text-[var(--text-faint)] text-sm">{t('common.loading')}</p>
            </div>
          ) : (
            <>
              <FilterBar
                filter={filter}
                projects={projects}
                onChange={handleFilterChange}
                onClear={() => setFilter(EMPTY_FILTER)}
              />

              {filtered.length === 0 ? (
                <div className="overflow-hidden rounded-lg bg-[var(--bg-surface)] ring-1 ring-[var(--border)] p-12 text-center">
                  <p className="text-[var(--text-faint)] text-sm">
                    {hasActiveFilter(filter) ? t('logs.filter.noMatch') : t('logs.filter.noLogs')}
                  </p>
                </div>
              ) : (
                <>
                  {/* 件数 */}
                  {hasActiveFilter(filter) && (
                    <p className="text-[var(--text-faint)] text-xs mb-3">
                      {t('logs.filter.resultCount', { filtered: filtered.length, total: logs.length })}
                    </p>
                  )}

                  {/* モバイルカード */}
                  <div className="sm:hidden space-y-4">
                    {paged.map(log => {
                      const { projectCol, deviceCol } = resolveColumns(log);
                      return (
                        <div key={log.id} className="rounded-lg bg-[var(--bg-surface)] ring-1 ring-[var(--border)] p-4 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`inline-flex items-center h-5 px-2 rounded-full text-xs font-medium ${categoryBadge[log.category]}`}>
                              {categoryLabel[log.category]}
                            </span>
                            <span className="text-[var(--text-faint)] text-xs tabular-nums">{formatDate(log.performedAt)}</span>
                          </div>
                          <p className="text-[var(--text)] text-sm">{tAction(log.category, log.action)}</p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            <div>
                              <span className="text-[var(--text-faint)]">{t('logs.table.project')}</span>
                              <p className="text-[var(--text-muted)] truncate mt-0.5">{projectCol}</p>
                            </div>
                            <div>
                              <span className="text-[var(--text-faint)]">{t('logs.table.device')}</span>
                              <p className="text-[var(--text-muted)] truncate mt-0.5">{deviceCol}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center shrink-0 text-[var(--text)] text-[10px] font-medium">
                              {log.performedBy.displayName[0]?.toUpperCase() ?? '?'}
                            </div>
                            <span className="text-[var(--text-dim)] text-xs truncate">{log.performedBy.displayName}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* デスクトップテーブル */}
                  <div className="hidden sm:block overflow-hidden rounded-lg ring-1 ring-[var(--border)]">
                    <div className="grid grid-cols-[120px_1fr_1fr_1fr_1fr_160px] gap-4 px-4 py-3 bg-[var(--bg-base)] border-b border-[var(--border)] text-xs font-medium text-[var(--text-faint)] uppercase tracking-wider">
                      <span>{t('logs.table.type')}</span>
                      <span>{t('logs.table.action')}</span>
                      <span>{t('logs.table.project')}</span>
                      <span>{t('logs.table.device')}</span>
                      <span>{t('logs.table.performer')}</span>
                      <span>{t('logs.table.datetime')}</span>
                    </div>
                    {paged.map((log, i) => {
                      const { projectCol, deviceCol } = resolveColumns(log);
                      return (
                        <div
                          key={log.id}
                          className={`grid grid-cols-[120px_1fr_1fr_1fr_1fr_160px] gap-4 px-4 py-3.5 items-center bg-[var(--bg-surface)] hover:bg-[var(--bg-active)] transition-colors ${
                            i < paged.length - 1 ? 'border-b border-[var(--border)]' : ''
                          }`}
                        >
                          <span className={`inline-flex items-center justify-center h-5 px-2 rounded-full text-xs font-medium w-fit ${categoryBadge[log.category]}`}>
                            {categoryLabel[log.category]}
                          </span>
                          <span className="text-[var(--text)] text-sm">
                            {tAction(log.category, log.action)}
                          </span>
                          <span className="text-[var(--text-dim)] text-sm truncate">{projectCol}</span>
                          <span className="text-[var(--text-dim)] text-sm truncate">{deviceCol}</span>
                          <span className="text-[var(--text-dim)] text-sm truncate">{log.performedBy.displayName}</span>
                          <span className="text-[var(--text-faint)] text-xs tabular-nums">{formatDate(log.performedAt)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
                </>
              )}
            </>
          )
        )}

        {tab === 'device' && (
          <div className="overflow-hidden rounded-lg bg-[var(--bg-surface)] ring-1 ring-[var(--border)] p-12 text-center">
            <p className="text-[var(--text-faint)] text-sm">{t('logs.deviceLogsWip')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
