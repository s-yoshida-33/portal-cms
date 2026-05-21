import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Footer } from '../components/Footer';

const profileNav = [
  { to: '/profile/settings', label: '設定' },
  { to: '/profile/access',   label: 'アクセス管理' },
  { to: '/profile/tokens',   label: 'API トークン' },
];

export function ProfileLayout() {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const uuid = user?.uid ?? (import.meta.env.DEV ? 'dev' : '');

  return (
    <div className="flex h-screen bg-black">
      <aside className="w-56 shrink-0 bg-black border-r border-[#3d3d3d] flex flex-col h-full overflow-y-auto">

        {/* ロゴ（メインサイドバーと同じ） */}
        <div className="px-5 py-3 border-b border-[#3d3d3d]">
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="" className="w-7 h-7 shrink-0" />
            <span className="text-white font-semibold text-sm">Portal CMS</span>
          </div>
        </div>

        {/* ← マイ プロフィール (トレース対象UI) */}
        <header className="w-full h-[60px] flex items-center z-1 shrink-0 border-b border-[#3d3d3d]">
          <div className="flex items-center relative w-full h-[42px]">
            {/* 矢印コンテナ（クリック可能） */}
            <div className="h-full flex items-center justify-center shrink-0" style={{ width: '55px' }}>
              <button
                onClick={() => navigate(`/${uuid}/home/overview`)}
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
                  <path d="M14 7.5H3.439l4.29-4.387-.714-.699L1.55 8l5.465 5.586.714-.7L3.44 8.5h10.56v-1z"></path>
                </svg>
              </button>
            </div>
            {/* タイトルテキスト（クリック不可） */}
            <span className="flex-1 flex items-center justify-between relative">
              <p className="w-full text-white max-w-[167px] whitespace-nowrap overflow-hidden text-ellipsis font-semibold text-sm cursor-default select-none m-0">
                <span>マイ プロフィール</span>
              </p>
            </span>
          </div>
        </header>

        {/* ナビゲーションメニュー */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {profileNav.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
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

      <main className="flex-1 flex flex-col overflow-auto">
        <div className="flex-1">
          <Outlet />
        </div>
        <Footer />
      </main>
    </div>
  );
}