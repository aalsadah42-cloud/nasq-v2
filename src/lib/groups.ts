import type { User } from 'firebase/auth'
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { db } from './firebase'

export type GroupRole = 'owner' | 'admin' | 'member'

export type GroupMember = {
  uid: string
  displayName: string
  role: GroupRole
}

export type UserGroup = {
  id: string
  name: string
  description: string
  createdBy: string
  createdAt: number | null
  balance: number
  role: GroupRole
  members: GroupMember[]
  memberNames: string[]
}

export type CreatedGroup = UserGroup & { inviteCode: string }

const assertDb = () => {
  if (!db) throw new Error('إعداد Firebase غير متاح.')
  return db
}

const inviteCodeCharacters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const createInviteCode = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (byte) => inviteCodeCharacters[byte % inviteCodeCharacters.length]).join('')
}

type GroupUser = Pick<User, 'uid' | 'displayName' | 'email'>

const displayNameFor = (user: GroupUser) => user.displayName?.trim() || user.email || 'عضو'

const roleFrom = (value: unknown): GroupRole => {
  if (value === 'owner' || value === 'admin' || value === 'member') return value
  throw new Error('دور العضو في المجموعة غير صالح.')
}

export async function createGroup(name: string, user: GroupUser, firestore: Firestore = assertDb()): Promise<CreatedGroup> {
  const normalizedName = name.trim()
  if (!normalizedName || normalizedName.length > 80) {
    throw new Error('يجب أن يتراوح اسم المجموعة بين حرف واحد و80 حرفًا.')
  }

  const groupRef = doc(collection(firestore, 'groups'))
  const memberRef = doc(groupRef, 'members', user.uid)
  let inviteCode = ''

  for (let attempt = 0; attempt < 5; attempt += 1) {
    inviteCode = createInviteCode()
    const inviteRef = doc(firestore, 'inviteCodes', inviteCode)
    try {
      await runTransaction(firestore, async (transaction) => {
        const inviteSnapshot = await transaction.get(inviteRef)
        if (inviteSnapshot.exists()) throw new Error('رمز الدعوة مستخدم بالفعل.')
        transaction.set(groupRef, {
          name: normalizedName,
          description: '',
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        })
        transaction.set(memberRef, {
          uid: user.uid,
          displayName: displayNameFor(user),
          role: 'owner',
          joinedAt: serverTimestamp(),
        })
        transaction.set(inviteRef, {
          groupId: groupRef.id,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        })
      })
      return {
        id: groupRef.id,
        name: normalizedName,
        description: '',
        createdBy: user.uid,
        createdAt: Date.now(),
        balance: 0,
        role: 'owner',
        members: [{ uid: user.uid, displayName: displayNameFor(user), role: 'owner' }],
        memberNames: [displayNameFor(user)],
        inviteCode,
      }
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'رمز الدعوة مستخدم بالفعل.') throw error
    }
  }

  throw new Error('تعذر إنشاء رمز دعوة فريد. يرجى المحاولة مرة أخرى.')
}

