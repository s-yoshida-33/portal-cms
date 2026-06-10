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
      className="h-7 min-w-7 px-2 rounded-md text-xs text-zinc-300 bg-[#222222] hover:bg-[#2a2a2a] ring-1 ring-[#3d3d3d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-center justify-center mt-4">
      <div className="flex items-center gap-2">
        {btn('«', 1,        page === 1)}
        {btn('‹', page - 1, page === 1)}
        <span className="h-7 px-3 flex items-center text-xs text-zinc-400">{page} / {last}</span>
        {btn('›', page + 1, page === last)}
        {btn('»', last,     page === last)}
      </div>
    </div>
  );
}
