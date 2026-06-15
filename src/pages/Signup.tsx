import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

export function Signup() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  // 認証済みになったらホームへ遷移（リダイレクト認証・既ログイン両方に対応）
  useEffect(() => {
    if (!authLoading && user) {
      navigate(`/${user.uid}/home/overview`, { replace: true });
    }
  }, [user, authLoading, navigate]);

  async function handleGoogleSignup() {
    setError('');
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch {
      setError(t('auth.error.googleSignupFailed'));
      setLoading(false);
    }
  }

  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError(t('auth.error.passwordMismatch'));
      return;
    }
    if (password.length < 8) {
      setError(t('auth.error.passwordTooShort'));
      return;
    }
    setLoading(true);
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      navigate(`/${result.user.uid}/home/overview`);
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === 'auth/email-already-in-use') {
        setError(t('auth.error.emailInUse'));
      } else {
        setError(t('auth.error.createFailed'));
      }
    } finally {
      setLoading(false);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center">
        <p className="text-[var(--text-faint)] text-sm">{t('auth.authenticating')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <img src="/logo.svg" alt="" className="w-12 h-12" />
          </div>
          <h1 className="text-xl font-semibold text-[var(--text)]">Portal CMS</h1>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-8">
          <h2 className="text-lg font-semibold text-[var(--text)] mb-6">{t('auth.signupTitle')}</h2>

          {/* Google */}
          <button
            onClick={handleGoogleSignup}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] font-medium transition-colors disabled:opacity-50 mb-6 cursor-pointer"
          >
            <GoogleIcon />
            {t('auth.signupWithGoogle')}
          </button>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--border)]" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 bg-[var(--bg-surface)] text-xs text-[var(--text-faint)]">{t('auth.or')}</span>
            </div>
          </div>

          {/* Email form */}
          <form onSubmit={handleEmailSignup} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-dim)] mb-1.5">
                {t('auth.emailLabel')}
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] placeholder-zinc-500 focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-dim)] mb-1.5">
                {t('auth.passwordLabel')} <span className="text-[var(--text-faint)] font-normal">{t('auth.passwordNote')}</span>
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] placeholder-zinc-500 focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-dim)] mb-1.5">
                {t('auth.passwordConfirm')}
              </label>
              <input
                type="password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full px-3 py-2.5 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] placeholder-zinc-500 focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              {loading ? t('auth.creating') : t('auth.createAccount')}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-[var(--text-faint)] mt-6">
          {t('auth.alreadyHaveAccount')}{' '}
          <Link to="/login" className="text-[var(--accent)] hover:text-[var(--accent-hover)]">
            {t('auth.login')}
          </Link>
        </p>
      </div>
    </div>
  );
}