export async function getUserGroups(uid: string): Promise<UserGroup[]> {
  const firestore = assertDb()
  if (!uid) throw new Error('معرّف المستخدم مطلوب لجلب المجموعات.')

  const memberships = await getDocs(query(collectionGroup(firestore, 'members'), where('uid', '==', uid)))
  const groups = await Promise.all(memberships.docs.map(async (membership) => {
    const groupRef = membership.ref.parent.parent
    if (!groupRef) throw new Error('تعذر تحديد المجموعة المرتبطة بالعضوية.')
    const [groupSnapshot, memberSnapshots, fundSnapshot] = await Promise.all([
      getDoc(groupRef),
      getDocs(collection(groupRef, 'members')),
      getDoc(doc(groupRef, 'fund', groupRef.id)),
    ])
    if (!groupSnapshot.exists()) return null

    const value = groupSnapshot.data()
    if (typeof value.name !== 'string' || typeof value.createdBy !== 'string') {
      throw new Error(`بيانات المجموعة ${groupRef.id} غير صالحة.`)
    }
    const balance = fundSnapshot.exists() ? fundSnapshot.data().balance : 0
    if (typeof balance !== 'number' || !Number.isFinite(balance)) {
      throw new Error(`رصيد المجموعة ${groupRef.id} غير صالح.`)
    }
    const members = memberSnapshots.docs.map((member): GroupMember => {
      const memberValue = member.data()
      if (typeof memberValue.uid !== 'string' || typeof memberValue.displayName !== 'string') {
        throw new Error(`بيانات عضو غير صالحة في المجموعة ${groupRef.id}.`)
      }
      return {
        uid: memberValue.uid,
        displayName: memberValue.displayName,
        role: roleFrom(memberValue.role),
      }
    })

    return {
      id: groupRef.id,
      name: value.name,
      description: typeof value.description === 'string' ? value.description : '',
      createdBy: value.createdBy,
      createdAt: value.createdAt instanceof Timestamp ? value.createdAt.toMillis() : null,
      balance,
      role: roleFrom(membership.data().role),
      members,
      memberNames: members.map((member) => member.displayName),
    }
  }))

  return groups
    .filter((group): group is UserGroup => group !== null)
    .sort((left, right) => left.name.localeCompare(right.name))
}

export async function joinGroup(inviteCode: string, user: GroupUser, firestore: Firestore = assertDb()): Promise<UserGroup> {
  const normalizedCode = inviteCode.replace(/\s+/g, '').toUpperCase()
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(normalizedCode)) {
    throw new Error('أدخل رمز دعوة صالحًا من 8 أحرف أو أرقام.')
  }

  const inviteRef = doc(firestore, 'inviteCodes', normalizedCode)
  const inviteSnapshot = await getDoc(inviteRef)
  if (!inviteSnapshot.exists()) throw new Error('رمز الدعوة غير صالح أو منتهي.')
  const groupId = inviteSnapshot.data().groupId
  if (typeof groupId !== 'string' || !groupId) throw new Error('بيانات رمز الدعوة غير صالحة.')

  const groupRef = doc(firestore, 'groups', groupId)
  const memberRef = doc(groupRef, 'members', user.uid)
  await runTransaction(firestore, async (transaction) => {
    const currentInvite = await transaction.get(inviteRef)
    const currentMember = await transaction.get(memberRef)
    if (!currentInvite.exists() || currentInvite.data().groupId !== groupId) {
      throw new Error('رمز الدعوة غير صالح أو منتهي.')
    }
    if (currentMember.exists()) return true
    transaction.set(memberRef, {
      uid: user.uid,
      displayName: displayNameFor(user),
      role: 'member',
      joinedAt: serverTimestamp(),
      joinedViaInviteCode: normalizedCode,
    })
    return false
  })

  const currentGroup = await getDoc(groupRef)
  if (!currentGroup.exists()) throw new Error('رمز الدعوة غير صالح أو منتهي.')
  const groupValue = currentGroup.data()
  if (typeof groupValue.name !== 'string' || typeof groupValue.createdBy !== 'string') {
    throw new Error('بيانات المجموعة غير صالحة.')
  }
  const members = await getDocs(collection(groupRef, 'members'))
  const fundSnapshot = await getDoc(doc(groupRef, 'fund', groupId))
  const balance = fundSnapshot.exists() ? fundSnapshot.data().balance : 0
  if (typeof balance !== 'number' || !Number.isFinite(balance)) throw new Error(`رصيد المجموعة ${groupId} غير صالح.`)
  const groupMembers = members.docs.map((member): GroupMember => {
    const value = member.data()
    if (typeof value.uid !== 'string' || typeof value.displayName !== 'string') {
      throw new Error(`بيانات عضو غير صالحة في المجموعة ${groupId}.`)
    }
    return { uid: value.uid, displayName: value.displayName, role: roleFrom(value.role) }
  })
  const memberRole = groupMembers.find((member) => member.uid === user.uid)?.role
  if (!memberRole) throw new Error('تعذر تأكيد عضويتك في المجموعة.')

  return {
    id: groupId,
    name: groupValue.name,
    description: typeof groupValue.description === 'string' ? groupValue.description : '',
    createdBy: groupValue.createdBy,
    createdAt: groupValue.createdAt instanceof Timestamp ? groupValue.createdAt.toMillis() : null,
    balance,
    role: memberRole,
    members: groupMembers,
    memberNames: groupMembers.map((member) => member.displayName),
  }
}

