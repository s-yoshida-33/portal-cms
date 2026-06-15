interface PaginationProps {
  page:     number;
  total:    number;
  pageSize: number;
  onChange: (p: number) => void;
}

export function Pagination({ page, total, pageSize, onChange }: PaginationProps) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (last <= 1) return null;
  const btn = (label: string, target: number, disabled: boolean) => (
    <button
      onClick={() => onChange(target)}
      disabled={disabled}
      className="h-7 min-w-7 px-2 rounded-md text-xs text-[var(--text-muted)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] ring-1 ring-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-center justify-center mt-4">
      <div className="flex items-center gap-2">
        {btn('«', 1,        page === 1)}
        {btn('‹', page - 1, page === 1)}
        <span className="h-7 px-3 flex items-center text-xs text-[var(--text-muted)]">{page} / {last}</span>
        {btn('›', page + 1, page === last)}
        {btn('»', last,     page === last)}
      </div>
    </div>
  );
}
