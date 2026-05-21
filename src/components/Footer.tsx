export function Footer() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 z-20 bg-black border-t border-zinc-800 px-4 py-2.5 min-h-12">
      <div className="flex justify-center">
        <ul className="m-0 flex items-center justify-center flex-wrap gap-4 [&>li]:list-none [&>li>a]:text-sm [&>li>a]:border-l [&>li>a]:border-zinc-800 [&>li>a]:pl-4 [&>li:first-child>a]:border-l-0">
          <li><a className="text-zinc-500 no-underline transition-colors hover:text-white" href="#">サポート</a></li>
          <li><a className="text-zinc-500 no-underline transition-colors hover:text-white" href="#">システム ステータス</a></li>
          <li><a className="text-zinc-500 no-underline transition-colors hover:text-white" href="#">キャリア</a></li>
          <li><a className="text-zinc-500 no-underline transition-colors hover:text-white" href="#">利用規約</a></li>
          <li><a className="text-zinc-500 no-underline transition-colors hover:text-white" href="#">セキュリティ問題を報告する</a></li>
          <li><a className="text-zinc-500 no-underline transition-colors hover:text-white" href="#">プライバシー ポリシー</a></li>
          <li><span className="text-sm text-zinc-600">© 2026 Toei Techno International Inc.</span></li>
        </ul>
      </div>
    </footer>
  );
}
