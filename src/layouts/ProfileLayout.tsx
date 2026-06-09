import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Footer } from '../components/Footer';

const profileNav = [
  { to: '/profile/settings', label: '設定' },
  { to: '/profile/access',   label: 'アクセス管理' },
  { to: '/profile/tokens',   label: 'API トークン' },
];

export function ProfileLayout() {
  const { user }       = useAuth();
  const navigate       = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const uuid = user?.uid ?? (import.meta.env.DEV ? 'dev' : '');

  function closeMobile() { setMobileOpen(false); }

  return (
    <div className="flex h-screen bg-black">
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 sm:hidden transition-opacity duration-300 ${
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closeMobile}
      />

      {/* Sidebar */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 w-2/3',
          'transform transition-transform duration-300 ease-in-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'sm:static sm:inset-auto sm:z-auto sm:translate-x-0 sm:w-56 sm:shrink-0',
          'bg-black border-r border-[#3d3d3d] flex flex-col',
        ].join(' ')}
      >
        {/* ── Fixed top section ── */}
        <div className="shrink-0">
          {/* ロゴ */}
          <div className="px-5 py-3 border-b border-[#3d3d3d]">
            <div className="flex items-center gap-2.5">
              <img src="/logo.svg" alt="" className="w-7 h-7 shrink-0" />
              <span className="text-white font-semibold text-sm">Portal CMS</span>
            </div>
          </div>

          {/* ← マイ プロフィール */}
          <header className="w-full h-[60px] flex items-center z-1 shrink-0 border-b border-[#3d3d3d]">
            <div className="flex items-center relative w-full h-[42px]">
              <div className="h-full flex items-center justify-center shrink-0" style={{ width: '55px' }}>
                <button
                  onClick={() => { closeMobile(); navigate(`/${uuid}/home/overview`); }}
                  style={{ cursor: 'pointer' }}
                  className="h-full flex items-center justify-center w-full text-[#4693ff] hover:text-[#3860be] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#4693ff] rounded-sm"
                  aria-label="戻る"
                >
                  <svg
                    aria-label="戻る"
                    role="img"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 16 16"
                    width="20"
                    height="20"
                    fill="currentColor"
                    stroke="currentColor"
                    strokeWidth="0.5"
                  >
                    <path d="M14 7.5H3.439l4.29-4.387-.714-.699L1.55 8l5.465 5.586.714-.7L3.44 8.5h10.56v-1z" />
                  </svg>
                </button>
              </div>
              <span className="flex-1 flex items-center justify-between relative">
                <p className="w-full text-white max-w-[167px] whitespace-nowrap overflow-hidden text-ellipsis font-semibold text-sm cursor-default select-none m-0">
                  <span>マイ プロフィール</span>
                </p>
              </span>
            </div>
          </header>
        </div>

        {/* ── Scrollable navigation ── */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {profileNav.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={closeMobile}
              className={({ isActive }) =>
                `flex items-center px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#222222] text-white font-medium'
                    : 'text-[#999999] hover:bg-[#222222]/60 hover:text-white'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile header with hamburger */}
        <div className="shrink-0 border-b border-[#3d3d3d] bg-black py-3 px-4 sm:hidden">
          <div className="h-7 flex items-center">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-1 -ml-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
              aria-label="メニューを開く"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <main className="flex-1 flex flex-col overflow-auto">
          <div className="flex-1">
            <Outlet />
          </div>
          <Footer />
        </main>
      </div>
    </div>
  );
}
