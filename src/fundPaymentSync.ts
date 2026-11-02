import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore'
import { db } from './lib/firebase'

export type SyncedPaymentStatus = 'unpaid' | 'awaiting' | 'paid' | 'rejected'
export type SyncedContribution = {
  uid: string
  name: string
  amount: number
  status: SyncedPaymentStatus
  confirmedAt?: number | null
}
export type SyncedKattahRequest = {
  id: number
  workspaceId: string
  title: string
  cadence: string
  total: number
  due: string
  contributions: SyncedContribution[]
}

const requestsCollection = (groupId: string, firestore: Firestore = assertDb()) => {
  if (!groupId) throw new Error('معرّف المجموعة مطلوب للمزامنة.')
  return collection(firestore, 'groups', groupId, 'transactions')
}

const paymentRequestRef = (groupId: string, requestId: number, firestore: Firestore = assertDb()) =>
  doc(requestsCollection(groupId, firestore), String(requestId))
const confirmationRef = (groupId: string, requestId: number, memberUid: string, firestore: Firestore = assertDb()) =>
  doc(paymentRequestRef(groupId, requestId, firestore), 'confirmations', memberUid)
const balanceRef = (groupId: string, firestore: Firestore = assertDb()) => {
  if (!groupId) throw new Error('معرّف المجموعة مطلوب للمزامنة.')
  return doc(firestore, 'groups', groupId, 'fund', groupId)
}

const toMillis = (value: unknown): number | null => {
  if (value instanceof Timestamp) return value.toMillis()
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

const decodeRequest = (id: string, value: Record<string, unknown>, groupId: string): SyncedKattahRequest => {
  if (
    (typeof value.id !== 'number' && !Number.isFinite(Number(id)))
    || (typeof value.id === 'number' && !Number.isFinite(value.id))
    || typeof value.workspaceId !== 'string'
    || value.workspaceId !== groupId
    || typeof value.title !== 'string'
    || typeof value.cadence !== 'string'
    || typeof value.total !== 'number'
    || !Number.isFinite(value.total)
    || typeof value.due !== 'string'
    || !Array.isArray(value.contributions)
  ) throw new Error(`بيانات طلب المساهمة ${id} غير صالحة.`)

  const contributions = value.contributions
  const confirmationTimes = value.confirmationTimes && typeof value.confirmationTimes === 'object'
    ? value.confirmationTimes as Record<string, unknown>
    : {}
  return {
    id: typeof value.id === 'number' ? value.id : Number(id),
    workspaceId: value.workspaceId,
    title: value.title,
    cadence: value.cadence,
    total: value.total,
    due: value.due,
    contributions: contributions.map((item): SyncedContribution => {
      if (!item || typeof item !== 'object') throw new Error(`عضو غير صالح في طلب المساهمة ${id}.`)
      const contribution = item as Record<string, unknown>
      const status = contribution.status
      if (
        typeof contribution.uid !== 'string'
        || typeof contribution.name !== 'string'
        || typeof contribution.amount !== 'number'
        || !Number.isFinite(contribution.amount)
        || !['unpaid', 'awaiting', 'paid', 'rejected'].includes(String(status))
      ) throw new Error(`بيانات مساهمة غير صالحة في طلب المساهمة ${id}.`)
      return {
        uid: contribution.uid,
        name: contribution.name,
        amount: contribution.amount,
        status: status as SyncedPaymentStatus,
        confirmedAt: toMillis(confirmationTimes[contribution.uid]) ?? toMillis(contribution.confirmedAt),
      }
    }),
  }
}

const assertDb = () => {
  if (!db) throw new Error('إعداد Firebase غير متاح.')
  return db
}

export function subscribeToGatherings<T extends { id: string }>(
  groupId: string,
  decode: (id: string, value: DocumentData) => T,
  onGatherings: (gatherings: T[]) => void,
  onError: (error: Error) => void,
) {
  const firestore = assertDb()
  if (!groupId) throw new Error('معرّف المجموعة مطلوب لمزامنة الجمعات.')
  return onSnapshot(collection(firestore, 'groups', groupId, 'gatherings'), (snapshot) => {
    try {
      onGatherings(snapshot.docs.map((item) => decode(item.id, item.data())))
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)))
    }
  }, onError)
}

export async function createSyncedGathering<T extends { id: string }>(
  groupId: string,
  gathering: T,
  firestore: Firestore = assertDb(),
) {
  if (!groupId) throw new Error('معرّف المجموعة مطلوب لإنشاء الجمعة.')
  const ref = doc(firestore, 'groups', groupId, 'gatherings', gathering.id)
  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (snapshot.exists()) throw new Error('توجد جمعة بهذا المعرّف بالفعل.')
    transaction.set(ref, removeUndefinedValues(gathering) as T)
  })
}

