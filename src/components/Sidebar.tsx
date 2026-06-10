import React, { useState, useEffect } from 'react';
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

interface Props {
  mobileOpen:    boolean;
  onMobileClose: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: Props) {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const { uuid } = useParams<{ uuid: string }>();
  const [userOpen,            setUserOpen]            = useState(false);
  const [pendingCount,        setPendingCount]        = useState(0);
  const [pendingDevicesCount, setPendingDevicesCount] = useState(0);

  const base = uuid ? `/${uuid}` : '';

  useEffect(() => {
    if (role !== 'owner') return;
    return subscribeDeletionRequests(reqs => setPendingCount(reqs.length));
  }, [role]);

  useEffect(() => {
    if (role !== 'admin' && role !== 'owner') return;
    return subscribePendingDevices(devs => setPendingDevicesCount(devs.length));
  }, [role]);

  const navItems: { to: string; label: string; badge: number; icon?: React.ReactNode }[] = [
    { to: `${base}/home/overview`,    label: 'ホーム',            badge: 0 },
    { to: `${base}/projects`,         label: 'プロジェクト管理',  badge: 0 },
    ...(role === 'admin' || role === 'owner' ? [
      { to: `${base}/api-tokens`,      label: 'API トークン',     badge: 0 },
      { to: `${base}/pending-devices`, label: '承認待ちデバイス', badge: pendingDevicesCount },
    ] : []),
    ...(role === 'owner' ? [
      { to: `${base}/deletion-requests`, label: '削除依頼',    badge: pendingCount },
      { to: `${base}/users`,             label: 'ユーザー管理', badge: 0 },
    ] : []),
    { to: `${base}/logs`,     label: 'ログ', badge: 0 },
    {
      to: `${base}/settings`, label: '設定', badge: 0,
      icon: (
        <svg className="w-4 h-4 fill-current opacity-50 shrink-0" role="presentation" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zm0 4a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
          <path d="M12.475 8l1.86-1.798-1.62-2.804-2.435.697L9.627 1.5h-3.25L5.75 4.095 3.3 3.398 1.68 6.204l1.87 1.807-1.87 1.81 1.62 2.806 2.45-.7.637 2.572h3.25l.643-2.565 2.465.705 1.622-2.805L12.475 8zm-.225 3.453l-2.183-.628-.67.463-.55 2.212h-1.68l-.55-2.2-.647-.475-2.195.628L2.935 10 4.57 8.42v-.81L2.935 6.027l.84-1.455 2.197.63.648-.517.547-2.185h1.68l.55 2.195.645.518 2.208-.64.84 1.454-1.638 1.583.025.808L13.1 10l-.85 1.453z" />
        </svg>
      ),
    },
  ];

  async function handleSignOut() {
    await signOut(auth);
    navigate('/login');
  }

  const displayName = user?.displayName ?? user?.email?.split('@')[0] ?? 'ユーザー';

  return (
    <aside
      className={[
        // Mobile: fixed drawer sliding in from left
        'fixed inset-y-0 left-0 z-50 w-2/3',
        'transform transition-transform duration-300 ease-in-out',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        // Desktop: normal sidebar in flex flow
        'sm:static sm:inset-auto sm:z-auto sm:translate-x-0 sm:w-56 sm:shrink-0',
        // Common
        'bg-black border-r border-zinc-800 flex flex-col',
      ].join(' ')}
    >
      {/* ── Fixed top section (logo + user menu) ── */}
      <div className="shrink-0">
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
            <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center shrink-0 text-white text-xs font-medium">
              {displayName[0].toUpperCase()}
            </div>
            <span className="flex-1 text-left text-sm text-zinc-300 truncate">{displayName}</span>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`text-zinc-500 shrink-0 transition-transform duration-200 ${userOpen ? '' : '-rotate-90'}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

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
                  onClick={onMobileClose}
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
      </div>

      {/* ── Scrollable navigation ── */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {navItems.map(({ to, label, badge, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onMobileClose}
            className={({ isActive }) =>
              `flex items-center gap-2 justify-between px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                isActive
                  ? 'bg-zinc-800 text-zinc-100 font-medium'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
              }`
            }
          >
            <span className="flex items-center gap-2 min-w-0">
              {icon}
              <span className="truncate">{label}</span>
            </span>
            {badge > 0 && (
              <span className="flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold shrink-0">
                {badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