export async function getGroupInviteCode(groupId: string): Promise<string> {
  const firestore = assertDb()
  const inviteSnapshots = await getDocs(query(
    collection(firestore, 'inviteCodes'),
    where('groupId', '==', groupId),
  ))
  const invite = inviteSnapshots.docs[0]
  if (!invite) throw new Error('لم يُعثر على رمز دعوة لهذه المجموعة.')
  return invite.id
}

export async function updateGroupDetails(groupId: string, name: string, description: string): Promise<void> {
  const firestore = assertDb()
  const normalizedName = name.trim()
  const normalizedDescription = description.trim()
  if (!normalizedName || normalizedName.length > 80) {
    throw new Error('يجب أن يتراوح اسم المجموعة بين حرف واحد و80 حرفًا.')
  }
  if (normalizedDescription.length > 500) {
    throw new Error('يجب ألا يتجاوز وصف المجموعة 500 حرف.')
  }
  await updateDoc(doc(firestore, 'groups', groupId), {
    name: normalizedName,
    description: normalizedDescription,
  })
}

export async function updateMemberRole(groupId: string, memberUid: string, role: Exclude<GroupRole, 'owner'>): Promise<void> {
  const firestore = assertDb()
  const memberRef = doc(firestore, 'groups', groupId, 'members', memberUid)
  const member = await getDoc(memberRef)
  if (!member.exists()) throw new Error('تعذر العثور على العضو.')
  if (roleFrom(member.data().role) === 'owner') {
    throw new Error('انقل الملكية إلى عضو آخر قبل تغيير دور المالك.')
  }
  await updateDoc(memberRef, { role })
}

export async function removeGroupMember(groupId: string, memberUid: string): Promise<void> {
  const firestore = assertDb()
  const memberRef = doc(firestore, 'groups', groupId, 'members', memberUid)
  const member = await getDoc(memberRef)
  if (!member.exists()) throw new Error('تعذر العثور على العضو.')
  if (roleFrom(member.data().role) === 'owner') {
    throw new Error('لا يمكن إزالة مالك المجموعة. انقل الملكية أولًا.')
  }
  await deleteDoc(memberRef)
}

export async function transferGroupOwnership(groupId: string, currentOwnerUid: string, newOwnerUid: string): Promise<void> {
  const firestore = assertDb()
  if (!newOwnerUid || newOwnerUid === currentOwnerUid) {
    throw new Error('اختر عضوًا آخر لنقل الملكية إليه.')
  }
  const groupRef = doc(firestore, 'groups', groupId)
  const currentOwnerRef = doc(groupRef, 'members', currentOwnerUid)
  const newOwnerRef = doc(groupRef, 'members', newOwnerUid)
  await runTransaction(firestore, async (transaction) => {
    const [groupSnapshot, currentOwnerSnapshot, newOwnerSnapshot] = await Promise.all([
      transaction.get(groupRef),
      transaction.get(currentOwnerRef),
      transaction.get(newOwnerRef),
    ])
    if (!groupSnapshot.exists() || !currentOwnerSnapshot.exists() || !newOwnerSnapshot.exists()) {
      throw new Error('تعذر العثور على المجموعة أو أحد الأعضاء.')
    }
    if (groupSnapshot.data().createdBy !== currentOwnerUid || currentOwnerSnapshot.data().role !== 'owner') {
      throw new Error('نقل الملكية متاح لمالك المجموعة الحالي فقط.')
    }
    if (newOwnerSnapshot.data().role === 'owner') throw new Error('هذا العضو هو المالك بالفعل.')

    transaction.update(groupRef, { createdBy: newOwnerUid })
    transaction.update(currentOwnerRef, { role: 'admin' })
    transaction.update(newOwnerRef, { role: 'owner' })
  })
}

