import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, beforeEach, test } from 'node:test'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import {
  approveAllSyncedContributions,
  decideSyncedContribution,
  mutateSyncedGathering,
  type SyncedKattahRequest,
} from '../src/fundPaymentSync'
import { joinGroup } from '../src/lib/groups'
import {
  approveSyncedObligationPayment,
  decideSyncedReimbursement,
} from '../src/lib/fundOperations'

const projectId = 'nassaq-ohqtgp'
let environment: RulesTestEnvironment

const groupPath = (groupId: string) => `groups/${groupId}`

before(async () => {
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  })
})

after(async () => {
  await environment.cleanup()
})

beforeEach(async () => {
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore()
    const writes: Promise<unknown>[] = [
      setDoc(doc(firestore, groupPath('group-a')), { name: 'Group A', createdBy: 'owner-a' }),
      setDoc(doc(firestore, groupPath('group-b')), { name: 'Group B', createdBy: 'owner-b' }),
      setDoc(doc(firestore, 'inviteCodes/ABCDEFG2'), {
        groupId: 'group-a',
        createdBy: 'owner-a',
      }),
      setDoc(doc(firestore, 'groups/group-a/members/owner-a'), { uid: 'owner-a', role: 'owner', displayName: 'Owner A' }),
      setDoc(doc(firestore, 'groups/group-a/members/admin-a'), { uid: 'admin-a', role: 'admin', displayName: 'Admin A' }),
      setDoc(doc(firestore, 'groups/group-a/members/member-a'), { uid: 'member-a', role: 'member', displayName: 'Member A' }),
      setDoc(doc(firestore, 'groups/group-a/members/member-c'), { uid: 'member-c', role: 'member', displayName: 'Member C' }),
      setDoc(doc(firestore, 'groups/group-b/members/owner-b'), { uid: 'owner-b', role: 'owner', displayName: 'Owner B' }),
      setDoc(doc(firestore, 'groups/group-b/members/member-b'), { uid: 'member-b', role: 'member', displayName: 'Member B' }),
      setDoc(doc(firestore, 'groups/group-a/fund/group-a'), { groupId: 'group-a', balance: 100 }),
      setDoc(doc(firestore, 'groups/group-b/fund/group-b'), { groupId: 'group-b', balance: 800 }),
      setDoc(doc(firestore, 'groups/group-a/transactions/1'), {
        id: 1,
        workspaceId: 'group-a',
        title: 'Monthly contribution',
        cadence: 'monthly',
        total: 30,
        due: '2026-12-01',
        contributions: [
          { uid: 'member-a', name: 'Member A', amount: 10, status: 'unpaid' },
          { uid: 'member-c', name: 'Member C', amount: 20, status: 'unpaid' },
        ],
      } satisfies SyncedKattahRequest),
      setDoc(doc(firestore, 'groups/group-a/transactions/1/confirmations/member-a'), {
        uid: 'member-a',
        status: 'awaiting',
        confirmedAt: new Date(),
      }),
      setDoc(doc(firestore, 'groups/group-a/transactions/1/confirmations/member-c'), {
        uid: 'member-c',
        status: 'awaiting',
        confirmedAt: new Date(),
      }),
      setDoc(doc(firestore, 'groups/group-a/obligations/20'), {
        workspaceId: 'group-a',
        title: 'Shared rent',
        amount: 10,
        cadence: 'monthly',
        due: '2026-12-01',
        status: 'awaiting',
      }),
      setDoc(doc(firestore, 'groups/group-a/reimbursements/30'), {
        id: 30,
        workspaceId: 'group-a',
        title: 'Supplies',
        member: 'Member A',
        memberUid: 'member-a',
        amount: 25,
        receipt: 'receipt',
        status: 'review',
      }),
      setDoc(doc(firestore, 'groups/group-a/gatherings/gathering-1'), {
        createdById: 'owner-a',
        createdByName: 'Owner A',
        title: 'Dinner',
        date: 'Tomorrow',
        eventAt: 1_800_000_000_000,
        deadlineAt: 1_799_000_000_000,
        location: 'Home',
        attendees: 1,
        total: 2,
        badge: 'Open',
        badgeColor: 'green',
        icon: 'party',
        participants: [],
        expenses: [],
        tasks: [],
      }),
    ]
    await Promise.all(writes)
  })
})

