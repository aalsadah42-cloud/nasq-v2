import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { User } from 'firebase/auth'
import { Check, CreditCard, ShieldCheck, UserRound, X } from 'lucide-react'
import { getUserProfile, saveUserProfile, type PaymentMethod, type UserProfile } from '../lib/userProfile'

type Props = {
  user: User
  onClose: () => void
  onSaved: (displayName: string, photoURL: string) => void
}

const maskPaymentDetails = (details: string, method: PaymentMethod) => {
  const normalized = details.replace(/\s+/g, '')
  if (!normalized) return 'غير مسجل'
  if (method === 'iban' && normalized.startsWith('SA') && normalized.length > 6) {
    return `SA** **** **** **** ${normalized.slice(-4)}`
  }
  return `${normalized.slice(0, 2)}${'*'.repeat(Math.max(4, normalized.length - 6))}${normalized.slice(-4)}`
}

export function ProfileSettingsModal({ user, onClose, onSaved }: Props) {
  const [profile, setProfile] = useState<UserProfile>({
    displayName: user.displayName ?? '',
    photoURL: user.photoURL ?? '',
    paymentMethod: 'iban',
    paymentDetails: '',
  })
  const [newPaymentDetails, setNewPaymentDetails] = useState('')
  const [clearPaymentDetails, setClearPaymentDetails] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getUserProfile(user).then((value) => {
      if (!cancelled) {
        setProfile(value)
        setProfileLoaded(true)
      }
    }).catch((loadError: unknown) => {
      if (!cancelled) {
        console.error('Loading the user profile failed:', loadError)
        setError(loadError instanceof Error ? loadError.message : String(loadError))
      }
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [user])

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      const nextProfile = {
        ...profile,
        paymentDetails: clearPaymentDetails ? '' : newPaymentDetails.trim() || profile.paymentDetails,
      }
      await saveUserProfile(user, nextProfile)
      setProfile(nextProfile)
      setNewPaymentDetails('')
      setClearPaymentDetails(false)
      onSaved(nextProfile.displayName.trim(), nextProfile.photoURL.trim())
      onClose()
    } catch (saveError) {
      console.error('Saving the user profile failed:', saveError)
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setSaving(false)
    }
  }

  const hasSavedDetails = Boolean(profile.paymentDetails)

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
      <form className="create-modal settings-modal" onSubmit={(event) => void save(event)} role="dialog" aria-modal="true" aria-labelledby="profile-settings-title">
        <button type="button" className="icon-button modal-close" aria-label="إغلاق" onClick={onClose} disabled={saving}><X size={18} /></button>
        <span className="modal-icon"><UserRound size={21} /></span>
        <span className="date-line">إعدادات الحساب</span>
        <h2 id="profile-settings-title">الملف الشخصي والتحويل</h2>
        <p>بيانات التحويل خاصة بحسابك، ولا تعرض كاملة في إعدادات الملف الشخصي.</p>

        <div className="settings-section">
          <h3>البيانات الأساسية</h3>
          <label className="modal-field"><span>الاسم الظاهر</span><input required maxLength={80} value={profile.displayName} onChange={(event) => setProfile((current) => ({ ...current, displayName: event.target.value }))} disabled={loading || saving || !profileLoaded} /></label>
          <label className="modal-field"><span>رابط الصورة الشخصية (اختياري)</span><input type="url" maxLength={2048} value={profile.photoURL} onChange={(event) => setProfile((current) => ({ ...current, photoURL: event.target.value }))} placeholder="https://example.com/photo.jpg" dir="ltr" disabled={loading || saving || !profileLoaded} /></label>
          {profile.photoURL && <img className="profile-image-preview" src={profile.photoURL} alt="معاينة الصورة الشخصية" />}
        </div>

        <div className="settings-section">
          <h3><CreditCard size={16} /> طريقة التحويل والحساب</h3>
          <p className="private-data-note"><ShieldCheck size={15} /> لا تُشارك هذه البيانات مع أعضاء المجموعة. تظهر مقنّعة هنا، ويُستخدم الرقم الكامل فقط عند طلب نسخ بيانات التسوية مباشرة.</p>
          <div className="saved-payment-preview"><span>البيانات المحفوظة</span><strong dir="ltr">{maskPaymentDetails(profile.paymentDetails, profile.paymentMethod)}</strong></div>
          <label className="modal-field"><span>وسيلة التحويل</span><select value={profile.paymentMethod} onChange={(event) => setProfile((current) => ({ ...current, paymentMethod: event.target.value as PaymentMethod }))} disabled={loading || saving || !profileLoaded}><option value="iban">IBAN</option><option value="stcPay">stc pay</option><option value="urpay">urpay</option><option value="phone">رقم الجوال</option></select></label>
          <label className="modal-field"><span>{hasSavedDetails ? 'تغيير بيانات التحويل (اختياري)' : profile.paymentMethod === 'iban' ? 'رقم الآيبان' : profile.paymentMethod === 'phone' ? 'رقم الجوال' : 'رقم الحساب أو الجوال'}</span><input autoComplete="off" type="password" value={newPaymentDetails} onChange={(event) => { setNewPaymentDetails(event.target.value); setClearPaymentDetails(false) }} placeholder={hasSavedDetails ? 'اتركه فارغًا للإبقاء على البيانات الحالية' : profile.paymentMethod === 'iban' ? 'SA...' : '05xxxxxxxx'} disabled={loading || saving || !profileLoaded} /></label>
          {hasSavedDetails && <label className="settings-clear-payment"><input type="checkbox" checked={clearPaymentDetails} onChange={(event) => { setClearPaymentDetails(event.target.checked); setNewPaymentDetails('') }} disabled={loading || saving || !profileLoaded} /> إزالة بيانات التحويل المحفوظة</label>}
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="button-outline" onClick={onClose} disabled={saving}>إلغاء</button><button type="submit" className="button-primary" disabled={loading || saving || !profileLoaded}><Check size={16} /> {saving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}</button></div>
      </form>
    </div>
  )
}
