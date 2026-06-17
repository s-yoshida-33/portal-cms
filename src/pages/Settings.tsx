import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { fetchExternalLinks, addExternalLink, deleteExternalLink } from '../lib/firestore';
import { usePageTitle } from '../hooks/usePageTitle';
import { useFormatDate } from '../hooks/useFormatDate';
import type { ExternalLink } from '../types';

export function Settings() {
  const { t } = useTranslation();
  usePageTitle(t('settings.title'));
  const { role } = useAuth();
  const formatDate = useFormatDate();

  const [links,   setLinks]   = useState<ExternalLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [name,    setName]    = useState('');
  const [url,     setUrl]     = useState('');
  const [adding,  setAdding]  = useState(false);
  const [error,   setError]   = useState('');

  const canEdit = role === 'admin' || role === 'owner';

  useEffect(() => {
    fetchExternalLinks().then(data => {
      setLinks(data);
      setLoading(false);
    });
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const trimName = name.trim();
    const trimUrl  = url.trim();
    if (!trimName) { setError(t('settings.integrations.externalLinks.nameRequired')); return; }
    if (!trimUrl)  { setError(t('settings.integrations.externalLinks.urlRequired'));  return; }
    if (!trimUrl.startsWith('http://') && !trimUrl.startsWith('https://')) {
      setError(t('settings.integrations.externalLinks.urlInvalid'));
      return;
    }
    setAdding(true);
    try {
      const link = await addExternalLink({ name: trimName, url: trimUrl });
      setLinks(prev => [...prev, link]);
      setName('');
      setUrl('');
    } catch {
      setError(t('settings.integrations.externalLinks.saveFailed'));
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteExternalLink(id);
      setLinks(prev => prev.filter(l => l.id !== id));
    } catch {
      // no-op: optimistic delete already skipped; surface error if needed
    }
  }

  const inputClass =
    'w-full bg-[var(--bg-surface)] ring-1 ring-[var(--border)] text-[var(--text)] rounded-lg px-3 h-9 text-sm outline-none focus:ring-[var(--accent)] focus:ring-2 placeholder:text-[var(--text-faint)] transition-all';

  return (
    <div className="flex flex-col min-h-full">

      {/* ページヘッダー */}
      <div className="py-6 px-4 sm:px-6">
        {/* Mobile */}
        <div className="flex items-start gap-2 min-w-0 sm:hidden">
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <h1 className="text-(--text) text-3xl font-semibold leading-tight">{t('settings.title')}</h1>
            <p className="text-(--text-muted) text-base">{t('settings.description')}</p>
          </div>
        </div>
        {/* Desktop */}
        <div className="hidden sm:flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-(--text) text-3xl font-semibold">{t('settings.title')}</h1>
            <p className="text-(--text-muted) text-base">{t('settings.description')}</p>
          </div>
        </div>
      </div>

      {/* コンテンツ */}
      <div className="px-4 sm:px-6 pt-8 pb-8">

        {/* 外部リンクセクション */}
        <div>
          <h2 className="text-(--text) text-base font-semibold mb-0.5">
            {t('settings.integrations.externalLinks.sectionTitle')}
          </h2>
          <p className="text-(--text-muted) text-sm mb-5">
            {t('settings.integrations.externalLinks.sectionDescription')}
          </p>

          {/* 追加フォーム（admin/owner のみ） */}
          {canEdit && (
            <form onSubmit={handleAdd} noValidate className="mb-6">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t('settings.integrations.externalLinks.namePlaceholder')}
                  className={`${inputClass} sm:w-52`}
                />
                <input
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder={t('settings.integrations.externalLinks.urlPlaceholder')}
                  className={`${inputClass} sm:flex-1`}
                  type="url"
                  inputMode="url"
                />
                <button
                  type="submit"
                  disabled={adding}
                  className="h-9 px-5 rounded-lg text-sm font-semibold text-white bg-(--accent) hover:bg-(--accent-hover) disabled:opacity-50 transition-colors cursor-pointer shrink-0"
                >
                  +
                </button>
              </div>
              {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
            </form>
          )}

          {/* テーブル */}
          {loading ? (
            <p className="text-(--text-faint) text-sm">{t('common.loading')}</p>
          ) : links.length === 0 ? (
            <div className="overflow-hidden rounded-lg bg-(--bg-surface) ring-1 ring-(--border) p-10 text-center">
              <p className="text-(--text-faint) text-sm">
                {t('settings.integrations.externalLinks.noLinks')}
              </p>
            </div>
          ) : (
            <>
              {/* スマホ: カード */}
              <div className="sm:hidden space-y-3">
                {links.map(link => (
                  <div key={link.id} className="bg-(--bg-surface) ring-1 ring-(--border) rounded-xl px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-(--text) text-sm font-semibold truncate">{link.name}</span>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-(--accent) text-xs truncate hover:underline"
                        >
                          {link.url}
                        </a>
                        <span className="text-(--text-faint) text-xs tabular-nums mt-1">
                          {formatDate(link.createdAt)}
                        </span>
                      </div>
                      {canEdit && (
                        <button
                          onClick={() => handleDelete(link.id)}
                          className="shrink-0 h-7 px-3 rounded-md text-xs text-(--danger-text) bg-(--danger-text)/5 hover:bg-(--danger-text)/10 ring-1 ring-(--danger-text)/20 transition-colors cursor-pointer"
                        >
                          {t('common.delete')}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* PC: テーブル */}
              <div className="hidden sm:block overflow-hidden rounded-lg ring-1 ring-(--border)">
                <div className={`grid gap-4 px-4 py-3 bg-(--bg-base) border-b border-(--border) text-xs font-medium text-(--text-faint) uppercase tracking-wider ${canEdit ? 'grid-cols-[1fr_2fr_160px_72px]' : 'grid-cols-[1fr_2fr_160px]'}`}>
                  <span>{t('settings.integrations.externalLinks.table.name')}</span>
                  <span>{t('settings.integrations.externalLinks.table.url')}</span>
                  <span>{t('settings.integrations.externalLinks.table.addedAt')}</span>
                  {canEdit && <span />}
                </div>
                {links.map((link, i) => (
                  <div
                    key={link.id}
                    className={`grid gap-4 px-4 py-3 items-center bg-(--bg-surface) transition-colors ${canEdit ? 'grid-cols-[1fr_2fr_160px_72px]' : 'grid-cols-[1fr_2fr_160px]'} ${i < links.length - 1 ? 'border-b border-(--border)' : ''}`}
                  >
                    <span className="text-(--text) text-sm font-medium truncate">{link.name}</span>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-(--accent) text-sm truncate hover:underline"
                    >
                      {link.url}
                    </a>
                    <span className="text-(--text-dim) text-sm tabular-nums">
                      {formatDate(link.createdAt)}
                    </span>
                    {canEdit && (
                      <div className="flex justify-end">
                        <button
                          onClick={() => handleDelete(link.id)}
                          className="h-7 px-3 rounded-md text-xs text-(--danger-text) bg-(--danger-text)/5 hover:bg-(--danger-text)/10 ring-1 ring-(--danger-text)/20 transition-colors cursor-pointer"
                        >
                          {t('common.delete')}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
