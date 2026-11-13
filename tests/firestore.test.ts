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
  type Firestore,
} from 'firebase/firestore'
import {
  approveAllSyncedContributions,
  confirmSyncedContribution,
  decideSyncedContribution,
  mutateSyncedGathering,
  createSyncedRequest,
  type SyncedKattahRequest,
} from '../src/fundPaymentSync'
import { createGroup, enableGroupFund, joinGroup, leaveGroup, removeGroupMember } from '../src/lib/groups'
import {
  createSyncedBillSplit,
  createSyncedGathering,
  INDEPENDENT_GATHERINGS,
  setSyncedBillSplitStatus,
} from '../src/fundPaymentSync'
import {
  approveSyncedObligationPayment,
  decideSyncedReimbursement,
  reportSyncedObligationPayment,
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
      setDoc(doc(firestore, groupPath('group-a')), {
        name: 'Group A',
        createdBy: 'owner-a',
        memberUids: ['owner-a', 'admin-a', 'member-a', 'member-c'],
      }),
      setDoc(doc(firestore, groupPath('group-b')), { name: 'Group B', createdBy: 'owner-b', memberUids: ['owner-b', 'member-b'] }),
      setDoc(doc(firestore, 'inviteCodes/ABCDEFG2'), {
        groupId: 'group-a',
        createdBy: 'owner-a',
        memberCount: 4,
      }),
      setDoc(doc(firestore, 'groups/group-a/members/owner-a'), { uid: 'owner-a', role: 'owner', displayName: 'Owner A' }),
      setDoc(doc(firestore, 'groups/group-a/members/admin-a'), { uid: 'admin-a', role: 'admin', displayName: 'Admin A', joinedViaInviteCode: 'ABCDEFG2' }),
      setDoc(doc(firestore, 'groups/group-a/members/member-a'), { uid: 'member-a', role: 'member', displayName: 'Member A', joinedViaInviteCode: 'ABCDEFG2' }),
      setDoc(doc(firestore, 'groups/group-a/members/member-c'), { uid: 'member-c', role: 'member', displayName: 'Member C', joinedViaInviteCode: 'ABCDEFG2' }),
      setDoc(doc(firestore, 'groups/group-b/members/owner-b'), { uid: 'owner-b', role: 'owner', displayName: 'Owner B' }),
      setDoc(doc(firestore, 'groups/group-b/members/member-b'), { uid: 'member-b', role: 'member', displayName: 'Member B' }),
      setDoc(doc(firestore, 'groups/group-a/fund/group-a'), { groupId: 'group-a', balance: 100 }),
      setDoc(doc(firestore, 'groups/group-b/fund/group-b'), { groupId: 'group-b', balance: 800 }),
      setDoc(doc(firestore, 'groups/group-a/transactions/1'), {
        id: 1,
        workspaceId: 'group-a',
        createdBy: 'owner-a',
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

test('new contribution requests require the creator, valid participants, and a positive total', async () => {
  const memberDb = environment.authenticatedContext('member-a').firestore()
  const request: SyncedKattahRequest = {
    id: 2,
    workspaceId: 'group-a',
    createdBy: 'member-a',
    title: 'Shared meal',
    cadence: 'once',
    total: 30,
    due: '2026-12-01',
    contributions: [
      { uid: 'owner-a', name: 'Owner A', amount: 7.5, status: 'unpaid' },
      { uid: 'admin-a', name: 'Admin A', amount: 7.5, status: 'unpaid' },
      { uid: 'member-a', name: 'Member A', amount: 7.5, status: 'unpaid' },
      { uid: 'member-c', name: 'Member C', amount: 7.5, status: 'unpaid' },
    ],
  }
  const requestData = {
    id: request.id,
    workspaceId: request.workspaceId,
    createdBy: request.createdBy,
    title: request.title,
    cadence: request.cadence,
    total: request.total,
    due: request.due,
    participantUids: request.contributions.map(({ uid }) => uid),
    participantNames: Object.fromEntries(request.contributions.map(({ uid, name }) => [uid, name])),
  }

  await assertSucceeds(createSyncedRequest('group-a', request, memberDb))
  const savedRequest = await getDoc(doc(memberDb, 'groups/group-a/transactions/2'))
  assert.deepEqual(savedRequest.data()?.participantUids, requestData.participantUids)
  assert.equal(savedRequest.data()?.contributions, undefined)
  await assertFails(setDoc(doc(memberDb, 'groups/group-a/transactions/5'), {
    ...requestData,
    id: 5,
    total: 0,
  }))
  await assertFails(setDoc(doc(memberDb, 'groups/group-a/transactions/6'), {
    ...requestData,
    id: 6,
    createdBy: 'member-c',
  }))
  await assertFails(setDoc(doc(memberDb, 'groups/group-a/transactions/7'), {
    ...requestData,
    id: 7,
    participantUids: ['member-a', 'outsider'],
    participantNames: { 'member-a': 'Member A', outsider: 'Outsider' },
  }))
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
  assert.equal((await getDoc(doc(inviteeDb, 'inviteCodes/ABCDEFG2'))).data()?.memberCount, 5)
})

test('new groups initialize membership tracking at one member', async () => {
  const creatorDb = environment.authenticatedContext('new-owner').firestore()
  const group = await createGroup('New group', {
    uid: 'new-owner',
    displayName: 'New Owner',
    email: null,
  }, creatorDb)

  const groupSnapshot = await getDoc(doc(creatorDb, groupPath(group.id)))
  assert.equal(groupSnapshot.data()?.createdBy, 'new-owner')
  assert.deepEqual(groupSnapshot.data()?.memberUids, ['new-owner'])
  assert.equal(groupSnapshot.data()?.hasFund, true)
  const ownerSnapshot = await getDoc(doc(creatorDb, `groups/${group.id}/members/new-owner`))
  assert.equal(ownerSnapshot.data()?.uid, 'new-owner')
  assert.equal(ownerSnapshot.data()?.role, 'owner')
  assert.equal((await getDoc(doc(creatorDb, `groups/${group.id}/fund/${group.id}`))).data()?.balance, 0)
  const inviteSnapshot = await getDoc(doc(creatorDb, `inviteCodes/${group.inviteCode}`))
  assert.equal(inviteSnapshot.data()?.groupId, group.id)
  assert.equal(inviteSnapshot.data()?.createdBy, 'new-owner')
  assert.equal(inviteSnapshot.data()?.memberCount, 1)

  const unauthenticatedDb = environment.unauthenticatedContext().firestore()
  await assert.rejects(createGroup('Unauthenticated', {
    uid: 'not-signed-in',
    displayName: 'Unauthenticated',
    email: null,
  }, unauthenticatedDb))

  const mismatchedAuthDb = environment.authenticatedContext('different-user').firestore()
  await assert.rejects(createGroup('Wrong owner', {
    uid: 'requested-owner',
    displayName: 'Wrong owner',
    email: null,
  }, mismatchedAuthDb))
})

test('independent gatherings are shared only with invitees and allow self RSVP', async () => {
  const creatorDb = environment.authenticatedContext('organizer').firestore()
  await createSyncedGathering(INDEPENDENT_GATHERINGS, {
    id: 'independent-dinner',
    workspaceId: INDEPENDENT_GATHERINGS,
    createdById: 'organizer',
    createdByName: 'Organizer',
    participantUids: ['organizer', 'invitee'],
    participants: [
      { uid: 'organizer', name: 'Organizer', decision: 'joined' },
      { uid: 'invitee', name: 'Invitee', decision: 'pending' },
    ],
    participantDecisionsByUid: {},
    expensesByUid: {},
    taskClaimsByUid: {},
    expenses: [],
    tasks: [],
  }, creatorDb)

  const inviteeDb = environment.authenticatedContext('invitee').firestore()
  const gatheringRef = doc(inviteeDb, 'gatherings/independent-dinner')
  await assertSucceeds(getDoc(gatheringRef))
  await assertSucceeds(updateDoc(gatheringRef, {
    participantDecisionsByUid: { invitee: 'joined' },
  }))
  await assertFails(updateDoc(gatheringRef, {
    participantDecisionsByUid: { organizer: 'declined' },
  }))
  await assertFails(getDoc(doc(environment.authenticatedContext('outsider').firestore(), 'gatherings/independent-dinner')))
})

test('bill-split requests track participant payment independently and only creator confirms', async () => {
  const creatorDb = environment.authenticatedContext('split-owner').firestore()
  const splitId = await createSyncedBillSplit({
    createdByUid: 'split-owner',
    createdByName: 'Split Owner',
    title: 'Dinner',
    total: 40,
    participantUids: ['split-owner', 'split-member'],
    participantNames: { 'split-owner': 'Split Owner', 'split-member': 'Split Member' },
    sharesByUid: { 'split-owner': 20, 'split-member': 20 },
    paymentStatuses: { 'split-owner': 'pending', 'split-member': 'pending' },
  }, creatorDb)

  const memberDb = environment.authenticatedContext('split-member').firestore()
  await assertSucceeds(getDoc(doc(memberDb, `billSplits/${splitId}`)))
  await assertSucceeds(setSyncedBillSplitStatus(splitId, 'split-member', 'awaiting', memberDb))
  await assertFails(setSyncedBillSplitStatus(splitId, 'split-member', 'paid', memberDb))
  await assertFails(getDoc(doc(environment.authenticatedContext('split-outsider').firestore(), `billSplits/${splitId}`)))

  await assertSucceeds(setSyncedBillSplitStatus(splitId, 'split-member', 'paid', creatorDb))
  assert.equal((await getDoc(doc(creatorDb, `billSplits/${splitId}`))).data()?.paymentStatuses['split-member'], 'paid')
})

test('event groups do not create a fund until a manager enables it', async () => {
  const creatorDb = environment.authenticatedContext('event-owner').firestore()
  const group = await createGroup('Event group', {
    uid: 'event-owner',
    displayName: 'Event Owner',
    email: null,
  }, creatorDb, { hasFund: false })
  const groupRef = doc(creatorDb, groupPath(group.id))
  const fundRef = doc(creatorDb, `groups/${group.id}/fund/${group.id}`)

  assert.equal(group.hasFund, false)
  assert.equal((await getDoc(groupRef)).data()?.hasFund, false)
  assert.equal((await getDoc(fundRef)).exists(), false)

  await assertSucceeds(enableGroupFund(group.id, creatorDb))
  assert.equal((await getDoc(groupRef)).data()?.hasFund, true)
  assert.equal((await getDoc(fundRef)).data()?.balance, 0)
})

test('invite rules reject joining a group at the 30-member cap', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore()
    const writes = Array.from({ length: 26 }, (_, index) =>
      setDoc(doc(firestore, `groups/group-a/members/extra-${index}`), {
        uid: `extra-${index}`,
        role: 'member',
        displayName: `Extra ${index}`,
        joinedViaInviteCode: 'ABCDEFG2',
      }))
    await Promise.all(writes)
    await setDoc(doc(firestore, groupPath('group-a')), {
      name: 'Group A',
      createdBy: 'owner-a',
      memberUids: ['owner-a', 'admin-a', 'member-a', 'member-c', ...Array.from({ length: 26 }, (_, index) => `extra-${index}`)],
    })
    await setDoc(doc(firestore, 'inviteCodes/ABCDEFG2'), {
      groupId: 'group-a',
      createdBy: 'owner-a',
      memberCount: 30,
    })
  })

  const inviteeDb = environment.authenticatedContext('blocked-member').firestore()
  await assert.rejects(
    joinGroup('ABCDEFG2', { uid: 'blocked-member', displayName: 'Blocked', email: null }, inviteeDb),
    /وصلت المجموعة إلى الحد الأقصى وهو 30 عضوًا/,
  )
  await assertFails(setDoc(doc(inviteeDb, 'groups/group-a/members/blocked-member'), {
    uid: 'blocked-member',
    role: 'member',
    displayName: 'Blocked',
    joinedViaInviteCode: 'ABCDEFG2',
  }))
  assert.equal((await getDoc(doc(inviteeDb, 'inviteCodes/ABCDEFG2'))).data()?.memberCount, 30)

  const memberDb = environment.authenticatedContext('member-a').firestore()
  const memberUids = ['owner-a', 'admin-a', 'member-a', 'member-c', ...Array.from({ length: 26 }, (_, index) => `extra-${index}`)]
  await createSyncedRequest('group-a', {
    id: 8,
    workspaceId: 'group-a',
    createdBy: 'member-a',
    title: 'Group contribution',
    cadence: 'once',
    total: 300,
    due: '2026-12-01',
    contributions: memberUids.map((uid) => ({ uid, name: uid, amount: 10, status: 'unpaid' })),
  }, memberDb)
  const request = await getDoc(doc(memberDb, 'groups/group-a/transactions/8'))
  assert.equal(request.data()?.participantUids.length, 30)
  await confirmSyncedContribution('group-a', 8, 'member-a', memberDb)
  const managerDb = environment.authenticatedContext('admin-a').firestore()
  await decideSyncedContribution('group-a', 8, 'member-a', 'paid', 0, managerDb)
  const approvedRequest = await getDoc(doc(managerDb, 'groups/group-a/transactions/8'))
  assert.equal(approvedRequest.data()?.contributionStatuses['member-a'], 'paid')
})

