import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

type Appearance = 'light' | 'dark' | 'system';
type Language   = 'ja' | 'en';
type Tab        = 'settings' | 'notifications';

const APPEARANCE_KEY = 'portal-appearance';
const LANGUAGE_KEY   = 'portal-language';

function formatMemberSince(creationTime: string | undefined): string {
  if (!creationTime) return '';
  const d = new Date(creationTime);
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const day = d.getDate();
  const suffix = day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th';
  return `${months[d.getMonth()]} ${day}${suffix}, ${d.getFullYear()}`;
}

function applyAppearance(value: Appearance) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  if (value === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.add(prefersDark ? 'dark' : 'light');
  } else {
    root.classList.add(value);
  }
  localStorage.setItem(APPEARANCE_KEY, value);
}

function AppearanceCard({ value, label, selected, onClick, disabled }: {
  value: Appearance; label: string; selected: boolean; onClick: () => void; disabled?: boolean;
}) {
  const previews: Record<Appearance, React.ReactNode> = {
    light: (
      <div className="w-full h-16 rounded bg-gray-100 border border-gray-200 overflow-hidden flex flex-col">
        <div className="h-3 bg-white border-b border-gray-200 flex items-center px-1.5 gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
          <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
          <span className="flex-1 h-1 rounded bg-gray-200 ml-0.5" />
        </div>
        <div className="flex flex-1">
          <div className="w-6 bg-gray-200" />
          <div className="flex-1 p-1 space-y-0.5">
            <div className="h-1 w-3/4 rounded bg-gray-300" />
            <div className="h-1 w-1/2 rounded bg-gray-200" />
          </div>
        </div>
      </div>
    ),
    dark: (
      <div className="w-full h-16 rounded bg-zinc-900 border border-zinc-700 overflow-hidden flex flex-col">
        <div className="h-3 bg-zinc-800 border-b border-zinc-700 flex items-center px-1.5 gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
          <span className="flex-1 h-1 rounded bg-zinc-700 ml-0.5" />
        </div>
        <div className="flex flex-1">
          <div className="w-6 bg-zinc-800" />
          <div className="flex-1 p-1 space-y-0.5">
            <div className="h-1 w-3/4 rounded bg-zinc-600" />
            <div className="h-1 w-1/2 rounded bg-zinc-700" />
          </div>
        </div>
      </div>
    ),
    system: (
      <div className="w-full h-16 rounded overflow-hidden border border-zinc-700 flex flex-col">
        <div className="h-3 flex items-center px-1.5 gap-1"
          style={{ background: 'linear-gradient(90deg, #fff 50%, #18181b 50%)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
          <span className="flex-1 h-1 rounded ml-0.5"
            style={{ background: 'linear-gradient(90deg, #e5e7eb 50%, #3f3f46 50%)' }} />
        </div>
        <div className="flex flex-1">
          <div className="w-6" style={{ background: 'linear-gradient(90deg, #e5e7eb 50%, #27272a 50%)' }} />
          <div className="flex-1 p-1 space-y-0.5"
            style={{ background: 'linear-gradient(90deg, #f9fafb 50%, #18181b 50%)' }}>
            <div className="h-1 w-3/4 rounded"
              style={{ background: 'linear-gradient(90deg, #d1d5db 50%, #52525b 50%)' }} />
            <div className="h-1 w-1/2 rounded"
              style={{ background: 'linear-gradient(90deg, #e5e7eb 50%, #3f3f46 50%)' }} />
          </div>
        </div>
      </div>
    ),
  };

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`relative flex flex-col gap-2 p-2 rounded-xl border transition-all ${
        disabled
          ? 'border-zinc-800 bg-zinc-800/20 opacity-50 cursor-not-allowed'
          : selected
            ? 'border-blue-500 bg-blue-950/20'
            : 'border-zinc-700 hover:border-zinc-600 bg-zinc-800/40'
      }`}
    >
      {previews[value]}
      <div className="flex items-center gap-1.5 px-1">
        <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
          disabled ? 'border-zinc-700' : selected ? 'border-blue-500 bg-blue-500' : 'border-zinc-600'
        }`}>
          {selected && !disabled && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
        </span>
        <span className={`text-xs font-medium ${disabled ? 'text-zinc-600' : selected ? 'text-blue-400' : 'text-zinc-400'}`}>
          {label}
        </span>
      </div>
      {disabled && (
        <span className="absolute top-1.5 right-1.5 px-1 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-500 border border-zinc-700">
          準備中
        </span>
      )}
    </button>
  );
}

function SettingRow({ title, badge, description, children }: {
  title: string;
  badge?: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-8 py-5 border-b border-zinc-800">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-zinc-200">{title}</h3>
          {badge && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-950/50 text-green-400 border border-green-900/50">
              {badge}
            </span>
          )}
        </div>
        {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

export function ProfileSettings() {
  const { user } = useAuth();

  const [tab,               setTab]               = useState<Tab>('settings');
  const [language,          setLanguage]           = useState<Language>(
    () => (localStorage.getItem(LANGUAGE_KEY) as Language | null) ?? 'ja'
  );
  const [appearance,        setAppearance]         = useState<Appearance>(
    () => (localStorage.getItem(APPEARANCE_KEY) as Appearance | null) ?? 'dark'
  );
  const [showDeleteConfirm, setShowDeleteConfirm]  = useState(false);
  const [toast,             setToast]              = useState<{ msg: string; ok: boolean } | null>(null);

  const isGoogleUser = user?.providerData.some(p => p.providerId === 'google.com') ?? false;
  const memberSince  = formatMemberSince(user?.metadata.creationTime);
  const email        = user?.email ?? '';

  useEffect(() => {
    localStorage.setItem(LANGUAGE_KEY, language);
  }, [language]);

  function handleAppearanceChange(val: Appearance) {
    try {
      setAppearance(val);
      applyAppearance(val);
      showAppearanceToast('外観が更新されました', true);
    } catch {
      showAppearanceToast('外観の更新に失敗しました', false);
    }
  }

  function showAppearanceToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 max-w-2xl w-full mx-auto px-8 py-8">

        {/* ヘッダー */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-zinc-100">プロフィール</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {email}
            {memberSince && (
              <>
                <span className="mx-2 text-zinc-700">·</span>
                メンバー登録日 {memberSince}
              </>
            )}
          </p>
        </div>

        {/* タブ */}
        <div className="flex border-b border-zinc-800 mb-0">
          {(['settings', 'notifications'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-zinc-100 text-zinc-100'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t === 'settings' ? '設定' : '通知'}
            </button>
          ))}
        </div>

        {tab === 'settings' ? (
          <div>
            {/* メール */}
            <SettingRow
              title="メール"
              badge={!isGoogleUser ? '確認済み' : undefined}
              description={isGoogleUser ? 'Googleアカウントで認証されているため変更できません。' : undefined}
            >
              <div className="flex gap-2">
                <input
                  type="email"
                  readOnly
                  value={email}
                  className="w-52 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-400 cursor-not-allowed"
                />
                {!isGoogleUser && (
                  <button className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors">
                    メールを更新
                  </button>
                )}
              </div>
            </SettingRow>

            {/* 言語（即時反映・自動保存） */}
            <SettingRow title="言語" description="UIの表示言語を選択してください。">
              <select
                value={language}
                onChange={e => setLanguage(e.target.value as Language)}
                className="w-36 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
              >
                <option value="ja">日本語</option>
                <option value="en">English</option>
              </select>
            </SettingRow>

            {/* 外観（即時反映・トースト通知） */}
            <div className="py-5 border-b border-zinc-800">
              <h3 className="text-sm font-medium text-zinc-200 mb-3">外観</h3>
              <div className="grid grid-cols-3 gap-3">
                <AppearanceCard value="light"  label="ライト"           selected={appearance === 'light'}  onClick={() => handleAppearanceChange('light')}  disabled />
                <AppearanceCard value="dark"   label="ダーク"           selected={appearance === 'dark'}   onClick={() => handleAppearanceChange('dark')}   />
                <AppearanceCard value="system" label="システム設定を使用" selected={appearance === 'system'} onClick={() => handleAppearanceChange('system')} disabled />
              </div>
            </div>

            {/* プロフィールを削除 */}
            <div className="py-5">
              <h3 className="text-sm font-medium text-zinc-200 mb-1">プロフィールを削除</h3>
              <p className="text-xs text-zinc-500 mb-4">
                ユーザー {email} を完全に削除します。この操作は取り消せません。
              </p>
              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-3 py-1.5 border border-red-800 text-red-400 hover:bg-red-950/40 text-sm font-medium rounded-lg transition-colors"
                >
                  ユーザーを削除
                </button>
              ) : (
                <div className="p-4 border border-red-800 rounded-xl bg-red-950/20 space-y-3">
                  <p className="text-sm text-red-300 font-medium">本当に削除しますか？</p>
                  <p className="text-xs text-red-400/70">
                    すべてのデータが完全に削除されます。この操作は取り消せません。
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
                    >
                      キャンセル
                    </button>
                    <button className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors">
                      削除する
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-16 text-center text-zinc-500 text-sm">
            通知設定は準備中です。
          </div>
        )}
      </div>

      {/* フッター */}
      <footer className="border-t border-zinc-800 px-8 py-4">
        <div className="max-w-2xl mx-auto flex flex-wrap items-center gap-x-4 gap-y-1">
          {[
            'サポート', 'システム ステータス', 'キャリア', '利用規約',
            'セキュリティ問題を報告する', 'プライバシー ポリシー',
          ].map(item => (
            <a key={item} href="#"
              className="text-xs text-zinc-500 hover:text-zinc-400 transition-colors">
              {item}
            </a>
          ))}
          <span className="text-xs text-zinc-600">© 2026</span>
        </div>
      </footer>

      {/* 外観変更トースト */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm font-medium border transition-all animate-in fade-in slide-in-from-bottom-2 ${
            toast.ok
              ? 'bg-zinc-800 border-zinc-700 text-zinc-100'
              : 'bg-red-950/90 border-red-800 text-red-300'
          }`}
        >
          {toast.ok ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className="text-green-400 shrink-0">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className="text-red-400 shrink-0">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          )}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
