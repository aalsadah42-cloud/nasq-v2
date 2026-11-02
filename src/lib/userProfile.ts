import type { User } from 'firebase/auth'
import { updateProfile } from 'firebase/auth'
import { collectionGroup, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore'
import { db } from './firebase'

export type PaymentMethod = 'iban' | 'stcPay' | 'urpay' | 'phone'

export type UserProfile = {
  displayName: string
  photoURL: string
  paymentMethod: PaymentMethod
  paymentDetails: string
}

const assertDb = () => {
  if (!db) throw new Error('إعداد Firebase غير متاح.')
  return db
}

const isPaymentMethod = (value: unknown): value is PaymentMethod =>
  value === 'iban' || value === 'stcPay' || value === 'urpay' || value === 'phone'

export async function getUserProfile(user: User): Promise<UserProfile> {
  const profileRef = doc(assertDb(), 'users', user.uid)
  const snapshot = await getDoc(profileRef)
  const value = snapshot.data()
  const paymentMethod = value?.paymentMethod
  if (paymentMethod !== undefined && !isPaymentMethod(paymentMethod)) {
    throw new Error('طريقة التحويل المحفوظة غير صالحة.')
  }
  const photoURL = value?.photoURL
  const paymentDetails = value?.paymentDetails
  if (photoURL !== undefined && typeof photoURL !== 'string') {
    throw new Error('رابط صورة الملف الشخصي المحفوظ غير صالح.')
  }
  if (paymentDetails !== undefined && typeof paymentDetails !== 'string') {
    throw new Error('بيانات التحويل المحفوظة غير صالحة.')
  }

  return {
    displayName: user.displayName?.trim() || (typeof value?.displayName === 'string' ? value.displayName : ''),
    photoURL: typeof photoURL === 'string' ? photoURL : user.photoURL ?? '',
    paymentMethod: isPaymentMethod(paymentMethod) ? paymentMethod : 'iban',
    paymentDetails: typeof paymentDetails === 'string' ? paymentDetails : '',
  }
}

export async function saveUserProfile(user: User, profile: UserProfile): Promise<void> {
  const displayName = profile.displayName.trim()
  const photoURL = profile.photoURL.trim()
  const paymentDetails = profile.paymentDetails.trim().replace(/\s+/g, '').toUpperCase()
  if (!displayName || displayName.length > 80) {
    throw new Error('يجب أن يتراوح الاسم الظاهر بين حرف واحد و80 حرفًا.')
  }
  if (photoURL && (!/^https?:\/\//i.test(photoURL) || photoURL.length > 2048)) {
    throw new Error('أدخل رابط صورة صالحًا يبدأ بـ https:// أو http://.')
  }
  if (paymentDetails.length > 64) {
    throw new Error('بيانات التحويل طويلة جدًا.')
  }
  if (profile.paymentMethod === 'iban' && paymentDetails && !/^SA\d{22}$/.test(paymentDetails)) {
    throw new Error('أدخل آيبان سعوديًا صحيحًا مكوّنًا من SA و22 رقمًا.')
  }
  if (profile.paymentMethod === 'phone' && paymentDetails && !/^\+?\d{8,15}$/.test(paymentDetails)) {
    throw new Error('أدخل رقم جوال صحيحًا من 8 إلى 15 رقمًا.')
  }

  const firestore = assertDb()
  const userRef = doc(firestore, 'users', user.uid)
  await updateProfile(user, { displayName, photoURL: photoURL || null })
  await setDoc(userRef, {
    uid: user.uid,
    displayName,
    photoURL,
    paymentMethod: profile.paymentMethod,
    paymentDetails,
    updatedAt: serverTimestamp(),
  }, { merge: true })

  const memberships = await getDocs(query(collectionGroup(firestore, 'members'), where('uid', '==', user.uid)))
  for (let index = 0; index < memberships.docs.length; index += 400) {
    const batch = writeBatch(firestore)
    memberships.docs.slice(index, index + 400).forEach((member) => {
      batch.update(member.ref, { displayName })
    })
    await batch.commit()
  }
}
