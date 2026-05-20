export function Placeholder({ title }: { title: string }) {
  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-zinc-100 mb-1">{title}</h1>
      <p className="text-sm text-zinc-500">この機能は今後実装予定です。</p>
    </div>
  );
}
