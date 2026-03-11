import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { Lock, Mail, AlertCircle } from 'lucide-react';
import WorkOSLogo from '../components/WorkOSLogo';

export default function Login() {
  const { login } = useAuth();
  const { t } = useLocale();
  const [email, setEmail] = useState('info@montegreen.co.uk');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-astra-bg flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/3 w-80 h-80 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-purple/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-[400px] relative z-10">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            <WorkOSLogo size={64} showText={true} />
          </div>
          <p className="text-astra-text-muted text-sm mt-3">{t('login_subtitle')}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-astra-card rounded-2xl p-8 border border-astra-border shadow-astra-lg"
        >
          {error && (
            <div className="flex items-center gap-2 bg-danger/10 border border-danger/20 text-danger px-4 py-3 rounded-lg mb-5 text-sm">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          <div className="mb-4">
            <label className="astra-label">{t('email')}</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-astra-text-muted" size={15} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="astra-input pl-10"
                placeholder="info@montegreen.co.uk"
                required
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="astra-label">{t('password')}</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-astra-text-muted" size={15} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="astra-input pl-10"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="astra-btn-primary w-full flex items-center justify-center gap-2 py-3"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t('loading')}
              </>
            ) : (
              t('login')
            )}
          </button>

          <div className="mt-5 pt-4 border-t border-astra-border text-center">
            <p className="text-astra-text-muted text-xs">
              {t('demo_credentials')}: <span className="text-astra-text font-medium">info@astly.app</span>
              {' / '}
              <span className="text-astra-text font-medium">admin123</span>
            </p>
          </div>
        </form>

        <div className="text-center text-astra-text-muted text-[11px] mt-6 space-y-1">
          <p>© 2026 Astly.</p>
          <p>Coventry, UK • <a href="mailto:info@astly.app" className="text-astra-text font-medium hover:text-accent transition-colors">info@astly.app</a></p>
        </div>
      </div>
    </div>
  );
}
