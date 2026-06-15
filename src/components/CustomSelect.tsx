import { useState, useEffect, useRef } from 'react';

export interface SelectOption<T> {
  value: T;
  label: string;
}

interface CustomSelectProps<T> {
  value:     T;
  onChange:  (val: T) => void;
  options:   SelectOption<T>[];
  disabled?: boolean;
  className?: string;
}

export function CustomSelect<T extends string>({
  value, onChange, options, disabled = false, className,
}: CustomSelectProps<T>) {
  const [isOpen,    setIsOpen]    = useState(false);
  const [direction, setDirection] = useState<'down' | 'up'>('down');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedIndex = options.findIndex(opt => opt.value === value);
  const currentLabel  = options[selectedIndex]?.label ?? '';

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleToggle() {
    if (!isOpen && containerRef.current) {
      const rect       = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const menuHeight = Math.min(options.length * 36 + 12, 312);
      setDirection(spaceBelow >= menuHeight + 8 ? 'down' : 'up');
    }
    setIsOpen(o => !o);
  }

  const dropdownStyle: React.CSSProperties = direction === 'down'
    ? { top: 'calc(100% + 6px)', bottom: 'auto',           left: '-8px', minWidth: 'calc(100% + 16px)', width: 'max-content', transformOrigin: 'top center' }
    : { bottom: 'calc(100% + 6px)', top: 'auto',           left: '-8px', minWidth: 'calc(100% + 16px)', width: 'max-content', transformOrigin: 'bottom center' };

  return (
    <div ref={containerRef} className={`relative ${className ?? 'min-w-[200px] w-full sm:w-max'}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
        className="group flex w-full items-center select-none border-0 shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4693ff] bg-[var(--bg-surface)] text-[var(--text)] ring-1 hover:bg-[var(--bg-subtle)] ring-[var(--border)] h-9 rounded-lg pl-3 pr-10 text-base font-normal justify-between text-left transition-colors disabled:opacity-50"
      >
        <span className="truncate">{currentLabel}</span>
        <span className="absolute right-3 flex shrink-0 items-center text-[var(--text-dim)] pointer-events-none">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256">
            <path d="M181.66,170.34a8,8,0,0,1,0,11.32l-48,48a8,8,0,0,1-11.32,0l-48-48a8,8,0,0,1,11.32-11.32L128,212.69l42.34-42.35A8,8,0,0,1,181.66,170.34Zm-96-84.68L128,43.31l42.34,42.35a8,8,0,0,0,11.32-11.32l-48-48a8,8,0,0,0-11.32,0l-48,48A8,8,0,0,0,85.66,85.66Z" />
          </svg>
        </span>
      </button>

      {isOpen && (
        <div
          style={dropdownStyle}
          className={`absolute z-50 flex flex-col bg-[var(--bg-surface)] text-[var(--text)] rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.5)] ring-1 ring-[var(--border)] py-1.5 px-2 ${
            isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.96] pointer-events-none'
          }`}
        >
          <div role="listbox" className="overflow-y-auto overscroll-none max-h-[300px] flex flex-col no-scrollbar">
            {options.map(opt => {
              const isSelected = opt.value === value;
              return (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => { onChange(opt.value); setIsOpen(false); }}
                  style={{ cursor: 'pointer' }}
                  className={`group flex w-full h-9 shrink-0 items-center justify-between gap-6 rounded-md pl-3 pr-4 text-base outline-none transition-colors hover:bg-[var(--bg-subtle)]/60 hover:text-[var(--text)] ${
                    isSelected ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'
                  }`}
                >
                  <div className="whitespace-nowrap">{opt.label}</div>
                  {isSelected && (
                    <span aria-hidden="true" className="text-[#4693ff] shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256">
                        <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" />
                      </svg>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
