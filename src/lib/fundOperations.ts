import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore'
import { db } from './firebase'

export type Obligation = {
  id: number
  workspaceId: string
  title: string
  amount: number
  cadence: string
  due: string
  status: 'upcoming' | 'due' | 'awaiting' | 'paid'
}

export type Reimbursement = {
  id: number
  workspaceId: string
  title: string
  member: string
  memberUid: string
  amount: number
  receipt: string
  status: 'review' | 'awaiting-receipt' | 'received' | 'objection' | 'rejected'
}

const assertDb = () => {
  if (!db) throw new Error('إعداد Firebase غير متاح.')
  return db
}

const obligationRef = (firestore: Firestore, groupId: string, id: number) =>
  doc(firestore, 'groups', groupId, 'obligations', String(id))

const reimbursementRef = (firestore: Firestore, groupId: string, id: number) =>
  doc(firestore, 'groups', groupId, 'reimbursements', String(id))

const balanceRef = (firestore: Firestore, groupId: string) =>
  doc(firestore, 'groups', groupId, 'fund', groupId)

const validateAmount = (amount: number) => {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('يجب أن يكون المبلغ أكبر من صفر.')
}

function decodeObligation(id: string, data: Record<string, unknown>, groupId: string): Obligation {
  const numericId = Number(id)
  if (
    !Number.isSafeInteger(numericId)
    || data.workspaceId !== groupId
    || typeof data.title !== 'string'
    || typeof data.amount !== 'number'
    || !Number.isFinite(data.amount)
    || typeof data.cadence !== 'string'
    || typeof data.due !== 'string'
    || !['upcoming', 'due', 'awaiting', 'paid'].includes(String(data.status))
  ) throw new Error(`بيانات الالتزام ${id} غير صالحة.`)
  return {
    id: numericId,
    workspaceId: groupId,
    title: data.title,
    amount: data.amount,
    cadence: data.cadence,
    due: data.due,
    status: data.status as Obligation['status'],
  }
}

function decodeReimbursement(id: string, data: Record<string, unknown>, groupId: string): Reimbursement {
  const numericId = Number(id)
  if (
    !Number.isSafeInteger(numericId)
    || data.workspaceId !== groupId
    || typeof data.title !== 'string'
    || typeof data.member !== 'string'
    || typeof data.memberUid !== 'string'
    || typeof data.amount !== 'number'
    || !Number.isFinite(data.amount)
    || typeof data.receipt !== 'string'
    || !['review', 'awaiting-receipt', 'received', 'objection', 'rejected'].includes(String(data.status))
  ) throw new Error(`بيانات طلب التعويض ${id} غير صالحة.`)
  return {
    id: numericId,
    workspaceId: groupId,
    title: data.title,
    member: data.member,
    memberUid: data.memberUid,
    amount: data.amount,
    receipt: data.receipt,
    status: data.status as Reimbursement['status'],
  }
}

export function subscribeToFundOperations(
  groupId: string,
  onObligations: (items: Obligation[]) => void,
  onReimbursements: (items: Reimbursement[]) => void,
  onError: (error: Error) => void,
  firestore: Firestore = assertDb(),
) {
  if (!groupId) throw new Error('معرّف المجموعة مطلوب لمزامنة عمليات الصندوق.')
  const unsubscribeObligations = onSnapshot(collection(firestore, 'groups', groupId, 'obligations'), (snapshot) => {
    try {
      onObligations(snapshot.docs.map((item) => decodeObligation(item.id, item.data(), groupId)))
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)))
    }
  }, onError)
  const unsubscribeReimbursements = onSnapshot(collection(firestore, 'groups', groupId, 'reimbursements'), (snapshot) => {
    try {
      onReimbursements(snapshot.docs.map((item) => decodeReimbursement(item.id, item.data(), groupId)))
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)))
    }
  }, onError)
  return () => {
    unsubscribeObligations()
    unsubscribeReimbursements()
  }
}

export async function createSyncedObligation(
  groupId: string,
  obligation: Omit<Obligation, 'status'> & { status?: Obligation['status']; createdByUid: string },
  firestore: Firestore = assertDb(),
) {
  validateAmount(obligation.amount)
  await runTransaction(firestore, async (transaction) => {
    const ref = obligationRef(firestore, groupId, obligation.id)
    const existing = await transaction.get(ref)
    if (existing.exists()) throw new Error('يوجد التزام بهذا المعرّف بالفعل.')
    transaction.set(ref, {
      ...obligation,
      status: obligation.status ?? 'upcoming',
      createdAt: serverTimestamp(),
    })
  })
}