test('removing members and leaving decrement the invite membership counter', async () => {
  const managerDb = environment.authenticatedContext('admin-a').firestore()
  await removeGroupMember('group-a', 'member-c', managerDb)
  assert.equal((await getDoc(doc(managerDb, 'inviteCodes/ABCDEFG2'))).data()?.memberCount, 3)

  const memberDb = environment.authenticatedContext('member-a').firestore()
  await leaveGroup('group-a', 'member-a', memberDb)
  assert.equal((await getDoc(doc(managerDb, 'inviteCodes/ABCDEFG2'))).data()?.memberCount, 2)
  await environment.withSecurityRulesDisabled(async (context) => {
    assert.equal((await getDoc(doc(context.firestore(), 'groups/group-a/members/member-a'))).exists(), false)
  })
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

test('members can confirm obligation payments before the due date', async () => {
  const memberDb = environment.authenticatedContext('member-a').firestore()
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'groups/group-a/obligations/21'), {
      workspaceId: 'group-a',
      title: 'Future rent',
      amount: 10,
      cadence: 'monthly',
      due: '2099-12-01',
      status: 'upcoming',
    })
  })

  assert.equal(await reportSyncedObligationPayment('group-a', 21, 'member-a', memberDb), true)
  assert.equal((await getDoc(doc(memberDb, 'groups/group-a/obligations/21'))).data()?.status, 'awaiting')
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