export async function mutateSyncedGathering<T extends { id: string }>(
  groupId: string,
  gatheringId: string,
  decode: (id: string, value: DocumentData) => T,
  update: (gathering: T) => T | null,
  firestore: Firestore = assertDb(),
) {
  if (!groupId || !gatheringId) throw new Error('معرّف المجموعة والجمعة مطلوبان للتحديث.')
  const ref = doc(firestore, 'groups', groupId, 'gatherings', gatheringId)
  return runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) throw new Error('تعذر العثور على الجمعة.')
    const next = update(decode(snapshot.id, snapshot.data()))
    if (next === null) {
      transaction.delete(ref)
      return null
    }
    transaction.set(ref, removeUndefinedValues(next) as T)
    return next
  })
}

const removeUndefinedValues = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(removeUndefinedValues)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) =>
      item === undefined ? [] : [[key, removeUndefinedValues(item)]]))
  }
  return value
}

export function subscribeToFundPayments(
  groupId: string,
  onRequests: (requests: SyncedKattahRequest[]) => void,
  onBalances: (balances: Record<string, number>) => void,
  onError: (error: Error) => void,
) {
  assertDb()
  if (!groupId) throw new Error('معرّف المجموعة مطلوب لمزامنة المدفوعات.')
  let requests: SyncedKattahRequest[] = []
  const confirmations = new Map<number, Map<string, number | null>>()
  const confirmationUnsubscribers = new Map<number, () => void>()
  const publishRequests = () => {
    onRequests(requests.map((request) => ({
      ...request,
      contributions: request.contributions.map((contribution) => {
        const confirmedAt = confirmations.get(request.id)?.get(contribution.uid)
        return confirmedAt === undefined
          ? contribution
          : { ...contribution, status: 'awaiting', confirmedAt }
      }),
    })))
  }
  const unsubscribeRequests = onSnapshot(requestsCollection(groupId), (snapshot) => {
    try {
      requests = snapshot.docs.map((item) => decodeRequest(item.id, item.data(), groupId))
      const requestIds = new Set(requests.map((request) => request.id))
      for (const [requestId, unsubscribe] of confirmationUnsubscribers) {
        if (requestIds.has(requestId)) continue
        unsubscribe()
        confirmationUnsubscribers.delete(requestId)
        confirmations.delete(requestId)
      }
      for (const request of requests) {
        if (confirmationUnsubscribers.has(request.id)) continue
        const confirmationCollection = collection(paymentRequestRef(groupId, request.id), 'confirmations')
        const unsubscribe = onSnapshot(confirmationCollection, (confirmationSnapshot) => {
          try {
            const byUid = new Map<string, number | null>()
            for (const confirmation of confirmationSnapshot.docs) {
              const value = confirmation.data()
              if (value.uid !== confirmation.id || value.status !== 'awaiting') {
                throw new Error(`بيانات تأكيد الدفع للعضو ${confirmation.id} غير صالحة.`)
              }
              byUid.set(confirmation.id, toMillis(value.confirmedAt))
            }
            confirmations.set(request.id, byUid)
            publishRequests()
          } catch (error) {
            onError(error instanceof Error ? error : new Error(String(error)))
          }
        }, onError)
        confirmationUnsubscribers.set(request.id, unsubscribe)
      }
      publishRequests()
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)))
    }
  }, onError)
  const unsubscribeBalances = onSnapshot(balanceRef(groupId), (snapshot) => {
    try {
      if (!snapshot.exists()) {
        onBalances({ [groupId]: 0 })
        return
      }
      const value = snapshot.data().balance
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`رصيد المجموعة ${groupId} غير صالح.`)
      onBalances({ [groupId]: value })
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)))
    }
  }, onError)
  return () => {
    unsubscribeRequests()
    unsubscribeBalances()
    confirmationUnsubscribers.forEach((unsubscribe) => unsubscribe())
  }
}

export async function createSyncedRequest(
  groupId: string,
  request: SyncedKattahRequest,
  firestore: Firestore = assertDb(),
) {
  if (!groupId || request.workspaceId !== groupId) throw new Error('طلب المساهمة لا ينتمي إلى المجموعة المحددة.')
  await runTransaction(firestore, async (transaction) => {
    const ref = paymentRequestRef(groupId, request.id, firestore)
    const snapshot = await transaction.get(ref)
    if (snapshot.exists()) throw new Error('يوجد طلب مساهمة بهذا الرقم بالفعل.')
    transaction.set(ref, request)
  })
}

