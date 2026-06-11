import { useRef, useState, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';

interface DatePickerInputProps {
  value: string;            // YYYY-MM-DD or ''
  onChange: (date: string) => void;
  min?: string;             // YYYY-MM-DD
  max?: string;             // YYYY-MM-DD
  clearable?: boolean;
  className?: string;
  placeholder?: string;
  size?: 'sm' | 'md';
}

function parseDate(str: string | undefined): Date | undefined {
  if (!str) return undefined;
  const [y, m, d] = str.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function DatePickerInput({
  value,
  onChange,
  min,
  max,
  clearable = true,
  className = '',
  placeholder,
  size = 'md',
}: DatePickerInputProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = parseDate(value);
  const minDate  = parseDate(min);
  const maxDate  = parseDate(max);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function handleSelect(date: Date | undefined) {
    if (date) {
      onChange(toDateStr(date));
    } else {
      onChange('');
    }
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
  }

  const isSmall = size === 'sm';
  const buttonClass = isSmall
    ? 'h-6 px-2 rounded-md text-xs text-zinc-300 bg-zinc-800 ring-1 ring-zinc-700 focus:outline-none focus:ring-zinc-500 cursor-pointer flex items-center gap-1.5 select-none'
    : 'h-9 bg-[#1a1a1a] ring-1 ring-[#3d3d3d] text-white text-sm rounded-lg px-3 outline-none focus:ring-[#4693ff] focus:ring-[1.5px] transition-all cursor-pointer flex items-center gap-2 select-none';

  // Format display
  let displayText = '';
  if (selected) {
    displayText = selected.toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'numeric', day: 'numeric',
    });
  }

  // Default month: show selected, or min, or today
  const defaultMonth = selected ?? minDate ?? new Date();

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={buttonClass}
      >
        {/* Calendar icon */}
        <svg
          width={isSmall ? 12 : 14}
          height={isSmall ? 12 : 14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={selected ? 'text-zinc-400' : 'text-zinc-500'}
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>

        {selected ? (
          <span className={isSmall ? 'text-zinc-300' : 'text-white'}>{displayText}</span>
        ) : (
          <span className="text-zinc-500">{placeholder ?? '—'}</span>
        )}

        {clearable && selected && (
          <span
            role="button"
            onClick={handleClear}
            className={`ml-auto text-zinc-500 hover:text-zinc-300 transition-colors leading-none ${isSmall ? '' : 'ml-1'}`}
            style={{ cursor: 'pointer' }}
          >
            ×
          </span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 rdp-popover">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            defaultMonth={defaultMonth}
            disabled={[
              ...(minDate ? [{ before: minDate }] : []),
              ...(maxDate ? [{ after: maxDate }] : []),
            ]}
          />
        </div>
      )}
    </div>
  );
}
