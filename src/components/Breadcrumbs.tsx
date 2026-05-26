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

export function Breadcrumbs() {
  const location = useLocation();
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);

  useEffect(() => {
    async function build() {
      const parts = location.pathname.split('/').filter(Boolean);
      // parts[0]=uuid, parts[1]=section, parts[2]=projectId?, parts[3]='devices'?, parts[4]=deviceId?
      if (parts.length < 2) { setCrumbs([]); return; }

      const uuid    = parts[0];
      const section = parts[1];
      const base    = `/${uuid}`;
      const label   = SECTION_LABELS[section] ?? section;

      // Single-level pages: no breadcrumb content
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
    <div className="shrink-0 border-b border-zinc-800 bg-black py-3 px-6">
      <div className="h-7 flex items-center">
        {crumbs.length >= 2 && (
          <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 text-sm">
            {crumbs.map((crumb, i) => {
              const isLast = i === crumbs.length - 1;
              return (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-zinc-700">&gt;</span>}
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
