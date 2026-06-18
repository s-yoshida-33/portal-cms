import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

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
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef      = useRef<HTMLDivElement>(null);

  const selectedIndex = options.findIndex(opt => opt.value === value);
  const currentLabel  = options[selectedIndex]?.label ?? '';

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        menuRef.current      && !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Scroll anywhere → close (capture phase catches scrolls inside modals too)
  useEffect(() => {
    if (!isOpen) return;
    function handleScroll() { setIsOpen(false); }
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isOpen]);

  function handleToggle() {
    if (disabled) return;
    if (!isOpen && containerRef.current) {
      const rect       = containerRef.current.getBoundingClientRect();
      const menuHeight = Math.min(options.length * 36 + 12, 312);

      // Walk up the DOM to find the nearest overflow:hidden ancestor (modal boundary).
      // Fall back to the full viewport when no clipping ancestor is found.
      let boundaryTop    = 0;
      let boundaryBottom = window.innerHeight;
      let el: HTMLElement | null = containerRef.current.parentElement;
      while (el && el !== document.body) {
        const s = window.getComputedStyle(el);
        if (s.overflow === 'hidden' || s.overflowY === 'hidden' ||
            s.overflow === 'clip'   || s.overflowY === 'clip') {
          const r     = el.getBoundingClientRect();
          boundaryTop    = r.top;
          boundaryBottom = r.bottom;
          break;
        }
        el = el.parentElement;
      }

      const spaceBelow = boundaryBottom - rect.bottom;
      const spaceAbove = rect.top - boundaryTop;
      const goDown     = spaceBelow >= menuHeight + 8 || spaceBelow >= spaceAbove;

      setMenuStyle(goDown
        ? {
            position: 'fixed',
            top:      rect.bottom + 6,
            left:     rect.left - 8,
            minWidth: rect.width + 16,
            width:    'max-content',
            transformOrigin: 'top center',
            zIndex:   9999,
          }
        : {
            position: 'fixed',
            bottom:   window.innerHeight - rect.top + 6,
            left:     rect.left - 8,
            minWidth: rect.width + 16,
            width:    'max-content',
            transformOrigin: 'bottom center',
            zIndex:   9999,
          }
      );
    }
    setIsOpen(o => !o);
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? 'min-w-[200px] w-full sm:w-max'}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
        className="group flex w-full items-center select-none border-0 shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4693ff] bg-(--bg-surface) text-(--text) ring-1 hover:bg-(--bg-subtle) ring-(--border) h-9 rounded-lg pl-3 pr-10 text-base font-normal justify-between text-left transition-colors disabled:opacity-50"
      >
        <span className="truncate">{currentLabel}</span>
        <span className="absolute right-3 flex shrink-0 items-center text-(--text-dim) pointer-events-none">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256">
            <path d="M181.66,170.34a8,8,0,0,1,0,11.32l-48,48a8,8,0,0,1-11.32,0l-48-48a8,8,0,0,1,11.32-11.32L128,212.69l42.34-42.35A8,8,0,0,1,181.66,170.34Zm-96-84.68L128,43.31l42.34,42.35a8,8,0,0,0,11.32-11.32l-48-48a8,8,0,0,0-11.32,0l-48,48A8,8,0,0,0,85.66,85.66Z" />
          </svg>
        </span>
      </button>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="flex flex-col bg-(--bg-surface) text-(--text) rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.5)] ring-1 ring-(--border) py-1.5 px-2"
        >
          <div role="listbox" className="overflow-y-auto overscroll-none max-h-[300px] flex flex-col no-scrollbar">
            {options.map(opt => {
              const isSelected = opt.value === value;
              return (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => { onChange(opt.value as T); setIsOpen(false); }}
                  style={{ cursor: 'pointer' }}
                  className={`group flex w-full h-9 shrink-0 items-center justify-between gap-6 rounded-md pl-3 pr-4 text-base outline-none transition-colors hover:bg-(--bg-subtle)/60 hover:text-(--text) ${
                    isSelected ? 'text-(--text)' : 'text-(--text-muted)'
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
        </div>,
        document.body
      )}
    </div>
  );
}
