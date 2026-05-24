import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribeProjects,
  subscribeDevices,
  addProject,
  updateProject,
  requestDeletion,
} from '../lib/firestore';
import type { ProjectDoc, Device } from '../types';

// ── プロジェクト追加・編集モーダル ────────────────────────────────

interface ModalProps {
  initial: ProjectDoc | null;
  onClose: () => void;
  onSave:  (data: Pick<ProjectDoc, 'name' | 'prefecture' | 'address'>) => Promise<void>;
}

function ProjectModal({ initial, onClose, onSave }: ModalProps) {
  const [name,       setName]       = useState(initial?.name       ?? '');
  const [prefecture, setPrefecture] = useState(initial?.prefecture ?? '');
  const [address,    setAddress]    = useState(initial?.address    ?? '');
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !prefecture.trim() || !address.trim()) {
      setError('すべての項目を入力してください。');
      return;
    }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), prefecture: prefecture.trim(), address: address.trim() });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`保存に失敗しました: ${msg}`);
      setSaving(false);
    }
  }

  const inputClass =
    'w-full bg-[#1a1a1a] ring-1 ring-[#3d3d3d] text-white rounded-lg px-3 h-9 text-sm outline-none focus:ring-[#4693ff] focus:ring-2 placeholder:text-zinc-600 transition-all';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-[#111111] ring-1 ring-[#3d3d3d] rounded-xl w-full max-w-md p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-white text-lg font-semibold mb-5">
          {initial ? 'プロジェクトを編集' : 'プロジェクトを追加'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">プロジェクト名</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="〇〇ショッピングセンター" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">都道府県</label>
            <input value={prefecture} onChange={e => setPrefecture(e.target.value)}
              placeholder="宮城県" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">住所</label>
            <input value={address} onChange={e => setAddress(e.target.value)}
              placeholder="宮城県仙台市青葉区..." className={inputClass} />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="h-9 px-4 rounded-lg text-sm text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] transition-colors cursor-pointer">
              キャンセル
            </button>
            <button type="submit" disabled={saving}
              className="h-9 px-4 rounded-lg text-sm font-medium text-white bg-[#4693ff] hover:bg-[#3a7fe0] disabled:opacity-50 transition-colors cursor-pointer">
              {saving ? '保存中...' : '保存'}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-[#111111] ring-1 ring-[#3d3d3d] rounded-xl w-full max-w-md p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-white text-lg font-semibold mb-2">削除依頼を送信</h2>
        <p className="text-zinc-400 text-sm mb-5">
          「{project.name}」の削除依頼をオーナーに送信します。<br />
          オーナーが承認するまで削除は実行されません。
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="h-9 px-4 rounded-lg text-sm text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] transition-colors cursor-pointer">
            キャンセル
          </button>
          <button onClick={handleConfirm} disabled={sending}
            className="h-9 px-4 rounded-lg text-sm font-medium text-white bg-[#e81403] hover:bg-[#b20f03] disabled:opacity-50 transition-colors cursor-pointer">
            {sending ? '送信中...' : '依頼を送信'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── メインページ ──────────────────────────────────────────────────

export function Projects() {
  const { user, role } = useAuth();
  const { uuid } = useParams<{ uuid: string }>();

  const [projects,     setProjects]     = useState<ProjectDoc[]>([]);
  const [devices,      setDevices]      = useState<Device[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editTarget,   setEditTarget]   = useState<ProjectDoc | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectDoc | null>(null);

  useEffect(() => {
    let first = true;
    const u1 = subscribeProjects(ps => {
      setProjects(ps);
      if (first) { setLoading(false); first = false; }
    });
    const u2 = subscribeDevices(setDevices);
    return () => { u1(); u2(); };
  }, []);

  const canEdit = role === 'admin' || role === 'owner';

  const deviceCount = (projectId: string) =>
    devices.filter(d => d.projectId === projectId).length;

  async function handleSave(data: Pick<ProjectDoc, 'name' | 'prefecture' | 'address'>) {
    if (editTarget) {
      await updateProject(editTarget.id, data);
    } else {
      await addProject(data);
    }
  }

  async function handleDeleteRequest() {
    if (!deleteTarget || !user) return;
    await requestDeletion('project', deleteTarget.id, deleteTarget.name, user.uid, user.email ?? '');
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* ヘッダースペーサー */}
      <div className="py-3 border-b border-zinc-800">
        <div className="h-7" />
      </div>

      {/* ページヘッダー */}
      <div className="flex items-center justify-between gap-4 py-6 px-4 sm:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-white text-3xl font-semibold">プロジェクト管理</h1>
          <p className="text-[#999999] text-base">登録プロジェクトの確認・追加・編集</p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setEditTarget(null); setModalOpen(true); }}
            className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium text-white bg-[#4693ff] hover:bg-[#3a7fe0] transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            プロジェクトを追加
          </button>
        )}
      </div>

      {/* コンテンツ */}
      <div className="px-4 sm:px-6 pb-8">
        {loading ? (
          <div className="overflow-hidden rounded-lg bg-[#111111] ring-1 ring-[#3d3d3d] p-12 text-center">
            <p className="text-zinc-500 text-sm">読み込み中...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="overflow-hidden rounded-lg bg-[#111111] ring-1 ring-[#3d3d3d] p-12 text-center">
            <p className="text-zinc-500 text-sm">プロジェクトが登録されていません。</p>
            {canEdit && (
              <button
                onClick={() => { setEditTarget(null); setModalOpen(true); }}
                className="mt-4 text-[#4693ff] text-sm hover:underline cursor-pointer"
              >
                最初のプロジェクトを追加する
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg ring-1 ring-[#3d3d3d]">
            {/* テーブルヘッダー */}
            <div className="grid grid-cols-[1fr_110px_1.2fr_72px_160px] gap-4 px-4 py-3 bg-black border-b border-[#3d3d3d] text-xs font-medium text-zinc-500 uppercase tracking-wider">
              <span>プロジェクト名</span>
              <span>都道府県</span>
              <span>住所</span>
              <span>台数</span>
              <span />
            </div>

            {/* テーブル行 */}
            {projects.map((p, i) => (
              <div
                key={p.id}
                className={`grid grid-cols-[1fr_110px_1.2fr_72px_160px] gap-4 px-4 py-4 items-center bg-[#111111] hover:bg-[#161616] transition-colors ${
                  i < projects.length - 1 ? 'border-b border-[#3d3d3d]' : ''
                }`}
              >
                <Link
                  to={`/${uuid}/projects/${p.id}`}
                  className="text-white text-sm font-medium hover:text-[#4693ff] transition-colors truncate"
                >
                  {p.name}
                </Link>
                <span className="text-zinc-400 text-sm">{p.prefecture}</span>
                <span className="text-zinc-400 text-sm truncate">{p.address}</span>
                <span className="text-zinc-300 text-sm font-medium tabular-nums">
                  {deviceCount(p.id)}
                </span>
                {canEdit ? (
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => { setEditTarget(p); setModalOpen(true); }}
                      className="h-7 px-3 rounded-md text-xs text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] transition-colors cursor-pointer"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => setDeleteTarget(p)}
                      className="h-7 px-3 rounded-md text-xs text-red-400 bg-red-950/30 hover:bg-red-950/50 ring-1 ring-red-900/50 transition-colors cursor-pointer"
                    >
                      削除依頼
                    </button>
                  </div>
                ) : (
                  <div />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* モーダル */}
      {modalOpen && (
        <ProjectModal
          initial={editTarget}
          onClose={() => setModalOpen(false)}
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
