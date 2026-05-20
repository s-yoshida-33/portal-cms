import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

type Appearance = 'light' | 'dark' | 'system';
type Language   = 'ja' | 'en';

function formatMemberSince(creationTime: string | undefined): string {
  if (!creationTime) return '';
  const d = new Date(creationTime);
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const day = d.getDate();
  const suffix = day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th';
  return `${months[d.getMonth()]} ${day}${suffix}, ${d.getFullYear()}`;
}

// 外観プレビューカード
function AppearanceCard({
  value, label, selected, onClick,
}: { value: Appearance; label: string; selected: boolean; onClick: () => void }) {
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
      onClick={onClick}
      className={`flex flex-col gap-2 p-2 rounded-xl border transition-all ${
        selected
          ? 'border-blue-500 bg-blue-950/20'
          : 'border-zinc-700 hover:border-zinc-600 bg-zinc-800/40'
      }`}
    >
      {previews[value]}
      <div className="flex items-center gap-1.5 px-1">
        <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
          selected ? 'border-blue-500 bg-blue-500' : 'border-zinc-600'
        }`}>
          {selected && (
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
          )}
        </span>
        <span className={`text-xs font-medium ${selected ? 'text-blue-400' : 'text-zinc-400'}`}>
          {label}
        </span>
      </div>
    </button>
  );
}

// セクションラッパー
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-zinc-800 py-8">
      <h2 className="text-base font-semibold text-zinc-100 mb-5">{title}</h2>
      {children}
    </div>
  );
}

// ラベル付き行
function SettingRow({ label, description, children }: {
  label: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-8">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-200">{label}</p>
        {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function ProfileSettings() {
  const { user } = useAuth();
  const isGoogleUser = user?.providerData.some(p => p.providerId === 'google.com') ?? false;
  const memberSince  = formatMemberSince(user?.metadata.creationTime);

  const [language,   setLanguage]   = useState<Language>('ja');
  const [appearance, setAppearance] = useState<Appearance>('dark');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const displayName = user?.displayName ?? user?.email?.split('@')[0] ?? 'ユーザー';
  const email       = user?.email ?? '';

  return (
    <div className="max-w-2xl mx-auto px-8 py-8">

      {/* ヘッダー：ユーザー情報 */}
      <div className="flex items-center gap-4 pb-8 border-b border-zinc-800">
        <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
          {user?.photoURL
            ? <img src={user.photoURL} alt="" className="w-14 h-14 rounded-full object-cover" />
            : <span className="text-white text-xl font-semibold">{displayName[0].toUpperCase()}</span>
          }
        </div>
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">{displayName}</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            {email}
            {memberSince && (
              <>
                <span className="mx-2 text-zinc-700">·</span>
                メンバー登録日 {memberSince}
              </>
            )}
          </p>
        </div>
      </div>

      {/* メールアドレス */}
      <Section title="メールアドレス">
        <SettingRow
          label="メールアドレス"
          description={isGoogleUser ? 'Googleアカウントで認証されているため変更できません。' : undefined}
        >
          <div className="relative">
            <input
              type="email"
              readOnly
              value={email}
              className="w-64 px-3 py-2 pr-9 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-400 cursor-not-allowed"
            />
            {isGoogleUser && (
              <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            )}
          </div>
        </SettingRow>
      </Section>

      {/* 言語 */}
      <Section title="言語">
        <SettingRow label="表示言語" description="UIの表示言語を選択してください。">
          <div className="flex items-center gap-2">
            <select
              value={language}
              onChange={e => setLanguage(e.target.value as Language)}
              className="w-40 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
            >
              <option value="ja">日本語</option>
              <option value="en">English</option>
            </select>
            <button className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
              保存
            </button>
          </div>
        </SettingRow>
      </Section>

      {/* 外観 */}
      <Section title="外観">
        <p className="text-sm text-zinc-400 mb-4">テーマを選択してください。</p>
        <div className="grid grid-cols-3 gap-3">
          <AppearanceCard value="light"  label="ライト"          selected={appearance === 'light'}  onClick={() => setAppearance('light')}  />
          <AppearanceCard value="dark"   label="ダーク"          selected={appearance === 'dark'}   onClick={() => setAppearance('dark')}   />
          <AppearanceCard value="system" label="システム設定を使用" selected={appearance === 'system'} onClick={() => setAppearance('system')} />
        </div>
      </Section>

      {/* プロフィール削除 */}
      <div className="py-8">
        <h2 className="text-base font-semibold text-zinc-100 mb-1">プロフィール削除</h2>
        <p className="text-sm text-zinc-500 mb-5">
          アカウントデータを完全に削除します。この操作は取り消せません。
        </p>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 border border-red-800 text-red-400 hover:bg-red-950/40 text-sm font-medium rounded-lg transition-colors"
          >
            アカウントを削除
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
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
              >
                キャンセル
              </button>
              <button className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors">
                削除する
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
