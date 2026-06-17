import { useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchProjects,
  fetchDevices,
  addProject,
  updateProject,
  requestDeletion,
  addSiteLog,
} from '../lib/firestore';
import type { ProjectDoc, Device } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';
import { CustomSelect } from '../components/CustomSelect';

// ── プロジェクト追加・編集モーダル ────────────────────────────────

const COUNTRIES = [
  { value: '日本',         key: 'japan' },
  { value: '中国',         key: 'china' },
  { value: 'インドネシア', key: 'indonesia' },
  { value: 'カンボジア',   key: 'cambodia' },
  { value: 'ベトナム',     key: 'vietnam' },
  { value: 'その他',       key: 'other' },
] as const;

function getCountryLabel(value: string, t: (key: string) => string): string {
  const entry = COUNTRIES.find(c => c.value === value);
  return entry ? t(`projects.countryOptions.${entry.key}`) : value;
}

interface ModalProps {
  initial: ProjectDoc | null;
  onClose: () => void;
  onSave:  (data: Pick<ProjectDoc, 'name' | 'country' | 'prefecture' | 'address'>) => Promise<void>;
}

function ProjectModal({ initial, onClose, onSave }: ModalProps) {
  const { t } = useTranslation();
  const [name,       setName]       = useState(initial?.name       ?? '');
  const [country,    setCountry]    = useState(initial?.country    ?? '日本');
  const [prefecture, setPrefecture] = useState(initial?.prefecture ?? '');
  const [address,    setAddress]    = useState(initial?.address    ?? '');
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  const isJapan = country === '日本';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !address.trim() || (isJapan && !prefecture.trim())) {
      setError(t(isJapan ? 'projects.form.requiredAll' : 'projects.form.requiredNameAddress'));
      return;
    }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), country, prefecture: prefecture.trim(), address: address.trim() });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(t('projects.form.saveFailed', { msg }));
      setSaving(false);
    }
  }

  const inputClass =
    'w-full bg-[var(--bg-surface)] ring-1 ring-[var(--border)] text-[var(--text)] rounded-lg px-3 h-9 text-sm outline-none focus:ring-[var(--accent)] focus:ring-2 placeholder:text-[var(--text-faint)] transition-all';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-(--bg-surface) ring-1 ring-(--border) rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-none overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="shrink-0 px-6 pt-6 pb-4">
          <h2 className="text-(--text) text-lg font-semibold mb-1">
            {initial ? t('projects.form.editTitle') : t('projects.form.addTitle')}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <div className="flex-1 overflow-y-auto sm:overflow-visible px-6 pb-4 space-y-4">
            <div>
              <label className="block text-sm text-(--text-dim) mb-1.5">{t('projects.form.nameLabel')}</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className={inputClass} />
            </div>
            <div>
              <label className="block text-sm text-(--text-dim) mb-1.5">{t('projects.form.countryLabel')}</label>
              <CustomSelect
                value={country}
                onChange={setCountry}
                options={COUNTRIES.map(c => ({ value: c.value, label: getCountryLabel(c.value, t) }))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm text-(--text-dim) mb-1.5">
                {isJapan ? t('projects.form.prefectureLabel') : t('projects.form.regionLabel')}
              </label>
              <input value={prefecture} onChange={e => setPrefecture(e.target.value)}
                className={inputClass} />
            </div>
            <div>
              <label className="block text-sm text-(--text-dim) mb-1.5">{t('projects.form.addressLabel')}</label>
              <input value={address} onChange={e => setAddress(e.target.value)}
                className={inputClass} />
            </div>
            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
          </div>
          <div className="shrink-0 px-6 py-4 border-t border-(--bg-hover) bg-(--bg-surface) rounded-b-xl flex justify-end gap-2">
            <button type="button" onClick={onClose}
              className="h-9 px-4 rounded-lg text-sm text-(--text-muted) bg-(--bg-surface) hover:bg-(--bg-subtle)/60 ring-1 ring-(--border) transition-colors cursor-pointer">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving}
              className="h-9 px-4 rounded-lg text-sm font-medium text-white bg-(--accent) hover:bg-(--accent-hover) disabled:opacity-50 transition-colors cursor-pointer">
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 削除依頼確認モーダル ───────────────────────────────────────────

interface DeleteConfirmProps {
  project:   ProjectDoc;
  onClose:   () => void;
  onConfirm: () => Promise<void>;
}