test('concurrent per-member gathering expenses preserve both updates', async () => {
  const memberDb = environment.authenticatedContext('member-a').firestore()
  const adminDb = environment.authenticatedContext('admin-a').firestore()
  type TestGathering = {
    id: string
    expenses: Array<{ id: number; description: string }>
    expensesByUid?: Record<string, Array<{ id: number; description: string; payer: string; amount: number }>>
  }
  const decode = (id: string, value: Record<string, unknown>) => ({ ...value, id }) as TestGathering
  const addExpense = (uid: string, description: string, firestore: Firestore) => mutateSyncedGathering(
    'group-a',
    'gathering-1',
    decode,
    (gathering) => ({
      ...gathering,
      expensesByUid: {
        ...gathering.expensesByUid,
        [uid]: [
          ...(gathering.expensesByUid?.[uid] ?? []),
          { id: (gathering.expensesByUid?.[uid] ?? []).length + 1, description, payer: uid, amount: 10 },
        ],
      },
    }),
    firestore,
  )

  await Promise.all([
    addExpense('member-a', 'Meal', memberDb),
    addExpense('admin-a', 'Drinks', adminDb),
  ])

  const gathering = await getDoc(doc(adminDb, 'groups/group-a/gatherings/gathering-1'))
  const gatheringData = gathering.data()
  assert.ok(gatheringData)
  assert.deepEqual(
    Object.values(gatheringData.expensesByUid as Record<string, Array<{ description: string }>>)
      .flat()
      .map((item) => item.description)
      .sort(),
    ['Drinks', 'Meal'],
  )
})