test('members can read only their own group, and cannot manage balances or contributions', async () => {
  const memberDb = environment.authenticatedContext('member-a').firestore()

  await assertSucceeds(getDoc(doc(memberDb, groupPath('group-a'))))
  await assertFails(getDoc(doc(memberDb, groupPath('group-b'))))
  await assertSucceeds(getDoc(doc(memberDb, 'groups/group-a/transactions/1')))
  await assertFails(getDoc(doc(memberDb, 'groups/group-b/transactions/1')))
  await assertFails(setDoc(doc(memberDb, 'groups/group-a/fund/group-a'), { groupId: 'group-a', balance: 0 }))
  await assertFails(decideSyncedContribution('group-a', 1, 'member-a', 'paid', 0, memberDb))

  const otherGroupDb = environment.authenticatedContext('member-b').firestore()
  await assertFails(getDoc(doc(otherGroupDb, groupPath('group-a'))))
  await assertFails(getDoc(doc(otherGroupDb, 'groups/group-a/gatherings/gathering-1')))
  await assertFails(getDoc(doc(memberDb, groupPath('group-b'))))
})

test('invitees can join through an invite without being able to read the group beforehand', async () => {
  const inviteeDb = environment.authenticatedContext('new-member').firestore()
  await assertFails(getDoc(doc(inviteeDb, groupPath('group-a'))))

  const group = await joinGroup('ABCDEFG2', {
    uid: 'new-member',
    displayName: 'New Member',
    email: null,
  }, inviteeDb)

  assert.equal(group.name, 'Group A')
  assert.equal(group.role, 'member')
  assert.equal((await getDoc(doc(inviteeDb, groupPath('group-a')))).exists(), true)
})

test('concurrent contribution approvals serialize and credit the balance exactly once', async () => {
  const managerDb = environment.authenticatedContext('admin-a').firestore()

  const [single, batch] = await Promise.all([
    decideSyncedContribution('group-a', 1, 'member-a', 'paid', 0, managerDb),
    approveAllSyncedContributions('group-a', 1, 0, managerDb),
  ])
  assert.equal((single ?? 0) + batch.total, 30)
  const balance = await getDoc(doc(managerDb, 'groups/group-a/fund/group-a'))
  assert.equal(balance.data()?.balance, 130)

  const request = await getDoc(doc(managerDb, 'groups/group-a/transactions/1'))
  const requestData = request.data()
  assert.ok(requestData)
  assert.ok(Array.isArray(requestData.contributions))
  assert.deepEqual(requestData.contributions.map((item: { status: string }) => item.status), ['paid', 'paid'])

  const duplicate = await Promise.all([
    decideSyncedContribution('group-a', 1, 'member-a', 'paid', 0, managerDb),
    decideSyncedContribution('group-a', 1, 'member-a', 'paid', 0, managerDb),
  ])
  assert.deepEqual(duplicate, [null, null])
  assert.equal((await getDoc(doc(managerDb, 'groups/group-a/fund/group-a'))).data()?.balance, 130)
})

test('duplicate obligation and reimbursement approvals do not double-charge the fund', async () => {
  const managerDb = environment.authenticatedContext('admin-a').firestore()
  await assertSucceeds(getDoc(doc(managerDb, 'groups/group-a/members/admin-a')))
  await assertSucceeds(updateDoc(doc(managerDb, 'groups/group-a/fund/group-a'), { balance: 100 }))
  await assertSucceeds(updateDoc(doc(managerDb, 'groups/group-a/obligations/20'), {
    status: 'paid',
    paidAt: new Date(),
  }))
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'groups/group-a/obligations/20'), {
      workspaceId: 'group-a',
      title: 'Shared rent',
      amount: 10,
      cadence: 'monthly',
      due: '2026-12-01',
      status: 'awaiting',
    })
  })

  const obligationResults = await Promise.all([
    approveSyncedObligationPayment('group-a', 20, managerDb),
    approveSyncedObligationPayment('group-a', 20, managerDb),
  ])
  assert.equal(obligationResults.filter(Boolean).length, 1)
  assert.equal((await getDoc(doc(managerDb, 'groups/group-a/fund/group-a'))).data()?.balance, 90)

  const reimbursementResults = await Promise.all([
    decideSyncedReimbursement('group-a', 30, 'awaiting-receipt', managerDb),
    decideSyncedReimbursement('group-a', 30, 'awaiting-receipt', managerDb),
  ])
  assert.equal(reimbursementResults.filter(Boolean).length, 1)
  assert.equal((await getDoc(doc(managerDb, 'groups/group-a/fund/group-a'))).data()?.balance, 65)
  assert.equal((await getDoc(doc(managerDb, 'groups/group-a/reimbursements/30'))).data()?.status, 'awaiting-receipt')
})

