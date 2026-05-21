import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribeFacilities,
  subscribeDevicesByFacility,
  addDevice,
  updateDevice,
  requestDeletion,
} from '../lib/firestore';
import { StatusBadge } from '../components/StatusBadge';
import type { FacilityDoc, Device, AppName } from '../types';

// ── helpers ──────────────────────────────────────────────────────

function MetricBar({ label, value, unit, warn = 70, danger = 90 }: {
  label: string; value: number; unit: string; warn?: number; danger?: number;
}) {
  const color = value === 0 ? 'bg-zinc-700'
    : value >= danger ? 'bg-red-500'
    : value >= warn   ? 'bg-yellow-400'
    : 'bg-green-500';

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-zinc-500">{label}</span>
        <span className="text-zinc-300 font-medium tabular-nums">{value}{unit}</span>
      </div>
      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

function formatUptime(hours: number) {
  if (hours === 0) return '-';
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return d > 0 ? `${d}日 ${h}時間` : `${h}時間`;
}

function formatLastSeen(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const APP_OPTIONS: AppName[] = ['Gido', 'Gido-Touch', 'Gido-Touch-Mini', 'Grain-Link'];

// ── デバイス追加・編集モーダル ────────────────────────────────────

interface DeviceModalProps {
  initial: Device | null;
  onClose: () => void;
  onSave:  (data: Pick<Device, 'name' | 'ip' | 'app' | 'appVersion'>) => Promise<void>;
}

function DeviceModal({ initial, onClose, onSave }: DeviceModalProps) {
  const [name,       setName]       = useState(initial?.name       ?? '');
  const [ip,         setIp]         = useState(initial?.ip         ?? '');
  const [app,        setApp]        = useState<AppName>(initial?.app ?? 'Gido');
  const [appVersion, setAppVersion] = useState(initial?.appVersion ?? '');
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !ip.trim()) {
      setError('名前とIPアドレスを入力してください。');
      return;
    }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), ip: ip.trim(), app, appVersion: appVersion.trim() });
      onClose();
    } catch {
      setError('保存に失敗しました。');
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
          {initial ? 'デバイスを編集' : 'デバイスを追加'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">デバイス名</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="PC-200" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">IPアドレス</label>
            <input value={ip} onChange={e => setIp(e.target.value)}
              placeholder="192.168.1.100" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">アプリ</label>
            <select value={app} onChange={e => setApp(e.target.value as AppName)}
              className={inputClass}>
              {APP_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">バージョン</label>
            <input value={appVersion} onChange={e => setAppVersion(e.target.value)}
              placeholder="1.2.0" className={inputClass} />
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
  device:    Device;
  onClose:   () => void;
  onConfirm: () => Promise<void>;
}

function DeleteConfirm({ device, onClose, onConfirm }: DeleteConfirmProps) {
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
          「{device.name}」の削除依頼をオーナーに送信します。<br />
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

export function FacilityDetail() {
  const { user, role } = useAuth();
  const { uuid, id } = useParams<{ uuid: string; id: string }>();

  const [facility,     setFacility]     = useState<FacilityDoc | null>(null);
  const [devices,      setDevices]      = useState<Device[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editTarget,   setEditTarget]   = useState<Device | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);

  useEffect(() => {
    if (!id) return;
    let facilityResolved = false;
    const u1 = subscribeFacilities(fs => {
      setFacility(fs.find(f => f.id === id) ?? null);
      if (!facilityResolved) { facilityResolved = true; }
    });
    const u2 = subscribeDevicesByFacility(id, devs => {
      setDevices(devs);
      setLoading(false);
    });
    return () => { u1(); u2(); };
  }, [id]);

  const canEdit = role === 'admin' || role === 'owner';

  async function handleSave(data: Pick<Device, 'name' | 'ip' | 'app' | 'appVersion'>) {
    if (!id) return;
    if (editTarget) {
      await updateDevice(editTarget.id, data);
    } else {
      await addDevice({
        ...data,
        facilityId: id,
        status:  'offline',
        lastSeen: new Date().toISOString(),
        system:  { cpu: 0, memory: 0, temperature: 0, storage: 0, uptime: 0 },
      });
    }
  }

  async function handleDeleteRequest() {
    if (!deleteTarget || !user) return;
    await requestDeletion('device', deleteTarget.id, deleteTarget.name, user.uid, user.email ?? '');
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-full">
        <div className="py-3 border-b border-zinc-800"><div className="h-7" /></div>
        <div className="flex items-center justify-center flex-1">
          <p className="text-zinc-500 text-sm">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!facility) {
    return (
      <div className="flex flex-col min-h-full">
        <div className="py-3 border-b border-zinc-800"><div className="h-7" /></div>
        <div className="p-8">
          <p className="text-zinc-400 mb-2">施設が見つかりません。</p>
          <Link to={`/${uuid}/facilities`}
            className="text-sm text-[#4693ff] hover:underline">
            ← 施設一覧に戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* ヘッダースペーサー */}
      <div className="py-3 border-b border-zinc-800">
        <div className="h-7" />
      </div>

      {/* ページヘッダー */}
      <div className="flex items-start justify-between gap-4 py-6 px-4 sm:px-6">
        <div className="flex flex-col gap-1">
          <Link to={`/${uuid}/facilities`}
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-1 inline-block">
            ← 施設一覧に戻る
          </Link>
          <h1 className="text-white text-3xl font-semibold">{facility.name}</h1>
          <p className="text-[#999999] text-base">{facility.address}</p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setEditTarget(null); setModalOpen(true); }}
            className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium text-white bg-[#4693ff] hover:bg-[#3a7fe0] transition-colors cursor-pointer mt-7"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            デバイスを追加
          </button>
        )}
      </div>

      {/* デバイス一覧 */}
      <div className="px-4 sm:px-6 pb-8 space-y-3">
        {devices.length === 0 ? (
          <div className="overflow-hidden rounded-lg bg-[#111111] ring-1 ring-[#3d3d3d] p-12 text-center">
            <p className="text-zinc-500 text-sm">デバイスが登録されていません。</p>
          </div>
        ) : devices.map(device => (
          <div key={device.id} className="bg-[#111111] ring-1 ring-[#3d3d3d] rounded-xl p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-medium text-zinc-100 text-sm">{device.name}</p>
                  <p className="text-xs text-zinc-500 font-mono mt-0.5">{device.ip}</p>
                </div>
                <StatusBadge status={device.status} />
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm text-zinc-300">
                    {device.app}{' '}
                    <span className="text-zinc-500 text-xs">v{device.appVersion}</span>
                  </p>
                  <p className="text-xs text-zinc-600 mt-0.5">最終確認: {formatLastSeen(device.lastSeen)}</p>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-2 ml-2">
                    <button
                      onClick={() => { setEditTarget(device); setModalOpen(true); }}
                      className="h-7 px-3 rounded-md text-xs text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] transition-colors cursor-pointer"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => setDeleteTarget(device)}
                      className="h-7 px-3 rounded-md text-xs text-red-400 bg-red-950/30 hover:bg-red-950/50 ring-1 ring-red-900/50 transition-colors cursor-pointer"
                    >
                      削除依頼
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-6">
              <div className="col-span-3 grid grid-cols-2 gap-x-8 gap-y-3">
                <MetricBar label="CPU"        value={device.system.cpu}         unit="%" />
                <MetricBar label="メモリ"     value={device.system.memory}      unit="%" />
                <MetricBar label="温度"       value={device.system.temperature} unit="°C" warn={65} danger={80} />
                <MetricBar label="ストレージ" value={device.system.storage}     unit="%" warn={80} danger={90} />
              </div>
              <div className="flex flex-col justify-center pl-5 border-l border-zinc-800">
                <p className="text-xs text-zinc-500 mb-1">稼働時間</p>
                <p className="text-lg font-semibold text-zinc-200">{formatUptime(device.system.uptime)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* モーダル */}
      {modalOpen && (
        <DeviceModal
          initial={editTarget}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          device={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteRequest}
        />
      )}
    </div>
  );
}
