import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

const navItems = [
  { to: '/',           label: 'ダッシュボード' },
  { to: '/facilities', label: '施設管理' },
  { to: '/logs',       label: 'ログ' },
  { to: '/settings',   label: '設定' },
];

const userMenuItems = [
  { label: 'プロフィール', to: '/profile/settings' },
  { label: '外観',         to: '/profile/settings' },
  { label: '言語',         to: '/profile/settings' },
];

export function Sidebar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [userOpen, setUserOpen] = useState(false);

  async function handleSignOut() {
    await signOut(auth);
    navigate('/login');
  }

  const displayName = user?.displayName ?? user?.email?.split('@')[0] ?? 'ユーザー';
  const email = user?.email ?? '';

  return (
    <aside className="w-56 shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col min-h-screen">
      {/* ロゴ */}
      <div className="px-5 py-5 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z"/>
            </svg>
          </div>
          <span className="text-zinc-100 font-semibold text-sm">Portal CMS</span>
        </div>
      </div>

      {/* ナビゲーション */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
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

      {/* ユーザーメニュー */}
      <div className="px-2 py-3 border-t border-zinc-800">
        <button
          onClick={() => setUserOpen(o => !o)}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-zinc-800/60 transition-colors group"
        >
          {/* アバター */}
          <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center shrink-0 text-white text-xs font-medium">
            {displayName[0].toUpperCase()}
          </div>
          <span className="flex-1 text-left text-sm text-zinc-300 truncate">{displayName}</span>
          {/* シェブロン */}
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={`text-zinc-500 shrink-0 transition-transform duration-200 ${userOpen ? '' : '-rotate-90'}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* 展開メニュー */}
        <div
          className={`overflow-hidden transition-all duration-200 ease-in-out ${
            userOpen ? 'max-h-48 opacity-100 mt-1' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="space-y-0.5 pb-1">
            {userMenuItems.map(({ label, to }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center pl-11 pr-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
            <button
              onClick={handleSignOut}
              className="w-full flex items-center pl-11 pr-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-950/40 hover:text-red-300 transition-colors"
            >
              ログアウト
            </button>
          </div>
        </div>

        {/* メール表示 */}
        {!userOpen && (
          <p className="px-3 mt-0.5 text-xs text-zinc-600 truncate">{email}</p>
        )}
      </div>
    </aside>
  );
}
