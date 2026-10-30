import {
  collection,
  doc,
  FieldPath,
  deleteField,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  setDoc,
  deleteDoc,
  type DocumentData,
} from 'firebase/firestore'
import { db } from './lib/firebase'

export type SyncedPaymentStatus = 'unpaid' | 'awaiting' | 'paid' | 'rejected'
export type SyncedContribution = {
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

const requestsCollection = () => {
  if (!db) throw new Error('إعداد Firebase غير متاح.')
  return collection(db, 'fundPaymentRequests')
}

const paymentRequestRef = (requestId: number) => doc(requestsCollection(), String(requestId))
const balanceRef = (workspaceId: string) => {
  if (!db) throw new Error('إعداد Firebase غير متاح.')
  return doc(db, 'fundBalances', workspaceId)
}

const toMillis = (value: unknown): number | null => {
  if (value instanceof Timestamp) return value.toMillis()
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

const decodeRequest = (id: string, value: Record<string, unknown>): SyncedKattahRequest => {
  if (
    (typeof value.id !== 'number' && !Number.isFinite(Number(id)))
    || (typeof value.id === 'number' && !Number.isFinite(value.id))
    || typeof value.workspaceId !== 'string'
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
        typeof contribution.name !== 'string'
        || typeof contribution.amount !== 'number'
        || !Number.isFinite(contribution.amount)
        || !['unpaid', 'awaiting', 'paid', 'rejected'].includes(String(status))
      ) throw new Error(`بيانات مساهمة غير صالحة في طلب المساهمة ${id}.`)
      return {
        name: contribution.name,
        amount: contribution.amount,
        status: status as SyncedPaymentStatus,
        confirmedAt: toMillis(confirmationTimes[contribution.name]) ?? toMillis(contribution.confirmedAt),
      }
    }),
  }
}

const assertDb = () => {
  if (!db) throw new Error('إعداد Firebase غير متاح.')
  return db
}

export function subscribeToGatherings<T extends { id: string }>(
  decode: (id: string, value: DocumentData) => T,
  onGatherings: (gatherings: T[]) => void,
  onError: (error: Error) => void,
) {
  const firestore = assertDb()
  return onSnapshot(collection(firestore, 'gatherings'), (snapshot) => {
    try {
      onGatherings(snapshot.docs.map((item) => decode(item.id, item.data())))
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)))
    }
  }, onError)
}

export async function syncGatheringChanges<T extends { id: string }>(previous: T[], next: T[]) {
  const firestore = assertDb()
  const previousById = new Map(previous.map((item) => [item.id, item]))
  const nextById = new Map(next.map((item) => [item.id, item]))
  const writes = next.flatMap((item) => {
    if (JSON.stringify(previousById.get(item.id)) === JSON.stringify(item)) return []
    return [setDoc(doc(firestore, 'gatherings', item.id), removeUndefinedValues(item) as T)]
  })
  const deletes = previous
    .filter((item) => !nextById.has(item.id))
    .map((item) => deleteDoc(doc(firestore, 'gatherings', item.id)))
  await Promise.all([...writes, ...deletes])
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
  onRequests: (requests: SyncedKattahRequest[]) => void,
  onBalances: (balances: Record<string, number>) => void,
  onError: (error: Error) => void,
) {
  const firestore = assertDb()
  const unsubscribeRequests = onSnapshot(collection(firestore, 'fundPaymentRequests'), (snapshot) => {
    try {
      onRequests(snapshot.docs.map((item) => decodeRequest(item.id, item.data())))
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)))
    }
  }, onError)
  const unsubscribeBalances = onSnapshot(collection(firestore, 'fundBalances'), (snapshot) => {
    try {
      onBalances(Object.fromEntries(snapshot.docs.map((item) => {
        const value = item.data().balance
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`رصيد الصندوق ${item.id} غير صالح.`)
        return [item.id, value]
      })))
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)))
    }
  }, onError)
  return () => {
    unsubscribeRequests()
    unsubscribeBalances()
  }
}

export async function createSyncedRequest(request: SyncedKattahRequest) {
  const firestore = assertDb()
  await runTransaction(firestore, async (transaction) => {
    const ref = paymentRequestRef(request.id)
    const snapshot = await transaction.get(ref)
    if (snapshot.exists()) throw new Error('يوجد طلب مساهمة بهذا الرقم بالفعل.')
    transaction.set(ref, request)
  })
}

