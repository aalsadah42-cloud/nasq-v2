import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail 
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isReset, setIsReset] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
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
      if (!auth) {
        setError('خدمة المصادقة غير متاحة حالياً. يرجى المحاولة لاحقاً.');
        return;
      }

      if (isReset) {
        await sendPasswordResetEmail(auth, email);
        setMessage('تم إرسال رابط إعادة ضبط كلمة المرور إلى بريدك الإلكتروني.');
      } else if (isSignUp) {
        if (!db) {
          setError('خدمة قاعدة البيانات غير متاحة حالياً. يرجى المحاولة لاحقاً.');
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // إنشاء ملف المستخدم تلقائياً في Firestore عند التسجيل
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          displayName: displayName || 'مستخدم جديد',
          email: user.email,
          createdAt: new Date().toISOString(),
        });

        onClose();
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        onClose();
      }
    } catch (err: any) {
      switch (err.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          setError('بيانات الدخول غير صحيحة.');
          break;
        case 'auth/email-already-in-use':
          setError('البريد الإلكتروني مسجل بالفعل.');
          break;
        case 'auth/weak-password':
          setError('كلمة المرور ضعيفة (يجب أن تكون 6 أحرف على الأقل).');
          break;
        default:
          setError('حدث خطأ أثناء تنفيذ الطلب. يرجى المحاولة لاحقاً.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-gray-100">
        <h2 className="text-xl font-bold text-gray-900 mb-4 text-center">
          {isReset ? 'إعادة ضبط كلمة المرور' : isSignUp ? 'إنشاء حساب جديد' : 'تسجيل الدخول'}
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-xl text-center">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 p-3 bg-green-50 text-green-600 text-sm rounded-xl text-center">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الاسم الظاهر</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="أدخل اسمك"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none dir-ltr"
              placeholder="name@example.com"
            />
          </div>

          {!isReset && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none dir-ltr"
                placeholder="••••••••"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? 'جاري التحميل...' : isReset ? 'إرسال رابط الضبط' : isSignUp ? 'إنشاء الحساب' : 'تسجيل الدخول'}
          </button>
        </form>

        <div className="mt-4 text-center space-y-2 text-sm text-gray-600">
          {!isReset && (
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
              className="text-indigo-600 font-medium hover:underline block w-full"
            >
              {isSignUp ? 'لديك حساب بالفعل؟ سجل الدخول' : 'ليس لديك حساب؟ أنشئ حساباً الآن'}
            </button>
          )}

          <button
            onClick={() => { setIsReset(!isReset); setError(''); setMessage(''); }}
            className="text-gray-500 hover:underline block w-full text-xs"
          >
            {isReset ? ' العودة لتسجيل الدخول' : 'نسيت كلمة المرور؟'}
          </button>
        </div>
      </div>
    </div>
  );
};