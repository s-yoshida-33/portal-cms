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
    {
      to: `${base}/home/overview`, label: 'ホーム', badge: 0,
      icon: (
        <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current opacity-50 shrink-0" role="presentation" aria-hidden="true">
          <path d="M14.172 7.878 8 2.52 1.828 7.878l-.656-.756 6.5-5.641h.656l6.5 5.641-.656.756Z" />
          <path fillRule="evenodd" d="M4 8.101V13h2.125V9.759l.5-.5h2.75l.5.5V13H12V8.101h1V13.5l-.5.5h-9l-.5-.5V8.101h1ZM8.875 13h-1.75v-2.741h1.75V13Z" />
        </svg>
      ),
    },
    {
      to: `${base}/projects`, label: 'プロジェクト管理', badge: 0,
      icon: (
        <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current opacity-50 shrink-0" role="presentation" aria-hidden="true">
          <path d="M5.5 11.238H3.75v-1H5.5v1zM3.75 9.237H5.5v-1H3.75v1zM5.5 7.237H3.75v-1H5.5v1zM6.5 11.238h5.75v-1H6.5v1zM12.25 9.237H6.5v-1h5.75v1zM6.5 7.237h5.75v-1H6.5v1z" />
          <path fillRule="evenodd" d="M1.5 3l.5-.5h4.75l.419.227.852 1.306H14l.5.5V13l-.5.5H2l-.5-.5V3zm1 .5v9h11V5.033H7.75l-.419-.227L6.48 3.5H2.5z" />
        </svg>
      ),
    },
    ...(role === 'admin' || role === 'owner' ? [
      {
        to: `${base}/api-tokens`, label: 'API トークン', badge: 0,
        icon: (
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current opacity-50 shrink-0" role="presentation" aria-hidden="true">
            <path d="M5.562 14.5v-.995c-1.15 0-1.506-.539-1.506-1.727V9.747c0-.828-.252-1.442-1.387-1.67v-.153c1.135-.229 1.387-.843 1.387-1.67V4.221c0-1.188.357-1.727 1.506-1.727V1.5c-1.942 0-2.576.853-2.576 2.722v1.625c0 1.112-.381 1.544-1.486 1.544v1.218c1.105 0 1.486.432 1.486 1.544v1.625c0 1.869.634 2.722 2.576 2.722zM10.438 1.5v.995c1.15 0 1.506.539 1.506 1.727v2.031c0 .828.252 1.442 1.387 1.67v.153c-1.134.229-1.387.843-1.387 1.67v2.032c0 1.188-.357 1.727-1.506 1.727v.995c1.942 0 2.576-.853 2.576-2.722v-1.625c0-1.112.381-1.544 1.486-1.544V7.391c-1.105 0-1.486-.432-1.486-1.544V4.222c0-1.869-.634-2.722-2.576-2.722z" />
          </svg>
        ),
      },
      {
        to: `${base}/pending-devices`, label: '承認待ちデバイス', badge: pendingDevicesCount,
        icon: (
          <svg viewBox="0 0 256 256" className="w-4 h-4 fill-current opacity-50 shrink-0" role="presentation" aria-hidden="true">
            <path d="M208,36H48A20,20,0,0,0,28,56v56c0,54.29,26.32,87.22,48.4,105.29,23.71,19.39,47.44,26,48.44,26.29a12.1,12.1,0,0,0,6.32,0c1-.28,24.73-6.9,48.44-26.29,22.08-18.07,48.4-51,48.4-105.29V56A20,20,0,0,0,208,36Zm-4,76c0,35.71-13.09,64.69-38.91,86.15A126.28,126.28,0,0,1,128,219.38a126.14,126.14,0,0,1-37.09-21.23C65.09,176.69,52,147.71,52,112V60H204ZM79.51,144.49a12,12,0,1,1,17-17L112,143l47.51-47.52a12,12,0,0,1,17,17l-56,56a12,12,0,0,1-17,0Z" />
          </svg>
        ),
      },
    ] : []),
    ...(role === 'owner' ? [
      {
        to: `${base}/deletion-requests`, label: '削除依頼', badge: pendingCount,
        icon: (
          <svg viewBox="0 0 256 256" className="w-4 h-4 fill-current opacity-50 shrink-0" role="presentation" aria-hidden="true">
            <path d="M42.76,50A8,8,0,0,0,40,56V224a8,8,0,0,0,16,0V179.77c26.79-21.16,49.87-9.75,76.45,3.41,16.4,8.11,34.06,16.85,53,16.85,13.93,0,28.54-4.75,43.82-18a8,8,0,0,0,2.76-6V56A8,8,0,0,0,218.76,50c-28,24.23-51.72,12.49-79.21-1.12C111.07,34.76,78.78,18.79,42.76,50ZM216,172.25c-26.79,21.16-49.87,9.74-76.45-3.41-25-12.35-52.81-26.13-83.55-8.4V59.79c26.79-21.16,49.87-9.75,76.45,3.4,25,12.35,52.82,26.13,83.55,8.4Z" />
          </svg>
        ),
      },
      {
        to: `${base}/users`, label: 'ユーザー管理', badge: 0,
        icon: (
          <svg viewBox="0 0 256 256" className="w-4 h-4 fill-current opacity-50 shrink-0" role="presentation" aria-hidden="true">
            <path d="M244.8,150.4a8,8,0,0,1-11.2-1.6A51.6,51.6,0,0,0,192,128a8,8,0,0,1-7.37-4.89,8,8,0,0,1,0-6.22A8,8,0,0,1,192,112a24,24,0,1,0-23.24-30,8,8,0,1,1-15.5-4A40,40,0,1,1,219,117.51a67.94,67.94,0,0,1,27.43,21.68A8,8,0,0,1,244.8,150.4ZM190.92,212a8,8,0,1,1-13.84,8,57,57,0,0,0-98.16,0,8,8,0,1,1-13.84-8,72.06,72.06,0,0,1,33.74-29.92,48,48,0,1,1,58.36,0A72.06,72.06,0,0,1,190.92,212ZM128,176a32,32,0,1,0-32-32A32,32,0,0,0,128,176ZM72,120a8,8,0,0,0-8-8A24,24,0,1,1,87.24,82a8,8,0,1,0,15.5-4A40,40,0,1,0,37,117.51,67.94,67.94,0,0,0,9.6,139.19a8,8,0,1,0,12.8,9.61A51.6,51.6,0,0,1,64,128,8,8,0,0,0,72,120Z" />
          </svg>
        ),
      },
    ] : []),
    {
      to: `${base}/logs`, label: 'ログ', badge: 0,
      icon: (
        <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current opacity-50 shrink-0" role="presentation" aria-hidden="true">
          <path d="M14 7.523h-2.027V6.02l-.146-.352-3.982-4.012h-.002L7.49 1.51H2.51l-.5.5v12l.5.5h8.963l.5-.5v-1.487H14l.5-.5v-4l-.5-.5Zm-6.01-4.3 2.281 2.297H7.99V3.223Zm2.982 10.287H3.01v-11h3.98v3.51l.5.5h3.482v1.003h-5.98l-.5.5v4l.5.5h5.98v.987Zm2.528-1.987H5.492v-3H13.5v3Z" />
          <path d="M8.063 9.26H6.995l-.567 1.533h1.067l.567-1.533Zm2.25 0H9.245l-.567 1.533h1.067l.568-1.533Zm2.25 0h-1.068l-.567 1.533h1.067l.568-1.533Z" />
        </svg>
      ),
    },
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
            <img src="/logo.svg" alt="" className="w-6 h-6 shrink-0" />
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
