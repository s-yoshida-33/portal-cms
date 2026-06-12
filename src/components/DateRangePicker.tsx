import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import type { DateRange } from 'react-day-picker';
import { enUS } from 'react-day-picker/locale';
import 'react-day-picker/style.css';
import { useTimezone } from '../contexts/TimezoneContext';

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
  const { timezone, setTimezone } = useTimezone();
  const [open, setOpen]             = useState(false);
  const [draftFrom, setDraftFrom]   = useState(from);
  const [draftTo,   setDraftTo]     = useState(to);
  const [popupPos, setPopupPos]     = useState({ up: false, right: false });
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef     = useRef<HTMLDivElement>(null);

  // Flip popup direction so it stays within the viewport
  useLayoutEffect(() => {
    if (!open || !popupRef.current) {
      setPopupPos({ up: false, right: false });
      return;
    }
    const rect = popupRef.current.getBoundingClientRect();
    setPopupPos({
      up:    rect.bottom > window.innerHeight - 8,
      right: rect.right  > window.innerWidth  - 8,
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
    setOpen(false);
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
    ? 'h-6 px-2 rounded-md text-xs bg-zinc-800 ring-1 ring-zinc-700 focus:outline-none focus:ring-zinc-500'
    : 'h-9 px-3 rounded-lg text-sm bg-[#1a1a1a] ring-1 ring-[#3d3d3d] focus:ring-[#4693ff] focus:ring-[1.5px]';

  const tzLabel = timezone === 'utc' ? 'UTC (UTC+0)' : 'GMT+09:00 (GMT+9)';

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>

      {/* ── Trigger ── */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`${btnBase} flex items-center gap-1.5 cursor-pointer select-none outline-none transition-all`}
      >
        <span className="text-zinc-500"><CalIcon size={isSmall ? 12 : 14} /></span>
        <span className={hasValue ? (isSmall ? 'text-zinc-300' : 'text-white') : 'text-zinc-500'}>
          {buttonLabel}
        </span>
      </button>

      {/* ── Popup ── */}
      {open && (
        <div
          ref={popupRef}
          className={[
            'absolute z-50 bg-[#111111] ring-1 ring-[#3d3d3d] rounded-xl shadow-2xl overflow-hidden',
            popupPos.up    ? 'bottom-full mb-1' : 'top-full mt-1',
            popupPos.right ? 'right-0'          : 'left-0',
          ].join(' ')}
        >

          {/* Calendar */}
          <div className="p-3 border-b border-[#2a2a2a]">
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
          <div className="px-3 py-3 border-b border-[#2a2a2a] space-y-2">
            <div>
              <p className="text-zinc-500 text-xs mb-1">Start</p>
              <div className="flex items-center gap-2 h-9 bg-[#1a1a1a] ring-1 ring-[#3d3d3d] rounded-lg px-3 text-sm">
                <span className="text-zinc-500"><CalIcon size={13} /></span>
                <span className={draftFrom ? 'text-white' : 'text-zinc-500'}>
                  {draftFrom ? `${draftFrom}${mode === 'range' ? ' 00:00' : ''}` : '—'}
                </span>
              </div>
            </div>
            {mode === 'range' && (
              <div>
                <p className="text-zinc-500 text-xs mb-1">End</p>
                <div className="flex items-center gap-2 h-9 bg-[#1a1a1a] ring-1 ring-[#3d3d3d] rounded-lg px-3 text-sm">
                  <span className="text-zinc-500"><CalIcon size={13} /></span>
                  <span className={draftTo ? 'text-white' : 'text-zinc-500'}>
                    {draftTo ? `${draftTo} 23:59` : '—'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Footer: timezone + buttons */}
          <div className="px-3 py-2.5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setTimezone(timezone === 'utc' ? 'local' : 'utc')}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              {tzLabel}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="7 15 12 20 17 15" />
                <polyline points="7 9 12 4 17 9" />
              </svg>
            </button>
            <div className="flex-1" />
            {(draftFrom || draftTo) && (
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={handleApply}
              className="h-8 px-5 rounded-lg text-sm font-semibold text-white bg-[#4693ff] hover:bg-[#3578e0] transition-colors cursor-pointer"
            >
              Apply
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
