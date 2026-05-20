import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const profileNav = [
  { to: '/profile/settings', label: '設定' },
  { to: '/profile/access',   label: 'アクセス管理' },
  { to: '/profile/tokens',   label: 'API トークン' },
];

export function ProfileLayout() {
  const { user } = useAuth();
  const uuid = user?.uid ?? '';

  return (
    <div className="flex min-h-screen bg-zinc-950">
      {/* プロフィール用サイドバー */}
      <aside className="w-56 shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col min-h-screen">
        <div className="px-4 py-4 border-b border-zinc-800">
          <Link
            to={`/${uuid}/home/overview`}
            className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            ダッシュボードに戻る
          </Link>
        </div>

        <div className="px-5 py-4 border-b border-zinc-800">
          <p className="text-sm font-semibold text-zinc-100">マイ プロフィール</p>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {profileNav.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-zinc-800 text-zinc-100 font-medium'
                    : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