export async function leaveGroup(groupId: string, uid: string): Promise<void> {
  const firestore = assertDb()
  const groupRef = doc(firestore, 'groups', groupId)
  const memberRef = doc(groupRef, 'members', uid)
  await runTransaction(firestore, async (transaction) => {
    const [groupSnapshot, memberSnapshot] = await Promise.all([
      transaction.get(groupRef),
      transaction.get(memberRef),
    ])
    if (!groupSnapshot.exists() || !memberSnapshot.exists()) {
      throw new Error('لم تعد عضوًا في هذه المجموعة.')
    }
    if (groupSnapshot.data().createdBy === uid || memberSnapshot.data().role === 'owner') {
      throw new Error('انقل الملكية إلى عضو آخر أو احذف المجموعة قبل المغادرة.')
    }
    transaction.delete(memberRef)
  })
}

async function deleteInChunks(references: ReturnType<typeof doc>[]): Promise<void> {
  const firestore = assertDb()
  for (let index = 0; index < references.length; index += 400) {
    const batch = writeBatch(firestore)
    references.slice(index, index + 400).forEach((reference) => batch.delete(reference))
    await batch.commit()
  }
}

export async function deleteGroup(groupId: string, ownerUid: string): Promise<void> {
  const firestore = assertDb()
  const groupRef = doc(firestore, 'groups', groupId)
  const ownerRef = doc(groupRef, 'members', ownerUid)
  const [groupSnapshot, ownerSnapshot] = await Promise.all([getDoc(groupRef), getDoc(ownerRef)])
  if (!groupSnapshot.exists() || !ownerSnapshot.exists()
    || groupSnapshot.data().createdBy !== ownerUid || ownerSnapshot.data().role !== 'owner') {
    throw new Error('حذف المجموعة متاح لمالكها الحالي فقط.')
  }

  const [memberSnapshots, transactionSnapshots, gatheringSnapshots, fundSnapshots, inviteSnapshots] = await Promise.all([
    getDocs(collection(groupRef, 'members')),
    getDocs(collection(groupRef, 'transactions')),
    getDocs(collection(groupRef, 'gatherings')),
    getDocs(collection(groupRef, 'fund')),
    getDocs(query(collection(firestore, 'inviteCodes'), where('groupId', '==', groupId))),
  ])
  const confirmationSnapshots = await Promise.all(transactionSnapshots.docs.map((transaction) =>
    getDocs(collection(transaction.ref, 'confirmations'))))

  await deleteInChunks(confirmationSnapshots.flatMap((snapshot) => snapshot.docs.map((item) => item.ref)))
  await deleteInChunks(transactionSnapshots.docs.map((item) => item.ref))
  await deleteInChunks(gatheringSnapshots.docs.map((item) => item.ref))
  await deleteInChunks(fundSnapshots.docs.map((item) => item.ref))
  await deleteInChunks(inviteSnapshots.docs.map((item) => item.ref))
  await deleteInChunks(memberSnapshots.docs
    .filter((member) => member.id !== ownerUid)
    .map((member) => member.ref))

  const finalBatch = writeBatch(firestore)
  finalBatch.delete(groupRef)
  finalBatch.delete(ownerRef)
  await finalBatch.commit()
}
