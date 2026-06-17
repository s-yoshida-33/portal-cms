import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { fetchExternalLinks, addExternalLink, updateExternalLink, deleteExternalLink } from '../lib/firestore';
import { usePageTitle } from '../hooks/usePageTitle';
import { useFormatDate } from '../hooks/useFormatDate';
import type { ExternalLink } from '../types';

// ── Edit Modal ────────────────────────────────────────────────────

function EditModal({
  link,
  onSave,
  onClose,
}: {
  link: ExternalLink;
  onSave: (id: string, name: string, url: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(link.name);
  const [url,  setUrl]  = useState(link.url);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const inputClass =
    'w-full bg-(--bg-base) ring-1 ring-(--border) text-(--text) rounded-lg px-3 h-9 text-sm outline-none focus:ring-(--accent) focus:ring-2 placeholder:text-(--text-faint) transition-all';

  async function handleSubmit(e: React.FormEvent) {
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
    setSaving(true);
    try {
      await onSave(link.id, trimName, trimUrl);
      onClose();
    } catch {
      setError(t('settings.integrations.externalLinks.updateFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-(--bg-surface) ring-1 ring-(--border) rounded-xl w-full max-w-md p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <h2 className="text-(--text) text-lg font-semibold mb-4">
          {t('settings.integrations.externalLinks.editTitle')}
        </h2>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('settings.integrations.externalLinks.namePlaceholder')}
            className={inputClass}
          />
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder={t('settings.integrations.externalLinks.urlPlaceholder')}
            className={inputClass}
            type="url"
            inputMode="url"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex justify-end gap-2 mt-1">
            <button type="button" onClick={onClose}
              className="h-9 px-4 rounded-lg text-sm text-(--text-muted) bg-(--bg-surface) hover:bg-(--bg-subtle)/60 ring-1 ring-(--border) transition-colors cursor-pointer">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving}
              className="h-9 px-4 rounded-lg text-sm font-semibold text-white bg-(--accent) hover:bg-(--accent-hover) disabled:opacity-50 transition-colors cursor-pointer">
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Modal ──────────────────────────────────────────────────

function DeleteModal({
  link,
  onConfirm,
  onClose,
}: {
  link: ExternalLink;
  onConfirm: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);

  async function handle() {
    setRunning(true);
    try {
      await onConfirm(link.id);
      onClose();
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-(--bg-surface) ring-1 ring-(--border) rounded-xl w-full max-w-md p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <h2 className="text-(--text) text-lg font-semibold mb-2">
          {t('settings.integrations.externalLinks.deleteTitle')}
        </h2>
        <p className="text-(--text-dim) text-sm mb-5">
          {t('settings.integrations.externalLinks.deleteBody', { name: link.name })}
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="h-9 px-4 rounded-lg text-sm text-(--text-muted) bg-(--bg-surface) hover:bg-(--bg-subtle)/60 ring-1 ring-(--border) transition-colors cursor-pointer">
            {t('common.cancel')}
          </button>
          <button onClick={handle} disabled={running}
            className="h-9 px-4 rounded-lg text-sm font-medium text-white bg-(--danger) hover:bg-(--danger-hover) disabled:opacity-50 transition-colors cursor-pointer">
            {running ? t('common.processing') : t('settings.integrations.externalLinks.deleteConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Settings Page ─────────────────────────────────────────────────

export function Settings() {
  const { t } = useTranslation();
  usePageTitle(t('settings.title'));
  const { role } = useAuth();
  const formatDate = useFormatDate();

  const [links,        setLinks]        = useState<ExternalLink[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [name,         setName]         = useState('');
  const [url,          setUrl]          = useState('');
  const [adding,       setAdding]       = useState(false);
  const [error,        setError]        = useState('');
  const [editTarget,   setEditTarget]   = useState<ExternalLink | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExternalLink | null>(null);

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

  async function handleUpdate(id: string, newName: string, newUrl: string) {
    await updateExternalLink(id, { name: newName, url: newUrl });
    setLinks(prev => prev.map(l => l.id === id ? { ...l, name: newName, url: newUrl } : l));
  }

  async function handleDelete(id: string) {
    await deleteExternalLink(id);
    setLinks(prev => prev.filter(l => l.id !== id));
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
                        <div className="flex shrink-0 gap-1.5">
                          <button
                            onClick={() => setEditTarget(link)}
                            className="h-7 px-3 rounded-md text-xs text-(--text-muted) bg-(--bg-subtle)/60 hover:bg-(--bg-subtle) ring-1 ring-(--border) transition-colors cursor-pointer"
                          >
                            {t('common.edit')}
                          </button>
                          <button
                            onClick={() => setDeleteTarget(link)}
                            className="h-7 px-3 rounded-md text-xs text-(--danger-text) bg-(--danger-text)/5 hover:bg-(--danger-text)/10 ring-1 ring-(--danger-text)/20 transition-colors cursor-pointer"
                          >
                            {t('common.delete')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* PC: テーブル */}
              <div className="hidden sm:block overflow-hidden rounded-lg ring-1 ring-(--border)">
                <div className={`grid gap-4 px-4 py-3 bg-(--bg-base) border-b border-(--border) text-xs font-medium text-(--text-faint) uppercase tracking-wider ${canEdit ? 'grid-cols-[1fr_2fr_160px_144px]' : 'grid-cols-[1fr_2fr_160px]'}`}>
                  <span>{t('settings.integrations.externalLinks.table.name')}</span>
                  <span>{t('settings.integrations.externalLinks.table.url')}</span>
                  <span>{t('settings.integrations.externalLinks.table.addedAt')}</span>
                  {canEdit && <span />}
                </div>
                {links.map((link, i) => (
                  <div
                    key={link.id}
                    className={`grid gap-4 px-4 py-3 items-center bg-(--bg-surface) transition-colors ${canEdit ? 'grid-cols-[1fr_2fr_160px_144px]' : 'grid-cols-[1fr_2fr_160px]'} ${i < links.length - 1 ? 'border-b border-(--border)' : ''}`}
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
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => setEditTarget(link)}
                          className="h-7 px-3 rounded-md text-xs text-(--text-muted) bg-(--bg-subtle)/60 hover:bg-(--bg-subtle) ring-1 ring-(--border) transition-colors cursor-pointer"
                        >
                          {t('common.edit')}
                        </button>
                        <button
                          onClick={() => setDeleteTarget(link)}
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

      {/* Modals */}
      {editTarget && (
        <EditModal
          link={editTarget}
          onSave={handleUpdate}
          onClose={() => setEditTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteModal
          link={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
