import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { Lock, Mail, AlertCircle } from 'lucide-react';
import WorkOSLogo from '../components/WorkOSLogo';

const generateCSSStars = (count) => {
  let val = '';
  for (let i = 0; i < count; i++) {
    val += `${Math.floor(Math.random() * 2000)}px ${Math.floor(Math.random() * 2000)}px #FFF${i === count - 1 ? '' : ', '}`;
  }
  return val;
};

const starsSmall = generateCSSStars(300);
const starsMedium = generateCSSStars(100);
const starsLarge = generateCSSStars(50);

export default function Login() {
  const { login } = useAuth();
  const { t } = useLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#090a0f] text-white">
      <style>{`
        .galaxy-wrapper {
          background: radial-gradient(ellipse at bottom, #1b2735 0%, #090a0f 100%);
        }
        .stars-layer-1 { width: 1px; height: 1px; background: transparent; box-shadow: ${starsSmall}; animation: animStar 150s linear infinite; }
        .stars-layer-1::after { content: " "; position: absolute; top: 2000px; width: 1px; height: 1px; background: transparent; box-shadow: ${starsSmall}; }
        .stars-layer-2 { width: 2px; height: 2px; background: transparent; box-shadow: ${starsMedium}; animation: animStar 200s linear infinite; }
        .stars-layer-2::after { content: " "; position: absolute; top: 2000px; width: 2px; height: 2px; background: transparent; box-shadow: ${starsMedium}; }
        .stars-layer-3 { width: 3px; height: 3px; background: transparent; box-shadow: ${starsLarge}; animation: animStar 250s linear infinite; }
        .stars-layer-3::after { content: " "; position: absolute; top: 2000px; width: 3px; height: 3px; background: transparent; box-shadow: ${starsLarge}; }
        @keyframes animStar { from { transform: translateY(0px); } to { transform: translateY(-2000px); } }
      `}</style>

      <div className="absolute inset-0 galaxy-wrapper pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none">
        <div className="stars-layer-1"></div>
        <div className="stars-layer-2"></div>
        <div className="stars-layer-3"></div>
      </div>
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />
      <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[150px] pointer-events-none mix-blend-screen" />
      
      <div className="w-full max-w-[400px] relative z-10">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            <WorkOSLogo size={64} showText={true} />
          </div>
          <p className="text-gray-300 text-sm mt-3">{t('login_subtitle')}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-black/40 backdrop-blur-xl rounded-2xl p-8 border border-white/10 shadow-2xl"
        >
          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-lg mb-5 text-sm">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-gray-300 text-sm mb-2">{t('email')}</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-10 py-3 text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all placeholder:text-gray-600"
                placeholder="info@astly.app"
                required
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-gray-300 text-sm mb-2">{t('password')}</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-10 py-3 text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all placeholder:text-gray-600"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-xl py-3 font-medium transition-all shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2"
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
        </form>

        <div className="text-center text-gray-400 text-[11px] mt-6 space-y-1">
          <p>© 2026 Astly.</p>
          <p>Coventry, UK • <a href="mailto:info@astly.app" className="text-gray-300 font-medium hover:text-white transition-colors">info@astly.app</a></p>
        </div>
      </div>
    </div>
  );
}