function DeleteConfirm({ project, onClose, onConfirm }: DeleteConfirmProps) {
  const { t } = useTranslation();
  const [sending, setSending] = useState(false);

  async function handleConfirm() {
    setSending(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-(--bg-surface) ring-1 ring-(--border) rounded-xl w-full max-w-md p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-(--text) text-lg font-semibold mb-2">{t('projects.deleteRequest.title')}</h2>
        <p className="text-(--text-dim) text-sm mb-5">
          {t('projects.deleteRequest.bodyLine1', { name: project.name })}<br />
          {t('projects.deleteRequest.bodyLine2')}
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="h-9 px-4 rounded-lg text-sm text-(--text-muted) bg-(--bg-surface) hover:bg-(--bg-subtle)/60 ring-1 ring-(--border) transition-colors cursor-pointer">
            {t('common.cancel')}
          </button>
          <button onClick={handleConfirm} disabled={sending}
            className="h-9 px-4 rounded-lg text-sm font-medium text-white bg-(--danger) hover:bg-(--danger-hover) disabled:opacity-50 transition-colors cursor-pointer">
            {sending ? t('projects.deleteRequest.sending') : t('projects.deleteRequest.send')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── メインページ ──────────────────────────────────────────────────

export function Projects() {
  const { t } = useTranslation();
  usePageTitle(t('projects.title'));
  const { user, role } = useAuth();

  function siteLogActor() {
    return { uid: user?.uid ?? '', email: user?.email ?? '', displayName: user?.displayName ?? '' };
  }
  const { uuid } = useParams<{ uuid: string }>();

  const [projects,     setProjects]     = useState<ProjectDoc[]>([]);
  const [devices,      setDevices]      = useState<Device[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editTarget,   setEditTarget]   = useState<ProjectDoc | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectDoc | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!headerMenuOpen) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [headerMenuOpen]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const [ps, ds] = await Promise.all([fetchProjects(), fetchDevices()]);
      if (cancelled) return;
      setProjects(ps);
      setDevices(ds);
      setLoading(false);
    }
    poll();
    const id = setInterval(poll, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const canEdit = role === 'admin' || role === 'owner';

  const deviceCount = (projectId: string) =>
    devices.filter(d => d.projectId === projectId && d.app === 'Bridge-Ground').length;

  async function handleSave(data: Pick<ProjectDoc, 'name' | 'country' | 'prefecture' | 'address'>) {
    if (editTarget) {
      await updateProject(editTarget.id, data);
      addSiteLog({ category: 'project', action: 'updated', targetId: editTarget.id, targetName: data.name, projectName: data.name, performedBy: siteLogActor() }).catch(() => {});
    } else {
      await addProject(data);
      addSiteLog({ category: 'project', action: 'created', targetName: data.name, projectName: data.name, performedBy: siteLogActor() }).catch(() => {});
    }
  }

  async function handleDeleteRequest() {
    if (!deleteTarget || !user) return;
    await requestDeletion('project', deleteTarget.id, deleteTarget.name, user.uid, user.email ?? '');
    addSiteLog({ category: 'project', action: 'deletionRequested', targetId: deleteTarget.id, targetName: deleteTarget.name, projectName: deleteTarget.name, performedBy: siteLogActor() }).catch(() => {});
  }

  return (
    <div className="flex flex-col min-h-full">

      {/* ページヘッダー */}
      <div className="py-6 px-4 sm:px-6">
        {/* Mobile: タイトル + 3点メニュー */}
        <div className="flex items-start gap-2 min-w-0 sm:hidden">
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <h1 className="text-(--text) text-3xl font-semibold leading-tight">{t('projects.title')}</h1>
            <p className="text-(--text-muted) text-base">{t('projects.description')}</p>
          </div>
          {canEdit && (
            <div ref={headerMenuRef} className="relative shrink-0 mt-2">
              <button
                onClick={() => setHeaderMenuOpen(o => !o)}
                className="w-8 h-8 flex items-center justify-center rounded-md text-(--text-dim) hover:text-(--text) hover:bg-(--bg-subtle)/60 transition-colors cursor-pointer"
                aria-label={t('common.menu')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5"  r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="12" cy="19" r="2" />
                </svg>
              </button>
              {headerMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-(--bg-raised) ring-1 ring-(--border) rounded-lg shadow-xl overflow-hidden z-10">
                  <button
                    onClick={() => { setHeaderMenuOpen(false); setEditTarget(null); setModalOpen(true); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-(--text) hover:bg-(--bg-subtle)/60 transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    {t('projects.add')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Desktop: タイトル + CTAボタン */}
        <div className="hidden sm:flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-(--text) text-3xl font-semibold">{t('projects.title')}</h1>
            <p className="text-(--text-muted) text-base">{t('projects.description')}</p>
          </div>
          {canEdit && (
            <button
              onClick={() => { setEditTarget(null); setModalOpen(true); }}
              className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium text-white bg-(--accent) hover:bg-(--accent-hover) transition-colors cursor-pointer mt-1"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('projects.add')}
            </button>
          )}
        </div>
      </div>

      {/* コンテンツ */}
      <div className="px-4 sm:px-6 pt-8 pb-8">
        {loading ? (
          <div className="overflow-hidden rounded-lg bg-(--bg-surface) ring-1 ring-(--border) p-12 text-center">
            <p className="text-(--text-faint) text-sm">{t('common.loading')}</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="overflow-hidden rounded-lg bg-(--bg-surface) ring-1 ring-(--border) p-12 text-center">
            <p className="text-(--text-faint) text-sm">{t('projects.noProjects')}</p>
            {canEdit && (
              <button
                onClick={() => { setEditTarget(null); setModalOpen(true); }}
                className="mt-4 text-(--accent) text-sm hover:underline cursor-pointer"
              >
                {t('projects.addFirst')}
              </button>
            )}
          </div>
        ) : (
          <>
            {/* ── スマホ: カードレイアウト ── */}
            <div className="sm:hidden space-y-4">
              {projects.map((p) => (
                <div key={p.id} className="relative bg-(--bg-surface) ring-1 ring-(--border) rounded-xl px-4 py-4">
                  {/* カード全体のタップ領域 */}
                  <Link
                    to={`/${uuid}/projects/${p.id}`}
                    className="absolute inset-0 rounded-xl"
                    aria-label={p.name}
                  />
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <span className="text-(--text) text-sm font-semibold leading-snug">
                      {p.name}
                    </span>
                    <span className="relative z-10 shrink-0 text-xs font-medium text-(--text-muted) bg-(--bg-subtle) ring-1 ring-(--border) rounded-md px-2 py-0.5 tabular-nums">
                      {deviceCount(p.id)}台
                    </span>
                  </div>
                  <p className="text-(--text-faint) text-xs mb-3">
                    {p.country && p.country !== '日本' && (
                      <span className="inline-block mr-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-(--bg-subtle) ring-1 ring-(--border) text-(--text-muted)">
                        {getCountryLabel(p.country, t)}
                      </span>
                    )}
                    {p.prefecture && <>{p.prefecture}　</>}{p.address}
                  </p>
                  {canEdit && (
                    <div className="relative z-10 flex gap-2">
                      <button
                        onClick={() => { setEditTarget(p); setModalOpen(true); }}
                        className="h-7 px-3 rounded-md text-xs text-(--text-muted) bg-(--bg-surface) hover:bg-(--bg-subtle)/60 ring-1 ring-(--border) transition-colors cursor-pointer"
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        onClick={() => setDeleteTarget(p)}
                        className="h-7 px-3 rounded-md text-xs text-(--danger-text) bg-(--danger-text)/5 hover:bg-(--danger-text)/10 ring-1 ring-(--danger-text)/20 transition-colors cursor-pointer"
                      >
                        {t('projectDetail.deviceDeleteRequest')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ── PC: テーブルレイアウト ── */}
            <div className="hidden sm:block overflow-hidden rounded-lg ring-1 ring-(--border)">
              {/* テーブルヘッダー */}
              <div className="grid grid-cols-[1fr_100px_130px_1.2fr_72px_160px] gap-4 px-4 py-3 bg-(--bg-base) border-b border-(--border) text-xs font-medium text-(--text-faint) uppercase tracking-wider">
                <span>{t('projects.table.name')}</span>
                <span>{t('projects.table.country')}</span>
                <span>{t('projects.table.region')}</span>
                <span>{t('projects.table.address')}</span>
                <span>{t('projects.table.count')}</span>
                <span />
              </div>

              {/* テーブル行 */}
              {projects.map((p, i) => (
                <div
                  key={p.id}
                  className={`grid grid-cols-[1fr_100px_130px_1.2fr_72px_160px] gap-4 px-4 py-4 items-center bg-(--bg-surface) transition-colors ${
                    i < projects.length - 1 ? 'border-b border-(--border)' : ''
                  }`}
                >
                  <Link
                    to={`/${uuid}/projects/${p.id}`}
                    className="text-(--text) text-sm font-medium hover:text-(--accent) transition-colors truncate"
                  >
                    {p.name}
                  </Link>
                  <span className="text-(--text-dim) text-sm truncate">
                    {getCountryLabel(p.country ?? '日本', t)}
                  </span>
                  <span className="text-(--text-dim) text-sm truncate">
                    {p.prefecture}
                  </span>
                  <span className="text-(--text-dim) text-sm truncate">{p.address}</span>
                  <span className="text-(--text-muted) text-sm font-medium tabular-nums">
                    {deviceCount(p.id)}
                  </span>
                  {canEdit ? (
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => { setEditTarget(p); setModalOpen(true); }}
                        className="h-7 px-3 rounded-md text-xs text-(--text-muted) bg-(--bg-surface) hover:bg-(--bg-subtle)/60 ring-1 ring-(--border) transition-colors cursor-pointer"
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        onClick={() => setDeleteTarget(p)}
                        className="h-7 px-3 rounded-md text-xs text-(--danger-text) bg-(--danger-text)/5 hover:bg-(--danger-text)/10 ring-1 ring-(--danger-text)/20 transition-colors cursor-pointer"
                      >
                        {t('projectDetail.deviceDeleteRequest')}
                      </button>
                    </div>
                  ) : (
                    <div />
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* モーダル */}
      {modalOpen && (
        <ProjectModal
          initial={editTarget}
          onClose={() => { setModalOpen(false); setEditTarget(null); }}
          onSave={handleSave}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          project={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteRequest}
        />
      )}
    </div>
  );
}

