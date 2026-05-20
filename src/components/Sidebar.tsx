import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/',           label: 'ダッシュボード', icon: '◼' },
  { to: '/facilities', label: '施設管理',       icon: '◼' },
  { to: '/logs',       label: 'ログ',           icon: '◼' },
  { to: '/settings',   label: '設定',           icon: '◼' },
];

export function Sidebar() {
  return (
    <aside className="w-60 shrink-0 bg-slate-900 text-slate-300 flex flex-col min-h-screen">
      <div className="px-6 py-5 border-b border-slate-700">
        <span className="text-white font-semibold text-lg tracking-tight">Portal CMS</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-slate-700 text-white'
                  : 'hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-6 py-4 border-t border-slate-700 text-xs text-slate-500">
        v0.1.0
      </div>
    </aside>
  );
}
