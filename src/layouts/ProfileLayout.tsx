import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Footer } from '../components/Footer';

const profileNav: { to?: string; label: string; icon: React.ReactNode }[] = [
  {
    to: '/profile/settings', label: '設定',
    icon: (
      <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current opacity-50 shrink-0" role="presentation" aria-hidden="true">
        <path d="M5.685 11.864l.254-.136 7.105-7.085v-.707l-2.48-2.48h-.707L2.753 8.54l-.138.258-.605 3.105.59.586 3.085-.625zM3.567 9.14l6.643-6.625 1.773 1.773-6.644 6.625-2.205.447.433-2.22zM14 13.5H2v1h12v-1z" />
      </svg>
    ),
  },
  {
    label: 'アクセス管理',
    icon: (
      <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current opacity-50 shrink-0" role="presentation" aria-hidden="true">
        <path d="M12.39 6.902h-1.193V4.705a3.197 3.197 0 10-6.394 0v2.197H3.61l-.5.5V14l.5.5h8.78l.5-.5V7.402l-.5-.5zM5.803 4.705a2.197 2.197 0 014.394 0v2.197H5.803V4.705zM11.89 13.5H4.11V7.902h7.78V13.5z" />
        <path d="M8 8.95a.965.965 0 00-.43 1.83v1.57h.86v-1.57A.965.965 0 008 8.95z" />
      </svg>
    ),
  },
  {
    label: 'API トークン',
    icon: (
      <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current opacity-50 shrink-0" role="presentation" aria-hidden="true">
        <path d="M5.562 14.5v-.995c-1.15 0-1.506-.539-1.506-1.727V9.747c0-.828-.252-1.442-1.387-1.67v-.153c1.135-.229 1.387-.843 1.387-1.67V4.221c0-1.188.357-1.727 1.506-1.727V1.5c-1.942 0-2.576.853-2.576 2.722v1.625c0 1.112-.381 1.544-1.486 1.544v1.218c1.105 0 1.486.432 1.486 1.544v1.625c0 1.869.634 2.722 2.576 2.722zM10.438 1.5v.995c1.15 0 1.506.539 1.506 1.727v2.031c0 .828.252 1.442 1.387 1.67v.153c-1.134.229-1.387.843-1.387 1.67v2.032c0 1.188-.357 1.727-1.506 1.727v.995c1.942 0 2.576-.853 2.576-2.722v-1.625c0-1.112.381-1.544 1.486-1.544V7.391c-1.105 0-1.486-.432-1.486-1.544V4.222c0-1.869-.634-2.722-2.576-2.722z" />
      </svg>
    ),
  },
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
          {profileNav.map(({ to, label, icon }) =>
            to ? (
              <NavLink
                key={label}
                to={to}
                onClick={closeMobile}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#222222] text-white font-medium'
                      : 'text-[#999999] hover:bg-[#222222]/60 hover:text-white'
                  }`
                }
              >
                {icon}
                {label}
              </NavLink>
            ) : (
              <div
                key={label}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-[#555555] cursor-default select-none"
              >
                <span className="flex items-center gap-2">
                  {icon}
                  {label}
                </span>
                <span className="text-[10px] text-zinc-600 bg-zinc-800 ring-1 ring-zinc-700 px-1.5 py-0.5 rounded">準備中</span>
              </div>
            )
          )}
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
