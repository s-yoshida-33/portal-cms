import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { subscribeDeletionRequests, subscribePendingDevices } from '../lib/firestore';

const userMenuItems = [
  { label: 'プロフィール', to: '/profile/settings' },
  { label: '外観',         to: '/profile/settings' },
  { label: '言語',         to: '/profile/settings' },
];

export function Sidebar() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const { uuid } = useParams<{ uuid: string }>();
  const [userOpen,             setUserOpen]             = useState(false);
  const [pendingCount,         setPendingCount]         = useState(0);
  const [pendingDevicesCount,  setPendingDevicesCount]  = useState(0);

  const base = uuid ? `/${uuid}` : '';

  useEffect(() => {
    if (role !== 'owner') return;
    const unsub = subscribeDeletionRequests(reqs => setPendingCount(reqs.length));
    return unsub;
  }, [role]);

  useEffect(() => {
    if (role !== 'admin' && role !== 'owner') return;
    const unsub = subscribePendingDevices(devs => setPendingDevicesCount(devs.length));
    return unsub;
  }, [role]);

  const navItems = [
    { to: `${base}/home/overview`,    label: 'ホーム',            badge: 0 },
    { to: `${base}/projects`,         label: 'プロジェクト管理',  badge: 0 },
    ...(role === 'admin' || role === 'owner' ? [
      { to: `${base}/api-tokens`,      label: 'API トークン',       badge: 0 },
      { to: `${base}/pending-devices`, label: '承認待ちデバイス', badge: pendingDevicesCount },
    ] : []),
    ...(role === 'owner' ? [
      { to: `${base}/deletion-requests`, label: '削除依頼',    badge: pendingCount },
      { to: `${base}/users`,             label: 'ユーザー管理', badge: 0 },
    ] : []),
    { to: `${base}/logs`,             label: 'ログ',      badge: 0 },
    { to: `${base}/settings`,         label: '設定',      badge: 0 },
  ];

  async function handleSignOut() {
    await signOut(auth);
    navigate('/login');
  }

  const displayName = user?.displayName ?? user?.email?.split('@')[0] ?? 'ユーザー';

  return (
    <aside className="w-56 shrink-0 bg-black border-r border-zinc-800 flex flex-col h-full overflow-y-auto">
      {/* ロゴ */}
      <div className="px-5 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="" className="w-7 h-7 shrink-0" />
          <span className="text-zinc-100 font-semibold text-sm">Portal CMS</span>
        </div>
      </div>

      {/* ユーザーメニュー */}
      <div className="px-2 py-3 border-b border-zinc-800">
        <button
          onClick={() => setUserOpen(o => !o)}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-zinc-800/60 transition-colors group cursor-pointer"
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
                  `flex items-center pl-11 pr-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
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
              className="w-full flex items-center pl-11 pr-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-950/40 hover:text-red-300 transition-colors cursor-pointer"
            >
              ログアウト
            </button>
          </div>
        </div>

      </div>

      {/* ナビゲーション */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map(({ to, label, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                isActive
                  ? 'bg-zinc-800 text-zinc-100 font-medium'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
              }`
            }
          >
            {label}
            {badge > 0 && (
              <span className="flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold">
                {badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
