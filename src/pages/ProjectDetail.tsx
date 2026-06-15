import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchProject,
  fetchProjects,
  subscribeDevicesByProject,
  addDevice,
  updateDevice,
  requestDeletion,
  subscribeGroupsByProject,
  addGroup,
  updateGroup,
  setGroupDevices,
} from '../lib/firestore';
import { CustomSelect } from '../components/CustomSelect';
import { StatusBadge } from '../components/StatusBadge';
import type { ProjectDoc, Device, AppName, DeviceGroup } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';
import { useFormatDate } from '../hooks/useFormatDate';

// ── helpers ──────────────────────────────────────────────────────

interface GroupNode {
  group: DeviceGroup;
  children: GroupNode[];
  devices: Device[];
}

function buildGroupTree(groups: DeviceGroup[], devices: Device[]): GroupNode[] {
  const nodeMap = new Map<string, GroupNode>();
  for (const g of groups) {
    nodeMap.set(g.id, { group: g, children: [], devices: [] });
  }
  for (const d of devices) {
    if (d.groupId) {
      const node = nodeMap.get(d.groupId);
      if (node) node.devices.push(d);
    }
  }
  const roots: GroupNode[] = [];
  for (const g of groups) {
    const node = nodeMap.get(g.id)!;
    if (g.parentGroupId && nodeMap.has(g.parentGroupId)) {
      nodeMap.get(g.parentGroupId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function getDescendantIds(groupId: string, groups: DeviceGroup[]): string[] {
  const children = groups.filter(g => g.parentGroupId === groupId);
  const ids: string[] = [];
  for (const c of children) {
    ids.push(c.id);
    ids.push(...getDescendantIds(c.id, groups));
  }
  return ids;
}

function countDevicesRecursive(node: GroupNode): number {
  return node.devices.length + node.children.reduce((sum, c) => sum + countDevicesRecursive(c), 0);
}

function flattenGroups(roots: GroupNode[], depth = 0): Array<{ group: DeviceGroup; depth: number }> {
  const result: Array<{ group: DeviceGroup; depth: number }> = [];
  for (const node of roots) {
    result.push({ group: node.group, depth });
    result.push(...flattenGroups(node.children, depth + 1));
  }
  return result;
}

function MetricBar({ label, value, unit, warn = 70, danger = 90 }: {
  label: string; value: number; unit: string; warn?: number; danger?: number;
}) {
  const color = value === 0 ? 'bg-[var(--bg-subtle)]'
    : value >= danger ? 'bg-red-500'
    : value >= warn   ? 'bg-yellow-400'
    : 'bg-green-500';

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-[var(--text-faint)]">{label}</span>
        <span className="text-[var(--text-muted)] font-medium tabular-nums">{value}{unit}</span>
      </div>
      <div className="h-1 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

function UptimeClock({ uptimeSecs, lastSeen, status }: { uptimeSecs: number; lastSeen: string; status: string }) {
  const calc = () => Math.max(0, uptimeSecs + Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000));
  const [secs, setSecs] = useState(calc);
  useEffect(() => {
    if (status !== 'online') { setSecs(uptimeSecs); return; }
    setSecs(calc());
    const id = setInterval(() => setSecs(calc()), 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uptimeSecs, lastSeen, status]);
  if (secs <= 0) return <span className="font-mono">--:--:--</span>;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return (
    <span className="font-mono">
      {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  );
}


const APP_OPTIONS: AppName[] = ['Gido', 'Gido-Touch', 'Gido-Touch-Mini', 'Grain-Link', 'Bridge-Ground'];

const APP_SORT_ORDER = Object.fromEntries(APP_OPTIONS.map((app, i) => [app, i])) as Record<string, number>;

const APP_BADGE_STYLE: Record<string, string> = {
  'Gido':           'bg-blue-500/15 text-blue-400 ring-blue-500/30',
  'Gido-Touch':     'bg-red-500/15 text-red-400 ring-red-500/30',
  'Gido-Touch-Mini':'bg-green-500/15 text-green-400 ring-green-500/30',
  'Grain-Link':     'bg-orange-500/15 text-orange-400 ring-orange-500/30',
  'Bridge-Ground':  'bg-purple-500/15 text-purple-400 ring-purple-500/30',
};

function AppBadge({ app }: { app: string }) {
  const style = APP_BADGE_STYLE[app] ?? 'bg-zinc-500/15 text-zinc-400 ring-zinc-500/30';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${style}`}>
      {app}
    </span>
  );
}

const inputClass =
  'w-full bg-[var(--bg-raised)] ring-1 ring-[var(--border)] text-[var(--text)] rounded-lg px-3 h-9 text-sm outline-none focus:ring-[var(--accent)] focus:ring-2 placeholder:text-[var(--text-faint)] transition-all';

// ── DeviceCard ────────────────────────────────────────────────────

interface DeviceCardProps {
  device: Device;
  uuid: string;
  projectId: string;
  canEdit: boolean;
  onEdit: (device: Device) => void;
  onDelete: (device: Device) => void;
}

function DeviceCard({ device, uuid, projectId, canEdit, onEdit, onDelete }: DeviceCardProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const menu = canEdit && (
    <div ref={menuRef} className="relative z-10 shrink-0">
      <button
        onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); setMenuOpen(o => !o); }}
        onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }}
        className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5"  r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 w-32 bg-[var(--bg-raised)] ring-1 ring-[var(--border)] rounded-lg shadow-xl overflow-hidden">
          <button
            onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); onEdit(device); }}
            onClick={e => { e.stopPropagation(); setMenuOpen(false); onEdit(device); }}
            className="w-full text-left px-3 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            {t('projectDetail.deviceEdit')}
          </button>
          <button
            onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); onDelete(device); }}
            onClick={e => { e.stopPropagation(); setMenuOpen(false); onDelete(device); }}
            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-950/40 transition-colors cursor-pointer"
          >
            {t('projectDetail.deviceDeleteRequest')}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div
      className="relative bg-[var(--bg-surface)] ring-1 ring-[var(--border)] rounded-xl p-5 hover:ring-[var(--accent)] transition-colors cursor-pointer"
      onClick={(e) => {
        if (menuRef.current?.contains(e.target as Node)) return;
        navigate(`/${uuid}/projects/${projectId}/devices/${device.id}`);
      }}
    >

      {/* Mobile layout */}
      <div className="sm:hidden">
        {/* Row 1: name (truncated) + status + menu */}
        <div className="flex items-center gap-2 min-w-0 mb-0.5">
          <p className="font-medium text-[var(--text)] text-sm truncate flex-1 min-w-0">{device.name}</p>
          <StatusBadge status={device.status} />
          {menu}
        </div>
        {/* Row 2: IP */}
        <p className="text-xs text-[var(--text-faint)] font-mono mb-4">{device.ip}</p>
        {/* Info section: app / last seen / uptime */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <AppBadge app={device.app} />
            <span className="text-[var(--text-faint)] text-xs">v{device.appVersion}</span>
          </div>
          <p className="text-xs text-[var(--text-faint)]">{t('projectDetail.deviceLastSeen', { time: formatDate(device.lastSeen) })}</p>
          <p className="text-xs text-[var(--text-dim)]">
            {t('projectDetail.deviceUptime')}: <UptimeClock uptimeSecs={device.system.uptime} lastSeen={device.lastSeen} status={device.status} />
          </p>
        </div>
      </div>

      {/* Desktop layout: original */}
      <div className="hidden sm:block">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div>
              <p className="font-medium text-[var(--text)] text-sm">{device.name}</p>
              <p className="text-xs text-[var(--text-faint)] font-mono mt-0.5">{device.ip}</p>
            </div>
            <StatusBadge status={device.status} />
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5">
                <AppBadge app={device.app} />
                <span className="text-[var(--text-faint)] text-xs">v{device.appVersion}</span>
              </div>
              <p className="text-xs text-[var(--text-faint)] mt-0.5">{t('projectDetail.deviceLastSeen', { time: formatDate(device.lastSeen) })}</p>
            </div>
            {menu}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-6">
          <div className="col-span-3 grid grid-cols-2 gap-x-8 gap-y-3">
            <MetricBar label="CPU"                          value={device.system.cpu}         unit="%" />
            <MetricBar label={t('deviceDetail.memory')}      value={device.system.memory}      unit="%" />
            <MetricBar label={t('deviceDetail.temperature')} value={device.system.temperature} unit="°C" warn={65} danger={80} />
            <MetricBar label={t('deviceDetail.storage')}     value={device.system.storage}     unit="%" warn={80} danger={90} />
          </div>
          <div className="flex flex-col justify-center pl-5 border-l border-[var(--border)]">
            <p className="text-xs text-[var(--text-faint)] mb-1">{t('projectDetail.deviceUptime')}</p>
            <p className="text-lg font-semibold text-[var(--text)]">
              <UptimeClock uptimeSecs={device.system.uptime} lastSeen={device.lastSeen} status={device.status} />
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── GroupCard ─────────────────────────────────────────────────────

interface GroupCardProps {
  node: GroupNode;
  uuid: string;
  projectId: string;
  canEdit: boolean;
  allGroups: DeviceGroup[];
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onEditGroup: (group: DeviceGroup) => void;
  onDeleteGroup: (group: DeviceGroup) => void;
  onEditDevice: (device: Device) => void;
  onDeleteDevice: (device: Device) => void;
}

function GroupCard({
  node, uuid, projectId, canEdit, allGroups, collapsed,
  onToggle, onEditGroup, onDeleteGroup, onEditDevice, onDeleteDevice,
}: GroupCardProps) {
  const { t } = useTranslation();
  const isCollapsed = collapsed.has(node.group.id);
  const totalCount  = countDevicesRecursive(node);
  const hasChildGroups = node.children.length > 0;
  const hasDevices     = node.devices.length > 0;
  const canDelete      = totalCount === 0 && !hasChildGroups;

  return (
    <div className="bg-[var(--bg-surface)] ring-1 ring-[var(--border)] rounded-xl overflow-hidden">
      {/* Group header */}
      <div
        className="flex items-center justify-between px-5 py-3 cursor-pointer select-none hover:bg-[var(--bg-active)] transition-colors"
        onClick={() => onToggle(node.group.id)}
      >
        <div className="flex items-center gap-3">
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={`text-[var(--text-faint)] transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          <span className="text-[var(--text)] font-medium text-sm">{node.group.name}</span>
          <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-dim)] text-xs font-medium">
            {totalCount}
          </span>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onEditGroup(node.group)}
              className="h-7 px-3 rounded-md text-xs text-[var(--text-muted)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] ring-1 ring-[var(--border)] transition-colors cursor-pointer"
            >
              {t('projectDetail.deviceEdit')}
            </button>
            <button
              disabled={!canDelete}
              onClick={() => canDelete && onDeleteGroup(node.group)}
              className={`h-7 px-3 rounded-md text-xs ring-1 transition-colors ${
                canDelete
                  ? 'text-red-400 bg-red-950/30 hover:bg-red-950/50 ring-red-900/50 cursor-pointer'
                  : 'text-[var(--text-faint)] bg-[var(--bg-surface)]/30 ring-[var(--border)] cursor-not-allowed'
              }`}
              title={!canDelete ? t('projectDetail.cantDelete') : undefined}
            >
              {t('projectDetail.deviceDeleteRequest')}
            </button>
          </div>
        )}
      </div>

      {/* Group content */}
      {!isCollapsed && (hasChildGroups || hasDevices) && (
        <div className="px-4 pb-4 space-y-4 md:space-y-5 mx-4">
          {node.children.map(child => (
            <GroupCard
              key={child.group.id}
              node={child}
              uuid={uuid}
              projectId={projectId}
              canEdit={canEdit}
              allGroups={allGroups}
              collapsed={collapsed}
              onToggle={onToggle}
              onEditGroup={onEditGroup}
              onDeleteGroup={onDeleteGroup}
              onEditDevice={onEditDevice}
              onDeleteDevice={onDeleteDevice}
            />
          ))}
          {node.devices.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
              {node.devices.map(device => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  uuid={uuid}
                  projectId={projectId}
                  canEdit={canEdit}
                  onEdit={onEditDevice}
                  onDelete={onDeleteDevice}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── グループモーダル ───────────────────────────────────────────────

interface GroupModalProps {
  initial:    DeviceGroup | null;
  projectId:  string;
  groups:     DeviceGroup[];
  devices:    Device[];
  onClose:    () => void;
  onSave:     (
    data: Pick<DeviceGroup, 'name' | 'parentGroupId'>,
    selectedDeviceIds: string[],
    previousDeviceIds: string[],
  ) => Promise<void>;
}

function GroupModal({ initial, projectId: _projectId, groups, devices, onClose, onSave }: GroupModalProps) {
  const { t } = useTranslation();
  const [name,          setName]          = useState(initial?.name ?? '');
  const [parentGroupId, setParentGroupId] = useState<string | null>(initial?.parentGroupId ?? null);
  const [selectedIds,   setSelectedIds]   = useState<string[]>(
    initial ? devices.filter(d => d.groupId === initial.id).map(d => d.id) : []
  );
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // Devices currently in this group (for tracking previous state)
  const previousIds = devices.filter(d => d.groupId === initial?.id).map(d => d.id);

  // Groups available for parent (exclude self and descendants)
  const excludeIds = initial ? [initial.id, ...getDescendantIds(initial.id, groups)] : [];
  const availableParents = groups.filter(g => !excludeIds.includes(g.id));

  // Build roots for flattenGroups (only from available parents)
  const availableRoots = buildGroupTree(availableParents, []);

  function toggleDevice(id: string) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError(t('projectDetail.groupModal.nameRequired')); return; }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), parentGroupId }, selectedIds, previousIds);
      onClose();
    } catch {
      setError(t('projectDetail.groupModal.saveFailed'));
      setSaving(false);
    }
  }

  // Map groupId -> group name for display
  const groupNameMap = new Map(groups.map(g => [g.id, g.name]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-[var(--bg-surface)] ring-1 ring-[var(--border)] rounded-xl w-full max-w-sm shadow-2xl flex flex-col h-fit max-h-full overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="shrink-0 px-6 pt-6 pb-4">
          <h2 className="text-[var(--text)] text-lg font-semibold">
            {initial ? t('projectDetail.groupModal.editTitle') : t('projectDetail.groupModal.addTitle')}
          </h2>
        </div>

        <div className="shrink overflow-y-auto scrollbar-subtle px-6 pb-4 space-y-4">
          <div>
            <label className="block text-sm text-[var(--text-dim)] mb-1.5">{t('projectDetail.groupModal.nameLabel')}</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--text-dim)] mb-1.5">{t('projectDetail.groupModal.parentLabel')}</label>
            <CustomSelect
              value={parentGroupId ?? ''}
              onChange={v => setParentGroupId(v || null)}
              options={[
                { value: '', label: t('projectDetail.groupModal.rootOption') },
                ...flattenGroups(availableRoots).map(({ group, depth }) => ({
                  value: group.id,
                  label: '　'.repeat(depth) + group.name,
                })),
              ]}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--text-dim)] mb-1.5">{t('projectDetail.groupModal.devicesLabel')}</label>
            <div className="bg-[var(--bg-raised)] ring-1 ring-[var(--border)] rounded-lg divide-y divide-[var(--bg-hover)] max-h-64 overflow-y-auto scrollbar-subtle">
              {devices.length === 0 ? (
                <p className="px-3 py-2 text-sm text-[var(--text-faint)]">{t('projectDetail.groupModal.noDevices')}</p>
              ) : devices.map(device => {
                const isSelected = selectedIds.includes(device.id);
                const otherGroupId = device.groupId && device.groupId !== initial?.id ? device.groupId : null;
                const otherGroupName = otherGroupId ? (groupNameMap.get(otherGroupId) ?? otherGroupId) : null;
                return (
                  <label key={device.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-[var(--bg-subtle)] transition-colors">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleDevice(device.id)}
                      className="w-4 h-4 accent-[var(--accent)]"
                    />
                    <span className="text-sm text-[var(--text)] flex-1">{device.name}</span>
                    {otherGroupName && (
                      <span className="text-xs text-yellow-400">{t('projectDetail.groupModal.currentGroup')}: {otherGroupName}</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        <div className="shrink-0 px-6 py-4 border-t border-[var(--bg-hover)] bg-[var(--bg-surface)] flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="h-9 px-4 rounded-lg text-sm text-[var(--text-muted)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] ring-1 ring-[var(--border)] transition-colors cursor-pointer">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={saving}
            className="h-9 px-4 rounded-lg text-sm font-medium text-[var(--text)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors cursor-pointer">
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── デバイス追加・編集モーダル ────────────────────────────────────

interface DeviceModalProps {
  initial:   Device | null;
  groups:    DeviceGroup[];
  groupTree: GroupNode[];
  projects:  ProjectDoc[];
  onClose:   () => void;
  onSave:    (data: Pick<Device, 'name' | 'ip' | 'port' | 'app' | 'appVersion'> & { groupId?: string | null; projectId?: string }) => Promise<void>;
}

function DeviceModal({ initial, groups, groupTree, projects, onClose, onSave }: DeviceModalProps) {
  const { t } = useTranslation();
  const [name,       setName]       = useState(initial?.name       ?? '');
  const [ip,         setIp]         = useState(initial?.ip         ?? '');
  const [port,       setPort]       = useState(initial?.port       ?? 8090);
  const [app,        setApp]        = useState<AppName>(initial?.app ?? 'Gido');
  const [appVersion, setAppVersion] = useState(initial?.appVersion ?? '');
  const [groupId,    setGroupId]    = useState<string | null>(initial?.groupId ?? null);
  const [projectId,  setProjectId]  = useState<string>(initial?.projectId ?? '');
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !ip.trim()) {
      setError(t('projectDetail.deviceModal.requiredError'));
      return;
    }
    setSaving(true);
    try {
      const data: Parameters<typeof onSave>[0] = {
        name: name.trim(), ip: ip.trim(), port, app, appVersion: appVersion.trim(), groupId,
      };
      if (initial && projectId) data.projectId = projectId;
      await onSave(data);
      onClose();
    } catch {
      setError(t('projectDetail.deviceModal.saveFailed'));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-[var(--bg-surface)] ring-1 ring-[var(--border)] rounded-xl w-full max-w-sm shadow-2xl flex flex-col h-fit max-h-full overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="shrink-0 px-6 pt-6 pb-4">
          <h2 className="text-[var(--text)] text-lg font-semibold">
            {initial ? t('projectDetail.deviceModal.editTitle') : t('projectDetail.deviceModal.addTitle')}
          </h2>
        </div>

        <div className="shrink overflow-y-auto scrollbar-subtle px-6 pb-4 space-y-4">
          {initial && projects.length > 1 && (
            <div>
              <label className="block text-sm text-[var(--text-dim)] mb-1.5">{t('projectDetail.deviceModal.projectLabel')}</label>
              <CustomSelect
                value={projectId}
                onChange={val => setProjectId(val)}
                options={projects.map(p => ({ value: p.id, label: p.name }))}
                className="w-full"
              />
            </div>
          )}
          <div>
            <label className="block text-sm text-[var(--text-dim)] mb-1.5">{t('projectDetail.deviceModal.nameLabel')}</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className={inputClass} />
          </div>
          <div>
            <label className="block text-sm text-[var(--text-dim)] mb-1.5">{t('projectDetail.deviceModal.ipLabel')}</label>
            <input value={ip} onChange={e => setIp(e.target.value)}
              className={inputClass} />
          </div>
          <div>
            <label className="block text-sm text-[var(--text-dim)] mb-1.5">{t('projectDetail.deviceModal.portLabel')}</label>
            <input
              type="number"
              value={port}
              onChange={e => setPort(Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--text-dim)] mb-1.5">{t('projectDetail.deviceModal.appLabel')}</label>
            <CustomSelect
              value={app}
              onChange={val => setApp(val as AppName)}
              options={APP_OPTIONS.map(o => ({ value: o, label: o }))}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--text-dim)] mb-1.5">{t('projectDetail.deviceModal.versionLabel')}</label>
            <input value={appVersion} onChange={e => setAppVersion(e.target.value)}
              className={inputClass} />
          </div>
          {groups.length > 0 && (
            <div>
              <label className="block text-sm text-[var(--text-dim)] mb-1.5">{t('projectDetail.deviceModal.groupLabel')}</label>
              <CustomSelect
                value={groupId ?? ''}
                onChange={val => setGroupId(val || null)}
                options={[
                  { value: '', label: 'ー' },
                  ...flattenGroups(groupTree).map(({ group, depth }) => ({
                    value: group.id,
                    label: ' '.repeat(depth) + group.name,
                  })),
                ]}
                className="w-full"
              />
            </div>
          )}
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        </div>

        <div className="shrink-0 px-6 py-4 border-t border-[var(--bg-hover)] bg-[var(--bg-surface)] flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="h-9 px-4 rounded-lg text-sm text-[var(--text-muted)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] ring-1 ring-[var(--border)] transition-colors cursor-pointer">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={saving}
            className="h-9 px-4 rounded-lg text-sm font-medium text-[var(--text)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors cursor-pointer">
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── 削除依頼確認モーダル ───────────────────────────────────────────

interface DeleteConfirmProps {
  name:      string;
  onClose:   () => void;
  onConfirm: () => Promise<void>;
}

function DeleteConfirm({ name, onClose, onConfirm }: DeleteConfirmProps) {
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
        className="bg-[var(--bg-surface)] ring-1 ring-[var(--border)] rounded-xl w-full max-w-md p-6 shadow-2xl h-fit max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-[var(--text)] text-lg font-semibold mb-2">{t('projectDetail.deleteRequest.title')}</h2>
        <p className="text-[var(--text-dim)] text-sm mb-5">
          {t('projectDetail.deleteRequest.body', { name })}
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="h-9 px-4 rounded-lg text-sm text-[var(--text-muted)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] ring-1 ring-[var(--border)] transition-colors cursor-pointer">
            {t('common.cancel')}
          </button>
          <button onClick={handleConfirm} disabled={sending}
            className="h-9 px-4 rounded-lg text-sm font-medium text-[var(--text)] bg-[var(--danger)] hover:bg-[var(--danger-hover)] disabled:opacity-50 transition-colors cursor-pointer">
            {sending ? t('projectDetail.deleteRequest.sending') : t('projectDetail.deleteRequest.send')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── メインページ ──────────────────────────────────────────────────

export function ProjectDetail() {
  const { user, role } = useAuth();
  const { uuid, id } = useParams<{ uuid: string; id: string }>();
  const { t } = useTranslation();

  const [project,        setProject]        = useState<ProjectDoc | null>(null);
  usePageTitle(project?.name ?? 'プロジェクト詳細');
  const [projects,       setProjects]       = useState<ProjectDoc[]>([]);
  const [devices,        setDevices]        = useState<Device[]>([]);
  const [groups,         setGroups]         = useState<DeviceGroup[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [groupModalOpen,  setGroupModalOpen]  = useState(false);
  const [editDevice,     setEditDevice]     = useState<Device | null>(null);
  const [editGroup,      setEditGroup]      = useState<DeviceGroup | null>(null);
  const [deleteDevice,   setDeleteDevice]   = useState<Device | null>(null);
  const [deleteGroup,    setDeleteGroup]    = useState<DeviceGroup | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [filterApps,     setFilterApps]     = useState<Set<AppName>>(new Set());
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!headerMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [headerMenuOpen]);

  useEffect(() => {
    if (!id) return;
    let devicesLoaded = false;
    let groupsLoaded  = false;

    const checkDone = () => {
      if (devicesLoaded && groupsLoaded) setLoading(false);
    };

    fetchProject(id).then(p => setProject(p));
    fetchProjects().then(ps => setProjects(ps));

    const u2 = subscribeDevicesByProject(
      id,
      devs => { setDevices(devs); devicesLoaded = true; checkDone(); },
      ()   => { devicesLoaded = true; checkDone(); },
    );
    const u3 = subscribeGroupsByProject(
      id,
      grps => { setGroups(grps); groupsLoaded = true; checkDone(); },
    );
    return () => { u2(); u3(); };
  }, [id]);

  const canEdit = role === 'admin' || role === 'owner';

  const visibleApps   = Array.from(new Set(devices.map(d => d.app)))
    .sort((a, b) => (APP_SORT_ORDER[a] ?? 99) - (APP_SORT_ORDER[b] ?? 99)) as AppName[];
  const filteredDevices = filterApps.size > 0
    ? devices.filter(d => filterApps.has(d.app))
    : devices;
  const groupTree    = buildGroupTree(groups, filteredDevices);
  const ungrouped    = filteredDevices.filter(d => !d.groupId);
  const hasGroups    = groups.length > 0;
  const showDivider  = hasGroups && ungrouped.length > 0;

  function toggleFilterApp(app: AppName) {
    setFilterApps(prev => {
      const next = new Set(prev);
      if (next.has(app)) { next.delete(app); } else { next.add(app); }
      return next;
    });
  }

  function toggleCollapse(groupId: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  async function handleSaveDevice(
    data: Pick<Device, 'name' | 'ip' | 'port' | 'app' | 'appVersion'> & { groupId?: string | null; projectId?: string }
  ) {
    if (!id) return;
    if (editDevice) {
      await updateDevice(editDevice.id, data);
    } else {
      const { projectId: _pid, ...rest } = data;
      await addDevice({
        ...rest,
        projectId: id,
        status:   'offline',
        lastSeen: new Date().toISOString(),
        system:   { cpu: 0, memory: 0, temperature: 0, storage: 0, uptime: 0 },
      });
    }
  }

  async function handleSaveGroup(
    data: Pick<DeviceGroup, 'name' | 'parentGroupId'>,
    selectedDeviceIds: string[],
    previousDeviceIds: string[],
  ) {
    if (!id) return;
    if (editGroup) {
      await updateGroup(editGroup.id, data);
      await setGroupDevices(editGroup.id, selectedDeviceIds, previousDeviceIds);
    } else {
      const newId = await addGroup({ ...data, projectId: id });
      await setGroupDevices(newId, selectedDeviceIds, []);
    }
  }

  async function handleDeleteDevice() {
    if (!deleteDevice || !user) return;
    await requestDeletion('device', deleteDevice.id, deleteDevice.name, user.uid, user.email ?? '');
  }

  async function handleDeleteGroup() {
    if (!deleteGroup || !user) return;
    await requestDeletion('group', deleteGroup.id, deleteGroup.name, user.uid, user.email ?? '');
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-full">
        <div className="flex items-center justify-center flex-1">
          <p className="text-[var(--text-faint)] text-sm">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col min-h-full">
        <div className="p-8">
          <p className="text-[var(--text-dim)] mb-2">{t('projectDetail.notFound')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">

      {/* ページヘッダー */}
      <div className="py-6 px-4 sm:px-6">
        {/* Mobile: truncated text + 3-dot menu */}
        <div className="flex items-start gap-2 min-w-0 sm:hidden">
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <h1 className="text-[var(--text)] text-3xl font-semibold truncate leading-tight">{project.name}</h1>
            <p className="text-[var(--text-muted)] text-base truncate">{project.address}</p>
          </div>
          {canEdit && (
            <div ref={headerMenuRef} className="relative shrink-0 mt-2">
              <button
                onClick={() => setHeaderMenuOpen(o => !o)}
                className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                aria-label={t('common.menu')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5"  r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="12" cy="19" r="2" />
                </svg>
              </button>
              {headerMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-40 bg-[var(--bg-raised)] ring-1 ring-[var(--border)] rounded-lg shadow-xl overflow-hidden z-10">
                  <button
                    onClick={() => { setHeaderMenuOpen(false); setEditGroup(null); setGroupModalOpen(true); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    {t('projectDetail.createGroup')}
                  </button>
                  <button
                    onClick={() => { setHeaderMenuOpen(false); setEditDevice(null); setDeviceModalOpen(true); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    {t('projectDetail.addDevice')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Desktop: original layout */}
        <div className="hidden sm:flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-[var(--text)] text-3xl font-semibold">{project.name}</h1>
            <p className="text-[var(--text-muted)] text-base">{project.address}</p>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2 mt-7">
              <button
                onClick={() => { setEditGroup(null); setGroupModalOpen(true); }}
                className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium text-[var(--text-muted)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] ring-1 ring-[var(--border)] transition-colors cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {t('projectDetail.createGroup')}
              </button>
              <button
                onClick={() => { setEditDevice(null); setDeviceModalOpen(true); }}
                className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium text-[var(--text)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {t('projectDetail.addDevice')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* アプリフィルター */}
      {visibleApps.length > 1 && (
        <div className="px-4 sm:px-6 pb-2 flex flex-wrap items-center gap-2">
          {visibleApps.map(app => {
            const active      = filterApps.has(app) || filterApps.size === 0;
            const activeStyle = APP_BADGE_STYLE[app] ?? 'bg-zinc-500/15 text-zinc-400 ring-zinc-500/30';
            return (
              <button
                key={app}
                onClick={() => toggleFilterApp(app)}
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ring-1 transition-colors cursor-pointer ${
                  active ? activeStyle : 'text-[var(--text-faint)] bg-[var(--bg-subtle)] ring-[var(--border)]'
                }`}
              >
                {app}
              </button>
            );
          })}
          {filterApps.size > 0 && (
            <button
              onClick={() => setFilterApps(new Set())}
              className="text-xs text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors cursor-pointer underline-offset-2 hover:underline"
            >
              {t('common.clear')}
            </button>
          )}
        </div>
      )}

      {/* デバイス・グループ一覧 */}
      <div className="px-4 sm:px-6 pt-4 pb-8 space-y-4 md:space-y-5">
        {filteredDevices.length === 0 && (!hasGroups || filterApps.size > 0) ? (
          <div className="overflow-hidden rounded-lg bg-[var(--bg-surface)] ring-1 ring-[var(--border)] p-12 text-center">
            <p className="text-[var(--text-faint)] text-sm">
              {filterApps.size > 0 ? t('projectDetail.noFilteredDevices') : t('projectDetail.noDevices')}
            </p>
          </div>
        ) : (
          <>
            {/* グループツリー */}
            {hasGroups && groupTree.map(node => (
              <GroupCard
                key={node.group.id}
                node={node}
                uuid={uuid!}
                projectId={id!}
                canEdit={canEdit}
                allGroups={groups}
                collapsed={collapsedGroups}
                onToggle={toggleCollapse}
                onEditGroup={g => { setEditGroup(g); setGroupModalOpen(true); }}
                onDeleteGroup={g => setDeleteGroup(g)}
                onEditDevice={d => { setEditDevice(d); setDeviceModalOpen(true); }}
                onDeleteDevice={d => setDeleteDevice(d)}
              />
            ))}

            {/* グループ未設定の区切り */}
            {showDivider && (
              <div className="flex items-center gap-3 py-2">
                <div className="flex-1 h-px bg-[var(--bg-subtle)]" />
                <span className="text-xs text-[var(--text-faint)] whitespace-nowrap">{t('projectDetail.ungrouped')}</span>
                <div className="flex-1 h-px bg-[var(--bg-subtle)]" />
              </div>
            )}

            {/* グループ未設定デバイス */}
            {ungrouped.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                {ungrouped.map(device => (
                  <DeviceCard
                    key={device.id}
                    device={device}
                    uuid={uuid!}
                    projectId={id!}
                    canEdit={canEdit}
                    onEdit={d => { setEditDevice(d); setDeviceModalOpen(true); }}
                    onDelete={d => setDeleteDevice(d)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* モーダル */}
      {deviceModalOpen && (
        <DeviceModal
          initial={editDevice}
          groups={groups}
          groupTree={groupTree}
          projects={projects}
          onClose={() => setDeviceModalOpen(false)}
          onSave={handleSaveDevice}
        />
      )}
      {groupModalOpen && (
        <GroupModal
          initial={editGroup}
          projectId={id!}
          groups={groups}
          devices={devices}
          onClose={() => setGroupModalOpen(false)}
          onSave={handleSaveGroup}
        />
      )}
      {deleteDevice && (
        <DeleteConfirm
          name={deleteDevice.name}
          onClose={() => setDeleteDevice(null)}
          onConfirm={handleDeleteDevice}
        />
      )}
      {deleteGroup && (
        <DeleteConfirm
          name={deleteGroup.name}
          onClose={() => setDeleteGroup(null)}
          onConfirm={handleDeleteGroup}
        />
      )}
    </div>
  );
}