export async function confirmSyncedContribution(requestId: number, memberName: string) {
  return runTransaction(assertDb(), async (transaction) => {
    const ref = paymentRequestRef(requestId)
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) throw new Error('تعذر العثور على طلب المساهمة.')
    const request = decodeRequest(snapshot.id, snapshot.data())
    const contribution = request.contributions.find((item) => item.name === memberName)
    if (!contribution || !['unpaid', 'rejected'].includes(contribution.status)) return false
    transaction.update(
      ref,
      new FieldPath('contributions'),
      request.contributions.map((item) => item.name === memberName
        ? { ...item, status: 'awaiting', confirmedAt: null }
        : item),
      new FieldPath('confirmationTimes', memberName),
      serverTimestamp(),
    )
    return true
  })
}

export async function decideSyncedContribution(
  requestId: number,
  memberName: string,
  decision: 'paid' | 'rejected',
  fallbackBalance: number,
) {
  const firestore = assertDb()
  return runTransaction(firestore, async (transaction) => {
    const requestRef = paymentRequestRef(requestId)
    const requestSnapshot = await transaction.get(requestRef)
    if (!requestSnapshot.exists()) throw new Error('تعذر العثور على طلب المساهمة.')
    const request = decodeRequest(requestSnapshot.id, requestSnapshot.data())
    const contribution = request.contributions.find((item) => item.name === memberName)
    if (!contribution || contribution.status !== 'awaiting') return null

    const updatedContributions = request.contributions.map((item) => item.name === memberName
      ? {
        ...item,
        status: decision,
        confirmedAt: decision === 'rejected' ? null : item.confirmedAt ?? null,
      }
      : item)
    const shouldAddToBalance = decision === 'paid'
    const fundRef = balanceRef(request.workspaceId)
    const fundSnapshot = shouldAddToBalance ? await transaction.get(fundRef) : null

    if (decision === 'rejected') {
      transaction.update(
        requestRef,
        new FieldPath('contributions'),
        updatedContributions,
        new FieldPath('confirmationTimes', memberName),
        deleteField(),
      )
    } else {
      transaction.update(requestRef, { contributions: updatedContributions })
    }
    if (shouldAddToBalance) {
      const balance = fundSnapshot?.exists() ? fundSnapshot.data().balance : fallbackBalance
      if (typeof balance !== 'number' || !Number.isFinite(balance)) throw new Error('رصيد الصندوق غير صالح.')
      transaction.set(fundRef, {
        workspaceId: request.workspaceId,
        balance: balance + contribution.amount,
        updatedAt: Timestamp.now(),
      })
    }
    return decision === 'paid' ? contribution.amount : 0
  })
}

export async function approveAllSyncedContributions(requestId: number, fallbackBalance: number) {
  const firestore = assertDb()
  return runTransaction(firestore, async (transaction) => {
    const requestRef = paymentRequestRef(requestId)
    const requestSnapshot = await transaction.get(requestRef)
    if (!requestSnapshot.exists()) throw new Error('تعذر العثور على طلب المساهمة.')
    const request = decodeRequest(requestSnapshot.id, requestSnapshot.data())
    const awaiting = request.contributions.filter((item) => item.status === 'awaiting')
    if (!awaiting.length) return { count: 0, total: 0 }

    const fundRef = balanceRef(request.workspaceId)
    const fundSnapshot = await transaction.get(fundRef)
    const balance = fundSnapshot.exists() ? fundSnapshot.data().balance : fallbackBalance
    if (typeof balance !== 'number' || !Number.isFinite(balance)) throw new Error('رصيد الصندوق غير صالح.')

    transaction.update(requestRef, {
      contributions: request.contributions.map((item) => item.status === 'awaiting' ? { ...item, status: 'paid' } : item),
    })
    transaction.set(fundRef, {
      workspaceId: request.workspaceId,
      balance: balance + awaiting.reduce((sum, item) => sum + item.amount, 0),
      updatedAt: Timestamp.now(),
    })
    return { count: awaiting.length, total: awaiting.reduce((sum, item) => sum + item.amount, 0) }
  })
}
