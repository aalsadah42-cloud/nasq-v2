import React, { useState } from 'react';
import { LogIn, UserPlus, Mail, Lock, X } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (email: string, pass: string) => Promise<void>;
  onRegister: (email: string, pass: string) => Promise<void>;
  onResetPassword?: (email: string) => Promise<void>;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLogin,
  onRegister,
  onResetPassword,
}) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (isResetting) {
        if (onResetPassword) {
          await onResetPassword(email);
          setMessage('تم إرسال رابط إعادة ضبط كلمة المرور إلى بريدك الإلكتروني.');
        }
      } else if (isRegistering) {
        await onRegister(email, password);
        onClose();
      } else {
        await onLogin(email, password);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء تنفيذ العملية، يُرجى المحاولة لاحقاً.');
    } finally {
      setLoading(false);
    }
  };

  const handleModeSwitch = (mode: 'login' | 'register' | 'reset') => {
    setError('');
    setMessage('');
    if (mode === 'reset') {
      setIsResetting(true);
      setIsRegistering(false);
    } else if (mode === 'register') {
      setIsResetting(false);
      setIsRegistering(true);
    } else {
      setIsResetting(false);
      setIsRegistering(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto" 
      dir="rtl"
    >
      <div 
        className="relative w-full max-w-md overflow-hidden bg-white shadow-2xl rounded-2xl border border-slate-100 my-auto z-10"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* زر الإغلاق */}
        <button
          onClick={onClose}
          type="button"
          className="absolute top-4 left-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors z-20"
          aria-label="إغلاق"
        >
          <X className="w-5 h-5" />
        </button>

        {/* رأس النافذة */}
        <div className="p-6 pb-2 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 mb-3 bg-emerald-50 text-emerald-600 rounded-xl">
            {isRegistering ? <UserPlus className="w-6 h-6" /> : <LogIn className="w-6 h-6" />}
          </div>
          <h2 className="text-xl font-bold text-slate-800">
            {isResetting
              ? 'استعادة كلمة المرور'
              : isRegistering
              ? 'إنشاء حساب جديد في نسَّق'
              : 'تسجيل الدخول إلى نسَّق'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {isResetting
              ? 'أدخل بريدك الإلكتروني لإرسال رابط الضبط'
              : isRegistering
              ? 'سجّل الآن لإدارة مصروفاتك وجماعاتك بسهولة'
              : 'مرحباً بك مجدداً، أدخل بياناتك للمتابعة'}
          </p>
        </div>

        {/* نموذج البيانات */}
        <form onSubmit={handleSubmit} className="p-6 pt-4 space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-xl border border-red-100">
              {error}
            </div>
          )}

          {message && (
            <div className="p-3 text-sm text-emerald-700 bg-emerald-50 rounded-xl border border-emerald-100">
              {message}
            </div>
          )}

          {/* البريد الإلكتروني */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-600 text-right">البريد الإلكتروني</label>
            <div className="relative">
              <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pr-10 pl-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
              />
            </div>
          </div>

          {/* كلمة المرور */}
          {!isResetting && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-600">كلمة المرور</label>
                {!isRegistering && (
                  <button
                    type="button"
                    onClick={() => handleModeSwitch('reset')}
                    className="text-xs font-medium text-emerald-600 hover:underline"
                  >
                    نسيت كلمة المرور؟
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pr-10 pl-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
                />
              </div>
            </div>
          )}

          {/* زر الإرسال الرئيسي */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium rounded-xl shadow-sm hover:shadow transition-all disabled:opacity-50 text-sm flex items-center justify-center gap-2 mt-2 cursor-pointer"
          >
            {loading ? (
              <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : isResetting ? (
              'إرسال رابط الإعادة'
            ) : isRegistering ? (
              'إنشاء حساب جديد'
            ) : (
              'تسجيل الدخول'
            )}
          </button>

          {/* التبديل بين الشاشات */}
          <div className="pt-2 text-center border-t border-slate-100">
            {isResetting ? (
              <button
                type="button"
                onClick={() => handleModeSwitch('login')}
                className="text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                العودة إلى تسجيل الدخول
              </button>
            ) : (
              <p className="text-xs text-slate-500">
                {isRegistering ? 'لديك حساب بالفعل؟' : 'ليس لديك حساب؟'}{' '}
                <button
                  type="button"
                  onClick={() => handleModeSwitch(isRegistering ? 'login' : 'register')}
                  className="font-bold text-emerald-600 hover:underline"
                >
                  {isRegistering ? 'تسجيل الدخول' : 'أنشئ حساباً الآن'}
                </button>
              </p>
            )}
          </div>
        </form>

      </div>
    </div>
  );
};