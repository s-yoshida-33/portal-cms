import { useEffect, useState, useRef } from 'react';
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

// --- 完全再現用のカスタムセレクトコンポーネント ---
interface SelectOption<T> {
  value: T;
  label: string;
}

interface CustomSelectProps<T> {
  value: T;
  onChange: (val: T) => void;
  options: SelectOption<T>[];
}

function CustomSelect<T extends string>({ value, onChange, options }: CustomSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedIndex = options.findIndex(opt => opt.value === value);
  const currentLabel = options[selectedIndex]?.label ?? '';

  // メニュー開閉アニメーション中に位置が跳ぶのを防ぐため、
  // 開いた瞬間のインデックスをロックし閉じるまで保持する
  const [lockedIndex, setLockedIndex] = useState(selectedIndex);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const itemHeight = 36;
  const menuPaddingY = 6;
  const topOffset = -(lockedIndex * itemHeight + menuPaddingY);
  const originY = menuPaddingY + lockedIndex * itemHeight + (itemHeight / 2);

  return (
    <div ref={containerRef} className="relative min-w-[200px] w-full sm:w-max">
      {/* トリガーボタン */}
      <button
        type="button"
        onClick={() => {
          if (!isOpen) setLockedIndex(selectedIndex);
          setIsOpen(o => !o);
        }}
        style={{ cursor: 'pointer' }}
        className="group flex w-full sm:w-max shrink-0 items-center select-none border-0 shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4693ff] bg-[#111111] text-white ring-1 hover:bg-[#222222] ring-[#3d3d3d] h-9 rounded-lg pl-3 pr-10 text-base font-normal min-w-[200px] justify-between text-left transition-colors"
      >
        <span className="truncate">{currentLabel}</span>
        <span className="absolute right-3 flex shrink-0 items-center text-[#999999] pointer-events-none">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256">
            <path d="M181.66,170.34a8,8,0,0,1,0,11.32l-48,48a8,8,0,0,1-11.32,0l-48-48a8,8,0,0,1,11.32-11.32L128,212.69l42.34-42.35A8,8,0,0,1,181.66,170.34Zm-96-84.68L128,43.31l42.34,42.35a8,8,0,0,0,11.32-11.32l-48-48a8,8,0,0,0-11.32,0l-48,48A8,8,0,0,0,85.66,85.66Z"></path>
          </svg>
        </span>
      </button>

      {/* 展開されるメニューリスト (常にDOMに配置し、見切れと点滅を解消) */}
      <div
        style={{ 
          top: `${topOffset}px`, 
          left: '-8px', 
          minWidth: 'calc(100% + 16px)', // ボタンの幅＋余白を最低限確保
          width: 'max-content', // テキストが長い場合は自動で広がるように修正（見切れ解消）
          transformOrigin: `50% ${originY}px`,
          visibility: isOpen ? 'visible' : 'hidden', // 完全に出し入れせず隠す（点滅解消）
          transition: 'opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        className={`absolute z-50 flex flex-col bg-[#111111] text-white rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.5)] ring-1 ring-[#3d3d3d] py-1.5 px-2 ${
          isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.96] pointer-events-none'
        }`}
      >
        <div role="listbox" className="overflow-y-auto overscroll-none max-h-[300px] flex flex-col no-scrollbar">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <div
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                style={{ cursor: 'pointer' }}
                // アイテムの右側に十分な余白(pr-4)とギャップ(gap-6)を確保
                // 選択中の固定スタイル（背景・枠線）を削除し、ホバー時のみ共通の背景色を適用
                className={`group flex w-full h-9 shrink-0 items-center justify-between gap-6 rounded-md pl-3 pr-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-[#4693ff] transition-colors hover:bg-[#222222]/60 hover:text-white ${
                  isSelected 
                    ? 'text-white' 
                    : 'text-[#d9d9d9]'
                }`}
              >
                <div className="whitespace-nowrap">{opt.label}</div>
                {isSelected && (
                  <span aria-hidden="true" className="text-[#4693ff] shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"></path>
                    </svg>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ProfileSettings() {
  const { user } = useAuth();

  const [tab, setTab] = useState<Tab>('settings');
  const [language, setLanguage] = useState<Language>(
    () => (localStorage.getItem(LANGUAGE_KEY) as Language | null) ?? 'ja'
  );
  const [appearance, setAppearance] = useState<Appearance>(
    () => (localStorage.getItem(APPEARANCE_KEY) as Appearance | null) ?? 'dark'
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

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

  const btnClasses = "group flex w-max shrink-0 items-center font-medium select-none border-0 shadow-xs focus:outline-none focus:ring-[#4693ff]/50 focus-visible:ring-2 focus-visible:ring-[#4693ff] cursor-pointer disabled:cursor-not-allowed disabled:text-[#797979] bg-[#111111] text-white ring-1 hover:bg-[#222222] ring-[#3d3d3d] h-9 gap-1.5 rounded-lg px-3 text-base transition-colors";
  const btnDangerClasses = "group flex w-max shrink-0 items-center font-medium select-none border-0 shadow-xs focus:outline-none focus:ring-[#fc574a]/50 focus-visible:ring-2 focus-visible:ring-[#fc574a] cursor-pointer bg-[#e81403] text-white hover:bg-[#b20f03] ring-1 ring-[#e81403] h-9 gap-1.5 rounded-lg px-3 text-base transition-colors";

  const languageOptions: SelectOption<Language>[] = [
    { value: 'ja', label: '日本語' },
    { value: 'en', label: 'English' }
  ];

  const appearanceOptions: SelectOption<Appearance>[] = [
    { value: 'light',  label: 'ライト' },
    { value: 'dark',   label: 'ダーク' },
    { value: 'system', label: 'システム設定を使用' },
  ];

  return (
    <div className="flex flex-col min-w-0 bg-black text-white font-sans min-h-screen">

      {/* ロゴエリアと高さを揃えるスペーサー */}
      <div className="py-3 border-b border-[#3d3d3d] bg-black">
        <div className="h-7" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-4 py-6 px-4 sm:px-6 border-b border-[#3d3d3d] bg-black">
        <div className="flex flex-col gap-2">
          <h1 className="text-white text-3xl font-semibold">プロフィール</h1>
          <div className="hidden md:block">
            <p className="text-[#999999] text-base">
              {email} {memberSince && `· アカウント登録日 ${memberSince}`}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <header className="flex items-center justify-between h-[58px] gap-3 px-4 border-b border-[#3d3d3d] sticky z-20 bg-black top-0">
        <div className="relative isolate min-w-0 font-medium">
          <div className="absolute inset-x-0 top-1/2 z-0 -translate-y-1/2 rounded-lg bg-[#222222] h-9"></div>
          <div role="tablist" className="relative flex min-w-0 shrink items-stretch overflow-x-auto rounded-lg bg-[#222222] px-0.5 ring-1 ring-[#3d3d3d] h-9">
            <button
              onClick={() => setTab('settings')}
              style={{ cursor: 'pointer' }}
              className={`no-underline relative z-2 flex items-center whitespace-nowrap focus:outline-none focus:ring-[#4693ff]/50 focus-visible:ring-2 focus-visible:ring-[#4693ff] text-base my-0.5 rounded-md px-2.5 transition-colors ${
                tab === 'settings'
                  ? 'bg-[#111111] text-white shadow-sm ring-1 ring-[#3d3d3d]'
                  : 'bg-transparent text-[#999999] hover:text-white'
              }`}
            >
              設定
            </button>
            <button
              onClick={() => setTab('notifications')}
              style={{ cursor: 'pointer' }}
              className={`no-underline relative z-2 flex items-center whitespace-nowrap focus:outline-none focus:ring-[#4693ff]/50 focus-visible:ring-2 focus-visible:ring-[#4693ff] text-base my-0.5 rounded-md px-2.5 transition-colors ${
                tab === 'notifications'
                  ? 'bg-[#111111] text-white shadow-sm ring-1 ring-[#3d3d3d]'
                  : 'bg-transparent text-[#999999] hover:text-white'
              }`}
            >
              通知
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full h-full grow flex flex-col gap-0">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_min(100%,56rem)_1fr] p-4 sm:p-6 gap-y-5">
          <div className="md:col-start-2">
            
            {tab === 'settings' ? (
              <div className="flex flex-col gap-y-5">
                
                {/* Email Section */}
                <div className="bg-[#111111] shadow-xs ring-1 ring-[#3d3d3d] overflow-visible rounded-lg p-6">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="text-white text-lg font-semibold flex items-center gap-2">
                          <span>メール</span>
                          {!isGoogleUser && (
                            <span className="inline-flex w-fit flex-none shrink-0 items-center justify-self-start rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap bg-white text-black">
                              <span>確認済み</span>
                            </span>
                          )}
                        </h3>
                      </div>
                      {isGoogleUser && (
                        <span className="text-[#999999] text-base">Googleアカウントで認証されているため変更できません。</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <input
                          readOnly
                          value={email}
                          className="border-0 bg-[#313131] text-white ring-1 ring-[#3d3d3d] outline-none focus:outline-none placeholder:text-[#767676] disabled:text-[#797979] h-9 gap-1.5 rounded-lg px-3 text-base focus:ring-[#4693ff]/50 focus:ring-[1.5px] pointer-events-none w-full"
                        />
                      </div>
                      {!isGoogleUser && (
                        <div className="shrink-0">
                          <button 
                            style={{ cursor: 'pointer' }}
                            className={btnClasses}
                          >
                            <span>メールを更新</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Language Section */}
                <div className="bg-[#111111] shadow-xs ring-1 ring-[#3d3d3d] overflow-visible rounded-lg p-6">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h3 className="text-white text-lg font-semibold">言語</h3>
                        </div>
                        <span className="text-[#999999] text-base">UIの表示言語を選択してください。</span>
                      </div>
                      <div className="shrink-0">
                        <CustomSelect
                          value={language}
                          onChange={(val) => setLanguage(val)}
                          options={languageOptions}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Appearance Section */}
                <div className="bg-[#111111] shadow-xs ring-1 ring-[#3d3d3d] overflow-visible rounded-lg p-6">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h3 className="text-white text-lg font-semibold">外観</h3>
                        </div>
                        <span className="text-[#999999] text-base">ダッシュボードのカラーテーマを選択してください。</span>
                      </div>
                      <div className="shrink-0">
                        <CustomSelect
                          value={appearance}
                          onChange={(val) => handleAppearanceChange(val)}
                          options={appearanceOptions}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Delete Profile Section */}
                <div className="bg-[#111111] shadow-xs ring-1 ring-[#3d3d3d] overflow-visible rounded-lg p-6">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h3 className="text-white text-lg font-semibold">プロフィールを削除</h3>
                        </div>
                        <span className="text-[#999999] text-base">ユーザー {email} を削除します。</span>
                      </div>
                      <div className="shrink-0">
                        {!showDeleteConfirm ? (
                          <button
                            onClick={() => setShowDeleteConfirm(true)}
                            style={{ cursor: 'pointer' }}
                            className="group flex w-max shrink-0 items-center font-medium select-none border-0 shadow-xs focus:outline-none focus:ring-[#fc574a]/50 focus-visible:ring-2 focus-visible:ring-[#fc574a] cursor-pointer disabled:cursor-not-allowed bg-[#111111] text-[#fc574a] ring-1 ring-[#fc574a] hover:bg-[#fc574a]/10 h-9 gap-1.5 rounded-lg px-3 text-base transition-colors"
                          >
                            <span>ユーザーを削除</span>
                          </button>
                        ) : (
                          <div className="p-4 border rounded-lg bg-[#3c0501]/50 border-[#970d02]/50 space-y-3 mt-4 sm:mt-0">
                            <p className="text-sm text-[#fc574a] font-semibold">本当に削除しますか？</p>
                            <p className="text-sm text-[#fc574a]/80">
                              すべてのデータが完全に削除されます。この操作は取り消せません。
                            </p>
                            <div className="flex gap-2 mt-4">
                              <button
                                onClick={() => setShowDeleteConfirm(false)}
                                style={{ cursor: 'pointer' }}
                                className="group flex w-max shrink-0 items-center font-medium select-none border-0 shadow-xs focus:outline-none focus:ring-[#4693ff]/50 focus-visible:ring-2 focus-visible:ring-[#4693ff] bg-[#111111] text-white ring-1 hover:bg-[#222222] ring-[#3d3d3d] h-9 gap-1.5 rounded-lg px-3 text-base transition-colors"
                              >
                                キャンセル
                              </button>
                              <button 
                                style={{ cursor: 'pointer' }}
                                className={btnDangerClasses}
                              >
                                削除する
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            ) : (
              <div className="py-16 text-center text-[#999999] text-base">
                通知設定は準備中です。
              </div>
            )}

          </div>
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-lg text-sm font-medium border transition-all animate-fade-slide-in z-50 ${
            toast.ok
              ? 'bg-[#111111] border-[#3d3d3d] text-white'
              : 'bg-[#3c0501] border-[#970d02] text-[#fc574a]'
          }`}
        >
          {toast.ok ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className="text-[#2db35e] shrink-0">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className="text-[#fc574a] shrink-0">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          )}
          {toast.msg}
        </div>
      )}
    </div>
  );
}