export async function confirmSyncedContribution(
  groupId: string,
  requestId: number,
  memberUid: string,
  firestore: Firestore = assertDb(),
) {
  return runTransaction(firestore, async (transaction) => {
    const ref = paymentRequestRef(groupId, requestId, firestore)
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) throw new Error('تعذر العثور على طلب المساهمة.')
    const request = decodeRequest(snapshot.id, snapshot.data(), groupId)
    const contribution = request.contributions.find((item) => item.uid === memberUid)
    if (!contribution || !['unpaid', 'rejected'].includes(contribution.status)) return false
    const refConfirmation = confirmationRef(groupId, requestId, memberUid, firestore)
    const confirmationSnapshot = await transaction.get(refConfirmation)
    if (confirmationSnapshot.exists()) return false
    transaction.set(refConfirmation, {
      uid: memberUid,
      status: 'awaiting',
      confirmedAt: serverTimestamp(),
    })
    return true
  })
}

export async function decideSyncedContribution(
  groupId: string,
  requestId: number,
  memberUid: string,
  decision: 'paid' | 'rejected',
  _fallbackBalance = 0,
  firestore: Firestore = assertDb(),
) {
  return runTransaction(firestore, async (transaction) => {
    const requestRef = paymentRequestRef(groupId, requestId, firestore)
    const requestSnapshot = await transaction.get(requestRef)
    if (!requestSnapshot.exists()) throw new Error('تعذر العثور على طلب المساهمة.')
    const request = decodeRequest(requestSnapshot.id, requestSnapshot.data(), groupId)
    const memberConfirmationRef = confirmationRef(groupId, requestId, memberUid, firestore)
    const confirmationSnapshot = await transaction.get(memberConfirmationRef)
    const contribution = request.contributions.find((item) => item.uid === memberUid)
    if (!contribution || !['unpaid', 'rejected'].includes(contribution.status) || !confirmationSnapshot.exists()) return null

    const updatedContributions = request.contributions.map((item) => item.uid === memberUid
      ? {
        ...item,
        status: decision,
        confirmedAt: decision === 'rejected' ? null : toMillis(confirmationSnapshot.data().confirmedAt),
      }
      : item)
    const shouldAddToBalance = decision === 'paid'
    const fundRef = balanceRef(groupId, firestore)
    const fundSnapshot = shouldAddToBalance ? await transaction.get(fundRef) : null

    transaction.update(requestRef, { contributions: updatedContributions })
    transaction.delete(memberConfirmationRef)
    if (shouldAddToBalance) {
      const balance = fundSnapshot?.exists() ? fundSnapshot.data().balance : 0
      if (typeof balance !== 'number' || !Number.isFinite(balance)) throw new Error('رصيد الصندوق غير صالح.')
      transaction.set(fundRef, {
        groupId,
        balance: balance + contribution.amount,
        updatedAt: Timestamp.now(),
      })
    }
    return decision === 'paid' ? contribution.amount : 0
  })
}

export async function approveAllSyncedContributions(
  groupId: string,
  requestId: number,
  _fallbackBalance = 0,
  firestore: Firestore = assertDb(),
) {
  const confirmationsSnapshot = await getDocs(collection(paymentRequestRef(groupId, requestId, firestore), 'confirmations'))
  return runTransaction(firestore, async (transaction) => {
    const requestRef = paymentRequestRef(groupId, requestId, firestore)
    const requestSnapshot = await transaction.get(requestRef)
    if (!requestSnapshot.exists()) throw new Error('تعذر العثور على طلب المساهمة.')
    const request = decodeRequest(requestSnapshot.id, requestSnapshot.data(), groupId)
    const confirmationSnapshots = await Promise.all(confirmationsSnapshot.docs.map((confirmation) =>
      transaction.get(confirmation.ref)))
    const existingConfirmations = confirmationSnapshots.filter((confirmation) => confirmation.exists())
    const confirmationTimes = new Map(existingConfirmations.map((confirmation) => [
      confirmation.id,
      toMillis(confirmation.data().confirmedAt),
    ]))
    const awaiting = request.contributions.filter((item) => confirmationTimes.has(item.uid))
    if (!awaiting.length) return { count: 0, total: 0 }

    const fundRef = balanceRef(groupId, firestore)
    const fundSnapshot = await transaction.get(fundRef)
    const balance = fundSnapshot.exists() ? fundSnapshot.data().balance : 0
    if (typeof balance !== 'number' || !Number.isFinite(balance)) throw new Error('رصيد الصندوق غير صالح.')

    transaction.update(requestRef, {
      contributions: request.contributions.map((item) => confirmationTimes.has(item.uid)
        ? { ...item, status: 'paid', confirmedAt: confirmationTimes.get(item.uid) ?? null }
        : item),
    })
    existingConfirmations.forEach((confirmation) => transaction.delete(confirmation.ref))
    transaction.set(fundRef, {
      groupId,
      balance: balance + awaiting.reduce((sum, item) => sum + item.amount, 0),
      updatedAt: Timestamp.now(),
    })
    return { count: awaiting.length, total: awaiting.reduce((sum, item) => sum + item.amount, 0) }
  })
}