test('a different group member cannot approve or read another group reimbursement', async () => {
  const otherGroupDb = environment.authenticatedContext('member-b').firestore()
  await assertFails(getDoc(doc(otherGroupDb, 'groups/group-a/reimbursements/30')))
  await assertFails(decideSyncedReimbursement('group-a', 30, 'awaiting-receipt', otherGroupDb))

  const memberDb = environment.authenticatedContext('member-a').firestore()
  await assertFails(decideSyncedReimbursement('group-a', 30, 'awaiting-receipt', memberDb))
})

test('concurrent gathering expenses preserve both updates instead of overwriting stale state', async () => {
  const memberDb = environment.authenticatedContext('member-a').firestore()
  const adminDb = environment.authenticatedContext('admin-a').firestore()
  type TestGathering = { id: string; expenses: Array<{ id: number; description: string }> }
  const decode = (id: string, value: Record<string, unknown>) => ({ ...value, id }) as TestGathering
  const addExpense = (description: string) => mutateSyncedGathering(
    'group-a',
    'gathering-1',
    decode,
    (gathering) => ({
      ...gathering,
      expenses: [...gathering.expenses, { id: gathering.expenses.length + 1, description }],
    }),
    memberDb,
  )

  await Promise.all([
    addExpense('Meal'),
    mutateSyncedGathering('group-a', 'gathering-1', decode, (gathering) => ({
      ...gathering,
      expenses: [...gathering.expenses, { id: gathering.expenses.length + 1, description: 'Drinks' }],
    }), adminDb),
  ])

  const gathering = await getDoc(doc(adminDb, 'groups/group-a/gatherings/gathering-1'))
  const gatheringData = gathering.data()
  assert.ok(gatheringData)
  assert.ok(Array.isArray(gatheringData.expenses))
  assert.deepEqual(gatheringData.expenses.map((item: { description: string }) => item.description).sort(), ['Drinks', 'Meal'])
})

test('gathering creators control metadata and deletion while members can create only for themselves', async () => {
  const memberDb = environment.authenticatedContext('member-a').firestore()

  await assertFails(updateDoc(doc(memberDb, 'groups/group-a/gatherings/gathering-1'), {
    title: 'Hijacked title',
  }))
  await assertFails(setDoc(doc(memberDb, 'groups/group-a/gatherings/forged'), {
    createdById: 'owner-a',
    title: 'Forged gathering',
  }))
  await assertFails(deleteDoc(doc(memberDb, 'groups/group-a/gatherings/gathering-1')))

  await assertSucceeds(setDoc(doc(memberDb, 'groups/group-a/gatherings/member-event'), {
    createdById: 'member-a',
    title: 'Member gathering',
  }))
  await assertSucceeds(deleteDoc(doc(memberDb, 'groups/group-a/gatherings/member-event')))
})

test('only managers can create obligations, and only the requester can acknowledge a reimbursement', async () => {
  const memberDb = environment.authenticatedContext('member-a').firestore()

  await assertFails(setDoc(doc(memberDb, 'groups/group-a/obligations/21'), {
    workspaceId: 'group-a',
    createdByUid: 'member-a',
    title: 'Unauthorized',
    amount: 5,
    cadence: 'monthly',
    due: '2026-12-01',
    status: 'upcoming',
  }))

  await assertSucceeds(setDoc(doc(memberDb, 'groups/group-a/reimbursements/31'), {
    id: 31,
    workspaceId: 'group-a',
    title: 'Member expense',
    member: 'Member A',
    memberUid: 'member-a',
    amount: 10,
    receipt: 'receipt',
    status: 'review',
  }))
  await assertFails(setDoc(doc(memberDb, 'groups/group-a/reimbursements/30'), {
    id: 30,
    workspaceId: 'group-a',
    title: 'Changed',
    member: 'Member A',
    memberUid: 'member-a',
    amount: 25,
    receipt: 'receipt',
    status: 'received',
  }))
})

test('a requester cannot acknowledge another member’s reimbursement', async () => {
  const otherMemberDb = environment.authenticatedContext('member-c').firestore()
  await assertFails(setDoc(doc(otherMemberDb, 'groups/group-a/reimbursements/30'), {
    id: 30,
    workspaceId: 'group-a',
    title: 'Supplies',
    member: 'Member A',
    memberUid: 'member-a',
    amount: 25,
    receipt: 'receipt',
    status: 'received',
  }))
})