export async function reportSyncedObligationPayment(
  groupId: string,
  obligationId: number,
  reportedByUid: string,
  firestore: Firestore = assertDb(),
) {
  return runTransaction(firestore, async (transaction) => {
    const ref = obligationRef(firestore, groupId, obligationId)
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) throw new Error('تعذر العثور على الالتزام.')
    const obligation = decodeObligation(snapshot.id, snapshot.data(), groupId)
    if (!['upcoming', 'due'].includes(obligation.status)) return false
    transaction.update(ref, { status: 'awaiting', reportedByUid, reportedAt: serverTimestamp() })
    return true
  })
}

export async function approveSyncedObligationPayment(
  groupId: string,
  obligationId: number,
  firestore: Firestore = assertDb(),
) {
  return runTransaction(firestore, async (transaction) => {
    const obligationDocument = obligationRef(firestore, groupId, obligationId)
    const snapshot = await transaction.get(obligationDocument)
    if (!snapshot.exists()) throw new Error('تعذر العثور على الالتزام.')
    const obligation = decodeObligation(snapshot.id, snapshot.data(), groupId)
    if (obligation.status !== 'awaiting') return false
    validateAmount(obligation.amount)

    const fundDocument = balanceRef(firestore, groupId)
    const fundSnapshot = await transaction.get(fundDocument)
    const balance = fundSnapshot.exists() ? fundSnapshot.data().balance : 0
    if (typeof balance !== 'number' || !Number.isFinite(balance)) throw new Error('رصيد الصندوق غير صالح.')

    transaction.update(obligationDocument, { status: 'paid', paidAt: serverTimestamp() })
    transaction.set(fundDocument, {
      groupId,
      balance: balance - obligation.amount,
      updatedAt: serverTimestamp(),
    })
    return true
  })
}

export async function createSyncedReimbursement(
  groupId: string,
  reimbursement: Reimbursement,
  firestore: Firestore = assertDb(),
) {
  validateAmount(reimbursement.amount)
  if (!reimbursement.memberUid) throw new Error('معرّف مقدم طلب التعويض مطلوب.')
  await runTransaction(firestore, async (transaction) => {
    const ref = reimbursementRef(firestore, groupId, reimbursement.id)
    const existing = await transaction.get(ref)
    if (existing.exists()) throw new Error('يوجد طلب تعويض بهذا المعرّف بالفعل.')
    transaction.set(ref, { ...reimbursement, workspaceId: groupId, createdAt: serverTimestamp() })
  })
}

export async function decideSyncedReimbursement(
  groupId: string,
  reimbursementId: number,
  decision: 'awaiting-receipt' | 'rejected',
  firestore: Firestore = assertDb(),
) {
  return runTransaction(firestore, async (transaction) => {
    const reimbursementDocument = reimbursementRef(firestore, groupId, reimbursementId)
    const snapshot = await transaction.get(reimbursementDocument)
    if (!snapshot.exists()) throw new Error('تعذر العثور على طلب التعويض.')
    const reimbursement = decodeReimbursement(snapshot.id, snapshot.data(), groupId)
    if (reimbursement.status !== 'review') return false

    let fundUpdate: { balance: number; ref: ReturnType<typeof balanceRef> } | null = null
    if (decision === 'awaiting-receipt') {
      validateAmount(reimbursement.amount)
      const ref = balanceRef(firestore, groupId)
      const fundSnapshot = await transaction.get(ref)
      const balance = fundSnapshot.exists() ? fundSnapshot.data().balance : 0
      if (typeof balance !== 'number' || !Number.isFinite(balance)) throw new Error('رصيد الصندوق غير صالح.')
      fundUpdate = { balance: balance - reimbursement.amount, ref }
    }

    transaction.update(reimbursementDocument, { status: decision, decidedAt: serverTimestamp() })
    if (fundUpdate) {
      transaction.set(fundUpdate.ref, {
        groupId,
        balance: fundUpdate.balance,
        updatedAt: serverTimestamp(),
      })
    }
    return true
  })
}

export async function confirmSyncedReimbursementReceipt(
  groupId: string,
  reimbursementId: number,
  memberUid: string,
  received: boolean,
  firestore: Firestore = assertDb(),
) {
  return runTransaction(firestore, async (transaction) => {
    const ref = reimbursementRef(firestore, groupId, reimbursementId)
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) throw new Error('تعذر العثور على طلب التعويض.')
    const reimbursement = decodeReimbursement(snapshot.id, snapshot.data(), groupId)
    if (reimbursement.memberUid !== memberUid || reimbursement.status !== 'awaiting-receipt') return false
    transaction.update(ref, {
      status: received ? 'received' : 'objection',
      receivedAt: serverTimestamp(),
    })
    return true
  })
}
