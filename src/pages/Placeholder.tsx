export function Placeholder({ title }: { title: string }) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">{title}</h1>
      <p className="text-sm text-gray-400">この機能は今後実装予定です。</p>
    </div>
  );
}