test('gathering members can update only their own RSVP, expense additions, and task claims', async () => {
  const memberDb = environment.authenticatedContext('member-a').firestore()
  const gatheringRef = doc(memberDb, 'groups/group-a/gatherings/gathering-1')

  await assertSucceeds(updateDoc(gatheringRef, {
    participantDecisionsByUid: { 'member-a': 'joined' },
  }))
  await assertFails(updateDoc(gatheringRef, {
    participantDecisionsByUid: { 'member-a': 'declined', 'member-c': 'joined' },
  }))
  await assertSucceeds(updateDoc(gatheringRef, {
    expensesByUid: {
      'member-a': [{ id: 1, description: 'Meal', payer: 'Member A', amount: 10 }],
    },
  }))
  await assertFails(updateDoc(gatheringRef, {
    expensesByUid: {
      'member-a': [{ id: 1, description: 'Changed meal', payer: 'Member A', amount: 1000 }],
    },
  }))
  await assertFails(updateDoc(gatheringRef, {
    expensesByUid: {
      'member-a': [{ id: 1, description: 'Meal', payer: 'Member A', amount: 10 }],
      'member-c': [{ id: 2, description: 'Other member expense', payer: 'Member C', amount: 10 }],
    },
  }))
  await assertSucceeds(updateDoc(gatheringRef, {
    taskClaimsByUid: { 'member-a': [1] },
  }))
  await assertFails(updateDoc(gatheringRef, {
    taskClaimsByUid: { 'member-a': [1], 'member-c': [2] },
  }))
  await assertFails(updateDoc(gatheringRef, { attendees: 99 }))
  await assertFails(updateDoc(gatheringRef, { total: 9999 }))
  await assertFails(updateDoc(gatheringRef, {
    participants: [{ uid: 'member-c', name: 'Member C', decision: 'joined' }],
  }))
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
