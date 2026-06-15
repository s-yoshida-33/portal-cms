import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import type { DateRange } from 'react-day-picker';
import { enUS } from 'react-day-picker/locale';
import 'react-day-picker/style.css';

// ── helpers ───────────────────────────────────────────────────────

function ymdToDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split('-').map(Number);
  return (y && m && d) ? new Date(y, m - 1, d) : undefined;
}

function dateToYmd(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function CalIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="shrink-0">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

// ── types ─────────────────────────────────────────────────────────

export interface DateRangePickerProps {
  mode?: 'range' | 'single';
  /** Start date or single date (YYYY-MM-DD or '') */
  from: string;
  /** End date (YYYY-MM-DD or ''), ignored in single mode */
  to: string;
  /** Called with (from, to) on Apply; single mode passes (date, '') */
  onApply: (from: string, to: string) => void;
  min?: string;
  max?: string;
  size?: 'sm' | 'md';
  className?: string;
}

// ── component ─────────────────────────────────────────────────────

export function DateRangePicker({
  mode = 'range',
  from,
  to,
  onApply,
  min,
  max,
  size = 'md',
  className = '',
}: DateRangePickerProps) {
  const [open, setOpen]             = useState(false);
  const [draftFrom, setDraftFrom]   = useState(from);
  const [draftTo,   setDraftTo]     = useState(to);
  const [popupPos, setPopupPos]     = useState({ up: false, right: false });
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef     = useRef<HTMLDivElement>(null);

  // Flip popup horizontally if it overflows the right edge
  useLayoutEffect(() => {
    if (!open || !popupRef.current) {
      setPopupPos({ up: false, right: false });
      return;
    }
    const rect = popupRef.current.getBoundingClientRect();
    setPopupPos({
      up:    false,
      right: rect.right > window.innerWidth - 8,
    });
  }, [open]);

  // Reset draft to current props every time popup opens
  useEffect(() => {
    if (open) { setDraftFrom(from); setDraftTo(to); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Calendar selection handlers
  function handleRangeSelect(r: DateRange | undefined) {
    setDraftFrom(r?.from ? dateToYmd(r.from) : '');
    setDraftTo(r?.to   ? dateToYmd(r.to)   : '');
  }

  function handleSingleSelect(d: Date | undefined) {
    setDraftFrom(d ? dateToYmd(d) : '');
    setDraftTo('');
  }

  function handleApply() {
    onApply(draftFrom, draftTo);
    setOpen(false);
  }

  function handleClear() {
    setDraftFrom('');
    setDraftTo('');
    onApply('', '');
  }

  // Dates for DayPicker
  const minDate = ymdToDate(min);
  const maxDate = ymdToDate(max);
  const disabled = [
    ...(maxDate ? [{ after: maxDate }] : []),
    ...(minDate ? [{ before: minDate }] : []),
  ];

  const rangeSelected: DateRange | undefined = mode === 'range'
    ? { from: ymdToDate(draftFrom), to: ymdToDate(draftTo) }
    : undefined;

  const singleSelected = mode === 'single' ? ymdToDate(draftFrom) : undefined;

  const defaultMonth = ymdToDate(draftFrom) ?? ymdToDate(draftTo) ?? maxDate ?? new Date();

  // Trigger button
  const isSmall = size === 'sm';
  const hasValue = !!from || (mode === 'range' && !!to);
  const buttonLabel = mode === 'range'
    ? (from && to ? `${from} – ${to}` : from ? `${from} –` : '—')
    : (from || '—');

  const btnBase = isSmall
    ? 'h-6 px-2 rounded-md text-xs bg-[var(--bg-subtle)] ring-1 ring-[var(--border)] focus:outline-none focus:ring-[var(--accent)]'
    : 'h-9 px-3 rounded-lg text-sm bg-[var(--bg-raised)] ring-1 ring-[var(--border)] focus:ring-[#4693ff] focus:ring-[1.5px]';

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>

      {/* ── Trigger ── */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`${btnBase} flex items-center gap-1.5 cursor-pointer select-none outline-none transition-all`}
      >
        <span className="text-[var(--text-dim)]"><CalIcon size={isSmall ? 12 : 14} /></span>
        <span className={hasValue ? (isSmall ? 'text-[var(--text-muted)]' : 'text-[var(--text)]') : 'text-[var(--text-dim)]'}>
          {buttonLabel}
        </span>
      </button>

      {/* ── Popup ── */}
      {open && (
        <div
          ref={popupRef}
          className={[
            'absolute z-50 bg-[var(--bg-surface)] ring-1 ring-[var(--border)] rounded-xl shadow-2xl overflow-hidden',
            popupPos.up    ? 'bottom-full mb-1' : 'top-full mt-1',
            popupPos.right ? 'right-0'          : 'left-0',
          ].join(' ')}
        >

          {/* Calendar */}
          <div className="p-3 border-b border-[var(--bg-hover)]">
            {mode === 'range' ? (
              <DayPicker
                mode="range"
                selected={rangeSelected}
                onSelect={handleRangeSelect}
                locale={enUS}
                defaultMonth={defaultMonth}
                disabled={disabled}
              />
            ) : (
              <DayPicker
                mode="single"
                selected={singleSelected}
                onSelect={handleSingleSelect}
                locale={enUS}
                defaultMonth={defaultMonth}
                disabled={disabled}
              />
            )}
          </div>

          {/* Start / End display */}
          <div className="px-3 py-3 border-b border-[var(--bg-hover)] space-y-2">
            <div>
              <p className="text-[var(--text-dim)] text-xs mb-1">Start</p>
              <div className="flex items-center gap-2 h-9 bg-[var(--bg-raised)] ring-1 ring-[var(--border)] rounded-lg px-3 text-sm">
                <span className="text-[var(--text-dim)]"><CalIcon size={13} /></span>
                <span className={draftFrom ? 'text-[var(--text)]' : 'text-[var(--text-dim)]'}>
                  {draftFrom || '—'}
                </span>
              </div>
            </div>
            {mode === 'range' && (
              <div>
                <p className="text-[var(--text-dim)] text-xs mb-1">End</p>
                <div className="flex items-center gap-2 h-9 bg-[var(--bg-raised)] ring-1 ring-[var(--border)] rounded-lg px-3 text-sm">
                  <span className="text-[var(--text-dim)]"><CalIcon size={13} /></span>
                  <span className={draftTo ? 'text-[var(--text)]' : 'text-[var(--text-dim)]'}>
                    {draftTo || '—'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Footer: buttons */}
          <div className="px-3 py-2.5 flex items-center gap-3">
            <div className="flex-1" />
            {(draftFrom || draftTo) && (
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-[var(--text-dim)] hover:text-[var(--text-muted)] transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={handleApply}
              className="h-8 px-5 rounded-lg text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
            >
              Apply
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
