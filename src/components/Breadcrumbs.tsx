import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface Crumb {
  label: string;
  to?: string;
}

const SECTION_LABELS: Record<string, string> = {
  home:                'ホーム',
  projects:            'プロジェクト管理',
  'deletion-requests': '削除依頼',
  users:               'ユーザー管理',
  'api-tokens':        'API トークン',
  'pending-devices':   '承認待ちデバイス',
  logs:                'ログ',
  settings:            '設定',
};

export function Breadcrumbs({ onMenuOpen }: { onMenuOpen?: () => void }) {
  const location = useLocation();
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);

  useEffect(() => {
    async function build() {
      const parts = location.pathname.split('/').filter(Boolean);
      if (parts.length < 2) { setCrumbs([]); return; }

      const uuid    = parts[0];
      const section = parts[1];
      const base    = `/${uuid}`;
      const label   = SECTION_LABELS[section] ?? section;

      if (section === 'home' || parts.length === 2) {
        setCrumbs([]);
        return;
      }

      if (section === 'projects' && parts[2]) {
        const projectId = parts[2];
        const list: Crumb[] = [{ label, to: `${base}/projects` }];

        try {
          const snap = await getDoc(doc(db, 'projects', projectId));
          const projectName = snap.exists() ? (snap.data().name as string) : projectId;

          if (parts[3] === 'devices' && parts[4]) {
            list.push({ label: projectName, to: `${base}/projects/${projectId}` });
            try {
              const dSnap = await getDoc(doc(db, 'devices', parts[4]));
              list.push({ label: dSnap.exists() ? (dSnap.data().name as string) : parts[4] });
            } catch {
              list.push({ label: parts[4] });
            }
          } else {
            list.push({ label: projectName });
          }
        } catch {
          list.push({ label: projectId });
        }

        setCrumbs(list);
        return;
      }

      setCrumbs([]);
    }

    build();
  }, [location.pathname]);

  return (
    <div className="shrink-0 border-b border-zinc-800 bg-black py-3 px-4 sm:px-6">
      <div className="h-7 flex items-center gap-3">
        {/* Hamburger button — mobile only */}
        <button
          onClick={onMenuOpen}
          className="sm:hidden p-1 -ml-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors shrink-0"
          aria-label="メニューを開く"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {crumbs.length >= 2 && (
          <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 text-sm">
            {crumbs.map((crumb, i) => {
              const isLast = i === crumbs.length - 1;
              return (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className="text-zinc-700 shrink-0">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  )}
                  {crumb.to && !isLast ? (
                    <Link to={crumb.to} className="text-zinc-400 hover:text-zinc-200 transition-colors">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className={isLast ? 'text-zinc-200' : 'text-zinc-400'}>{crumb.label}</span>
                  )}
                </span>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}
