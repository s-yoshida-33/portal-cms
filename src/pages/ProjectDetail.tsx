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
        <span className="text-(--text-faint)">{label}</span>
        <span className="text-(--text-muted) font-medium tabular-nums">{value}{unit}</span>
      </div>
      <div className="h-1 bg-(--bg-subtle) rounded-full overflow-hidden">
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

function TagBadge({ tag }: { tag: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 bg-(--bg-subtle) text-(--text-dim) ring-(--border)">
      {tag}
    </span>
  );
}

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  placeholder: string;
}

function TagInput({ tags, onChange, suggestions, placeholder }: TagInputProps) {
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = suggestions.filter(
    s => !tags.includes(s) && s.toLowerCase().includes(input.toLowerCase())
  );
  const showSuggestions = focused && (filtered.length > 0 || input.trim().length > 0);

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput('');
  }

  function removeTag(tag: string) {
    onChange(tags.filter(t => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === 'Enter' || e.key === ',' || e.key === 'Tab') && input.trim()) {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  useEffect(() => {
    if (!focused) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
        if (input.trim()) addTag(input);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, input, tags]);

  return (
    <div ref={containerRef} className="relative">
      <div
        className="min-h-9 w-full bg-(--bg-surface) ring-1 ring-(--border) rounded-lg px-2 py-1.5 flex flex-wrap gap-1.5 items-center cursor-text focus-within:ring-2 focus-within:ring-(--accent) transition-all"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map(tag => (
          <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ring-1 bg-(--bg-subtle) text-(--text-dim) ring-(--border)">
            {tag}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); removeTag(tag); }}
              className="text-(--text-faint) hover:text-(--text-muted) transition-colors leading-none"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-20 bg-transparent text-sm text-(--text) outline-none placeholder:text-(--text-faint)"
        />
      </div>
      {showSuggestions && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-(--bg-raised) ring-1 ring-(--border) rounded-lg shadow-xl z-10 overflow-hidden max-h-40 overflow-y-auto scrollbar-subtle">
          {filtered.map(s => (
            <button
              key={s}
              type="button"
              onMouseDown={e => { e.preventDefault(); addTag(s); }}
              className="w-full text-left px-3 py-2 text-sm text-(--text-muted) hover:bg-(--bg-subtle)/60 transition-colors cursor-pointer"
            >
              {s}
            </button>
          ))}
          {input.trim() && !tags.includes(input.trim()) && (
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); addTag(input); }}
              className="w-full text-left px-3 py-2 text-sm text-(--accent) hover:bg-(--bg-subtle)/60 transition-colors cursor-pointer"
            >
              + "{input.trim()}" を追加
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const inputClass =
  'w-full bg-[var(--bg-surface)] ring-1 ring-[var(--border)] text-[var(--text)] rounded-lg px-3 h-9 text-sm outline-none focus:ring-[var(--accent)] focus:ring-2 placeholder:text-[var(--text-faint)] transition-all';

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
        className="w-7 h-7 flex items-center justify-center rounded-md text-(--text-dim) hover:text-(--text) hover:bg-(--bg-subtle)/60 transition-colors cursor-pointer"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5"  r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 w-32 bg-(--bg-raised) ring-1 ring-(--border) rounded-lg shadow-xl overflow-hidden">
          <button
            onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); onEdit(device); }}
            onClick={e => { e.stopPropagation(); setMenuOpen(false); onEdit(device); }}
            className="w-full text-left px-3 py-2 text-sm text-(--text-muted) hover:bg-(--bg-subtle)/60 transition-colors cursor-pointer"
          >
            {t('projectDetail.deviceEdit')}
          </button>
          <button
            onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); onDelete(device); }}
            onClick={e => { e.stopPropagation(); setMenuOpen(false); onDelete(device); }}
            className="w-full text-left px-3 py-2 text-sm text-(--danger-text) hover:bg-(--danger-text)/10 transition-colors cursor-pointer"
          >
            {t('projectDetail.deviceDeleteRequest')}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div
      className="relative bg-(--bg-surface) ring-1 ring-(--border) rounded-xl p-5 hover:ring-(--accent) transition-colors cursor-pointer"
      onClick={(e) => {
        if (menuRef.current?.contains(e.target as Node)) return;
        navigate(`/${uuid}/projects/${projectId}/devices/${device.id}`);
      }}
    >

      {/* Mobile layout */}
      <div className="sm:hidden">
        {/* Row 1: name (truncated) + status + menu */}
        <div className="flex items-center gap-2 min-w-0 mb-1">
          <p className="font-medium text-(--text) text-sm truncate flex-1 min-w-0">{device.name}</p>
          <StatusBadge status={device.status} />
          {menu}
        </div>
        {/* Row 2: IP */}
        <p className="text-xs text-(--text-faint) font-mono mb-5">{device.ip}</p>
        {/* Info section: app / last seen / uptime */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5">
            <AppBadge app={device.app} />
            <span className="text-(--text-faint) text-xs">v{device.appVersion}</span>
          </div>
          {device.tags && device.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {device.tags.map(tag => <TagBadge key={tag} tag={tag} />)}
            </div>
          )}
          <p className="text-xs text-(--text-faint)">{t('projectDetail.deviceLastSeen', { time: formatDate(device.lastSeen) })}</p>
          <p className="text-xs text-(--text-dim)">
            {t('projectDetail.deviceUptime')}: <UptimeClock uptimeSecs={device.system.uptime} lastSeen={device.lastSeen} status={device.status} />
          </p>
        </div>
      </div>

      {/* Desktop layout */}
      <div className="hidden sm:block">
        {/* Row 1: name + IP (left)  |  status + menu (right) */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="font-medium text-(--text) text-sm">{device.name}</p>
            <p className="text-xs text-(--text-faint) font-mono mt-1">{device.ip}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <StatusBadge status={device.status} />
            {menu}
          </div>
        </div>
        {/* Row 2: app / tags / last seen */}
        <div className="mb-5 space-y-2">
          <div className="flex items-center gap-1.5">
            <AppBadge app={device.app} />
            <span className="text-(--text-faint) text-xs">v{device.appVersion}</span>
          </div>
          {device.tags && device.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {device.tags.map(tag => <TagBadge key={tag} tag={tag} />)}
            </div>
          )}
          <p className="text-xs text-(--text-faint)">{t('projectDetail.deviceLastSeen', { time: formatDate(device.lastSeen) })}</p>
        </div>
        {/* Row 3: metrics */}
        <div className="grid grid-cols-4 gap-6">
          <div className="col-span-3 grid grid-cols-2 gap-x-8 gap-y-4">
            <MetricBar label="CPU"                          value={device.system.cpu}         unit="%" />
            <MetricBar label={t('deviceDetail.memory')}      value={device.system.memory}      unit="%" />
            <MetricBar label={t('deviceDetail.temperature')} value={device.system.temperature} unit="°C" warn={65} danger={80} />
            <MetricBar label={t('deviceDetail.storage')}     value={device.system.storage}     unit="%" warn={80} danger={90} />
          </div>
          <div className="flex flex-col justify-center pl-5 border-l border-(--border)">
            <p className="text-xs text-(--text-faint) mb-1">{t('projectDetail.deviceUptime')}</p>
            <p className="text-lg font-semibold text-(--text)">
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
    <div className="bg-(--bg-surface) ring-1 ring-(--border) rounded-xl overflow-hidden">
      {/* Group header */}
      <div
        className="flex items-center justify-between px-5 py-3 cursor-pointer select-none hover:bg-(--bg-active) transition-colors"
        onClick={() => onToggle(node.group.id)}
      >
        <div className="flex items-center gap-3">
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={`text-(--text-faint) transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          <span className="text-(--text) font-medium text-sm">{node.group.name}</span>
          <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-(--bg-subtle) text-(--text-dim) text-xs font-medium">
            {totalCount}
          </span>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onEditGroup(node.group)}
              className="h-7 px-3 rounded-md text-xs text-(--text-muted) bg-(--bg-surface) hover:bg-(--bg-subtle)/60 ring-1 ring-(--border) transition-colors cursor-pointer"
            >
              {t('projectDetail.deviceEdit')}
            </button>
            <button
              disabled={!canDelete}
              onClick={() => canDelete && onDeleteGroup(node.group)}
              className={`h-7 px-3 rounded-md text-xs ring-1 transition-colors ${
                canDelete
                  ? 'text-red-400 bg-red-950/30 hover:bg-red-950/50 ring-red-900/50 cursor-pointer'
                  : 'text-(--text-faint) bg-(--bg-surface)/30 ring-(--border) cursor-not-allowed'
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
        className="bg-(--bg-surface) ring-1 ring-(--border) rounded-xl w-full max-w-sm shadow-2xl flex flex-col h-fit max-h-full sm:max-h-none overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="shrink-0 px-6 pt-6 pb-4">
          <h2 className="text-(--text) text-lg font-semibold">
            {initial ? t('projectDetail.groupModal.editTitle') : t('projectDetail.groupModal.addTitle')}
          </h2>
        </div>

        <div className="shrink overflow-y-auto sm:overflow-visible scrollbar-subtle px-6 pb-4 space-y-4">
          <div>
            <label className="block text-sm text-(--text-dim) mb-1.5">{t('projectDetail.groupModal.nameLabel')}</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm text-(--text-dim) mb-1.5">{t('projectDetail.groupModal.parentLabel')}</label>
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
            <label className="block text-sm text-(--text-dim) mb-1.5">{t('projectDetail.groupModal.devicesLabel')}</label>
            <div className="bg-(--bg-raised) ring-1 ring-(--border) rounded-lg divide-y divide-(--bg-hover) max-h-64 overflow-y-auto scrollbar-subtle">
              {devices.length === 0 ? (
                <p className="px-3 py-2 text-sm text-(--text-faint)">{t('projectDetail.groupModal.noDevices')}</p>
              ) : devices.map(device => {
                const isSelected = selectedIds.includes(device.id);
                const otherGroupId = device.groupId && device.groupId !== initial?.id ? device.groupId : null;
                const otherGroupName = otherGroupId ? (groupNameMap.get(otherGroupId) ?? otherGroupId) : null;
                return (
                  <label key={device.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-(--bg-subtle) transition-colors">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleDevice(device.id)}
                      className="w-4 h-4 accent-(--accent)"
                    />
                    <span className="text-sm text-(--text) flex-1">{device.name}</span>
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

        <div className="shrink-0 px-6 py-4 border-t border-(--bg-hover) bg-(--bg-surface) flex justify-end gap-2">
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
  );
}

// ── デバイス追加・編集モーダル ────────────────────────────────────

interface DeviceModalProps {
  initial:      Device | null;
  groups:       DeviceGroup[];
  groupTree:    GroupNode[];
  projects:     ProjectDoc[];
  allDevices:   Device[];
  onClose:      () => void;
  onSave:       (data: Pick<Device, 'name' | 'ip' | 'port' | 'app' | 'appVersion' | 'tags'> & { groupId?: string | null; projectId?: string }) => Promise<void>;
}

function DeviceModal({ initial, groups, groupTree, projects, allDevices, onClose, onSave }: DeviceModalProps) {
  const { t } = useTranslation();
  const [name,       setName]       = useState(initial?.name       ?? '');
  const [ip,         setIp]         = useState(initial?.ip         ?? '');
  const [port,       setPort]       = useState(initial?.port       ?? 8090);
  const [app,        setApp]        = useState<AppName>(initial?.app ?? 'Gido');
  const [appVersion, setAppVersion] = useState(initial?.appVersion ?? '');
  const [groupId,    setGroupId]    = useState<string | null>(initial?.groupId ?? null);
  const [projectId,  setProjectId]  = useState<string>(initial?.projectId ?? '');
  const [tags,       setTags]       = useState<string[]>(initial?.tags ?? []);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  const tagSuggestions = Array.from(
    new Set(allDevices.flatMap(d => d.tags ?? []))
  ).sort();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !ip.trim()) {
      setError(t('projectDetail.deviceModal.requiredError'));
      return;
    }
    setSaving(true);
    try {
      const data: Parameters<typeof onSave>[0] = {
        name: name.trim(), ip: ip.trim(), port, app, appVersion: appVersion.trim(), groupId, tags,
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
        className="bg-(--bg-surface) ring-1 ring-(--border) rounded-xl w-full max-w-sm shadow-2xl flex flex-col h-fit max-h-full sm:max-h-none overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="shrink-0 px-6 pt-6 pb-4">
          <h2 className="text-(--text) text-lg font-semibold">
            {initial ? t('projectDetail.deviceModal.editTitle') : t('projectDetail.deviceModal.addTitle')}
          </h2>
        </div>

        <div className="shrink overflow-y-auto sm:overflow-visible scrollbar-subtle px-6 pb-4 space-y-4">
          {initial && projects.length > 1 && (
            <div>
              <label className="block text-sm text-(--text-dim) mb-1.5">{t('projectDetail.deviceModal.projectLabel')}</label>
              <CustomSelect
                value={projectId}
                onChange={val => setProjectId(val)}
                options={projects.map(p => ({ value: p.id, label: p.name }))}
                className="w-full"
              />
            </div>
          )}
          <div>
            <label className="block text-sm text-(--text-dim) mb-1.5">{t('projectDetail.deviceModal.nameLabel')}</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className={inputClass} />
          </div>
          <div>
            <label className="block text-sm text-(--text-dim) mb-1.5">{t('projectDetail.deviceModal.tagsLabel')}</label>
            <TagInput
              tags={tags}
              onChange={setTags}
              suggestions={tagSuggestions}
              placeholder={t('projectDetail.deviceModal.tagsPlaceholder')}
            />
          </div>
          <div>
            <label className="block text-sm text-(--text-dim) mb-1.5">{t('projectDetail.deviceModal.ipLabel')}</label>
            <input value={ip} onChange={e => setIp(e.target.value)}
              className={inputClass} />
          </div>
          <div>
            <label className="block text-sm text-(--text-dim) mb-1.5">{t('projectDetail.deviceModal.portLabel')}</label>
            <input
              type="number"
              value={port}
              onChange={e => setPort(Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm text-(--text-dim) mb-1.5">{t('projectDetail.deviceModal.appLabel')}</label>
            <CustomSelect
              value={app}
              onChange={val => setApp(val as AppName)}
              options={APP_OPTIONS.map(o => ({ value: o, label: o }))}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-(--text-dim) mb-1.5">{t('projectDetail.deviceModal.versionLabel')}</label>
            <input value={appVersion} onChange={e => setAppVersion(e.target.value)}
              className={inputClass} />
          </div>
          {groups.length > 0 && (
            <div>
              <label className="block text-sm text-(--text-dim) mb-1.5">{t('projectDetail.deviceModal.groupLabel')}</label>
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

        <div className="shrink-0 px-6 py-4 border-t border-(--bg-hover) bg-(--bg-surface) flex justify-end gap-2">
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
        className="bg-(--bg-surface) ring-1 ring-(--border) rounded-xl w-full max-w-md p-6 shadow-2xl h-fit max-h-[calc(100dvh-2rem)] sm:max-h-none overflow-y-auto sm:overflow-visible"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-(--text) text-lg font-semibold mb-2">{t('projectDetail.deleteRequest.title')}</h2>
        <p className="text-(--text-dim) text-sm mb-5">
          {t('projectDetail.deleteRequest.body', { name })}
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="h-9 px-4 rounded-lg text-sm text-(--text-muted) bg-(--bg-surface) hover:bg-(--bg-subtle)/60 ring-1 ring-(--border) transition-colors cursor-pointer">
            {t('common.cancel')}
          </button>
          <button onClick={handleConfirm} disabled={sending}
            className="h-9 px-4 rounded-lg text-sm font-medium text-white bg-(--danger) hover:bg-(--danger-hover) disabled:opacity-50 transition-colors cursor-pointer">
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
  const [filterApp,      setFilterApp]      = useState<AppName | ''>('');
  const [filterTag,      setFilterTag]      = useState('');
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

  const availableApps = Array.from(new Set(devices.map(d => d.app)))
    .sort((a, b) => (APP_SORT_ORDER[a] ?? 99) - (APP_SORT_ORDER[b] ?? 99)) as AppName[];
  const availableTags = Array.from(new Set(devices.flatMap(d => d.tags ?? []))).sort();

  const hasActiveFilter = filterApp !== '' || filterTag !== '';
  const filteredDevices = devices.filter(d => {
    if (filterApp && d.app !== filterApp) return false;
    if (filterTag && !(d.tags ?? []).includes(filterTag)) return false;
    return true;
  });
  const groupTree    = buildGroupTree(groups, filteredDevices);
  const ungrouped    = filteredDevices.filter(d => !d.groupId);
  const hasGroups    = groups.length > 0;
  const showDivider  = hasGroups && ungrouped.length > 0;

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
    data: Pick<Device, 'name' | 'ip' | 'port' | 'app' | 'appVersion' | 'tags'> & { groupId?: string | null; projectId?: string }
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
          <p className="text-(--text-faint) text-sm">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col min-h-full">
        <div className="p-8">
          <p className="text-(--text-dim) mb-2">{t('projectDetail.notFound')}</p>
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
            <h1 className="text-(--text) text-3xl font-semibold truncate leading-tight">{project.name}</h1>
            <p className="text-(--text-muted) text-base truncate">{project.address}</p>
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
                <div className="absolute right-0 top-full mt-1 w-40 bg-(--bg-raised) ring-1 ring-(--border) rounded-lg shadow-xl overflow-hidden z-10">
                  <button
                    onClick={() => { setHeaderMenuOpen(false); setEditGroup(null); setGroupModalOpen(true); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-(--text-muted) hover:bg-(--bg-subtle)/60 transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    {t('projectDetail.createGroup')}
                  </button>
                  <button
                    onClick={() => { setHeaderMenuOpen(false); setEditDevice(null); setDeviceModalOpen(true); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-(--text) hover:bg-(--bg-subtle)/60 transition-colors cursor-pointer flex items-center gap-2"
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
            <h1 className="text-(--text) text-3xl font-semibold">{project.name}</h1>
            <p className="text-(--text-muted) text-base">{project.address}</p>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2 mt-7">
              <button
                onClick={() => { setEditGroup(null); setGroupModalOpen(true); }}
                className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium text-(--text-muted) bg-(--bg-surface) hover:bg-(--bg-subtle)/60 ring-1 ring-(--border) transition-colors cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {t('projectDetail.createGroup')}
              </button>
              <button
                onClick={() => { setEditDevice(null); setDeviceModalOpen(true); }}
                className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium text-white bg-(--accent) hover:bg-(--accent-hover) transition-colors cursor-pointer"
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

      {/* フィルター */}
      {(availableApps.length > 1 || availableTags.length > 0) && (
        <div className="px-4 sm:px-6 pb-2 flex flex-wrap items-end gap-2">
          {availableApps.length > 1 && (
            <div className="flex flex-col gap-1">
              <label className="text-(--text-faint) text-xs">{t('projectDetail.filter.app')}</label>
              <CustomSelect
                value={filterApp}
                onChange={v => setFilterApp(v as AppName | '')}
                options={[
                  { value: '', label: t('common.all') },
                  ...availableApps.map(a => ({ value: a, label: a })),
                ]}
                className="w-[160px]"
              />
            </div>
          )}
          {availableTags.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-(--text-faint) text-xs">{t('projectDetail.filter.tag')}</label>
              <CustomSelect
                value={filterTag}
                onChange={v => setFilterTag(v)}
                options={[
                  { value: '', label: t('common.all') },
                  ...availableTags.map(tag => ({ value: tag, label: tag })),
                ]}
                className="w-[160px]"
              />
            </div>
          )}
          {hasActiveFilter && (
            <button
              onClick={() => { setFilterApp(''); setFilterTag(''); }}
              className="h-9 px-3 rounded-lg text-xs text-(--text-dim) bg-(--bg-surface) hover:bg-(--bg-subtle)/60 ring-1 ring-(--border) transition-colors cursor-pointer"
            >
              {t('logs.filter.clear')}
            </button>
          )}
        </div>
      )}

      {/* デバイス・グループ一覧 */}
      <div className="px-4 sm:px-6 pt-4 pb-8 space-y-4 md:space-y-5">
        {filteredDevices.length === 0 && (!hasGroups || hasActiveFilter) ? (
          <div className="overflow-hidden rounded-lg bg-(--bg-surface) ring-1 ring-(--border) p-12 text-center">
            <p className="text-(--text-faint) text-sm">
              {hasActiveFilter ? t('projectDetail.noFilteredDevices') : t('projectDetail.noDevices')}
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
                <div className="flex-1 h-px bg-(--bg-subtle)" />
                <span className="text-xs text-(--text-faint) whitespace-nowrap">{t('projectDetail.ungrouped')}</span>
                <div className="flex-1 h-px bg-(--bg-subtle)" />
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
          allDevices={devices}
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
