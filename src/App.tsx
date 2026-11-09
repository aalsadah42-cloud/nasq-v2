import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { LucideIcon } from 'lucide-react'
import { create } from 'zustand'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  type User,
} from 'firebase/auth'
import type { DocumentData } from 'firebase/firestore'
import type { SyncedContribution, SyncedKattahRequest } from './fundPaymentSync'
import { auth } from './lib/firebase'
import { createGroup, getUserGroups, joinGroup, MAX_GROUP_MEMBERS, type UserGroup } from './lib/groups'
import { AuthModal } from './components/AuthModal'; //
import { GroupSettingsModal } from './components/GroupSettingsModal'
import { ProfileSettingsModal } from './components/ProfileSettingsModal'
import { getUserProfile, type PaymentMethod } from './lib/userProfile'
import {
  approveSyncedObligationPayment,
  confirmSyncedReimbursementReceipt,
  createSyncedObligation,
  createSyncedReimbursement,
  decideSyncedReimbursement,
  reportSyncedObligationPayment,
  subscribeToFundOperations,
  type Obligation,
  type Reimbursement,
} from './lib/fundOperations'
import {
  ArrowLeftRight,
  ArrowUpLeft,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Clock3,
  Copy,
  LayoutDashboard,
  Languages,
  MapPin,
  Menu,
  Plus,
  ReceiptText,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRoundPlus,
  UsersRound,
  Wallet,
  X,
} from 'lucide-react'
import './App.css'

type View = 'overview' | 'funds' | 'workspace' | 'gatherings' | 'split' | 'activity'
type CreateKind = 'fund' | 'gathering'
type Fund = { id: string; title: string; members: number; memberNames: string[]; balance: number; role: UserGroup['role']; icon: string; color: string; due: string }
type WorkspaceGroup = Fund & { hasFund: boolean }
type GatheringDecision = 'joined' | 'declined' | 'pending'
type GatheringParticipant = { uid?: string; name: string; decision: GatheringDecision; late?: boolean; settlementStatus?: 'pending' | 'paid'; paymentMethod?: PaymentMethod; paymentDetails?: string }
type GatheringExpense = { id: number; description: string; payer: string; amount: number }
type GatheringTask = { id: number; title: string; assignedTo?: string }
type Gathering = {
  id: string
  workspaceId: string
  createdById: string
  createdByName: string
  title: string
  date: string
  eventAt: number
  deadlineAt: number
  location: string
  attendees: number
  total: number
  badge: string
  badgeColor: string
  icon: string
  participants: GatheringParticipant[]
  expenses: GatheringExpense[]
  tasks: GatheringTask[]
  participantDecisionsByUid?: Record<string, Exclude<GatheringDecision, 'pending'>>
  expensesByUid?: Record<string, GatheringExpense[]>
  taskClaimsByUid?: Record<string, number[]>
  estimatedCost?: number
}
type GatheringLanguage = 'ar' | 'en'
const hasFirebaseConfig = [
  import.meta.env.VITE_FIREBASE_API_KEY,
  import.meta.env.VITE_FIREBASE_PROJECT_ID,
  import.meta.env.VITE_FIREBASE_APP_ID,
].every(Boolean)
type GatheringStore = {
  gatherings: Gathering[]
  syncError: string
  replaceCloudGatherings: (gatherings: Gathering[]) => void
  setSyncError: (message: string) => void
  updateGatherings: (groupId: string, updater: (current: Gathering[]) => Gathering[]) => void
}
type PaymentStatus = SyncedContribution['status']
type Contribution = SyncedContribution
type KattahRequest = SyncedKattahRequest
type FundPaymentState = {
  kattahRequests: KattahRequest[]
  fundBalances: Record<string, number>
  replaceCloudRequests: (requests: KattahRequest[]) => void
  replaceCloudBalances: (balances: Record<string, number>) => void
  addKattahRequest: (request: KattahRequest) => void
  confirmContribution: (workspaceId: string, requestId: number, memberUid: string) => boolean
  approveContribution: (workspaceId: string, requestId: number, memberUid: string, fallbackBalance: number) => Contribution | null
  rejectContribution: (workspaceId: string, requestId: number, memberUid: string) => boolean
  approveAwaitingContributions: (workspaceId: string, requestId: number, fallbackBalance: number) => Contribution[]
  adjustFundBalance: (workspaceId: string, amount: number, fallbackBalance: number) => void
}
type FundActivity = { id: number; workspaceId: string; title: string; detail: string; amount: string; kind: 'pending' | 'success' | 'event'; time: string }

const navigation: { id: View; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'الصفحة الرئيسية', icon: LayoutDashboard },
  { id: 'funds', label: 'الصناديق', icon: Wallet },
  { id: 'gatherings', label: 'الجمعات', icon: UsersRound },
  { id: 'split', label: 'القسمة السريعة', icon: ArrowLeftRight },
  { id: 'activity', label: 'سجل العمليات', icon: ReceiptText },
]

const useFundPaymentStore = create<FundPaymentState>()((set) => ({
  kattahRequests: [],
  fundBalances: {},
  replaceCloudRequests: (requests) => set({ kattahRequests: requests }),
  replaceCloudBalances: (balances) => set({ fundBalances: balances }),
  addKattahRequest: (request) => set((state) => ({ kattahRequests: [request, ...state.kattahRequests] })),
  confirmContribution: (workspaceId, requestId, memberUid) => {
    let updated = false
    set((state) => ({
      kattahRequests: state.kattahRequests.map((request) => request.workspaceId === workspaceId && request.id === requestId
        ? {
          ...request,
          contributions: request.contributions.map((contribution) => {
            if (contribution.uid !== memberUid || !['unpaid', 'rejected'].includes(contribution.status)) return contribution
            updated = true
            return { ...contribution, status: 'awaiting', confirmedAt: Date.now() }
          }),
        }
        : request),
    }))
    return updated
  },
  approveContribution: (workspaceId, requestId, memberUid, fallbackBalance) => {
    let approved: Contribution | null = null
    set((state) => {
      const request = state.kattahRequests.find((item) => item.workspaceId === workspaceId && item.id === requestId)
      const contribution = request?.contributions.find((item) => item.uid === memberUid && item.status === 'awaiting')
      if (!request || !contribution) return state
      approved = { ...contribution, status: 'paid' }
      const approvedContribution = approved
      return {
        kattahRequests: state.kattahRequests.map((item) => item.workspaceId === workspaceId && item.id === requestId
          ? { ...item, contributions: item.contributions.map((itemContribution) => itemContribution.uid === memberUid ? approvedContribution : itemContribution) }
          : item),
        fundBalances: {
          ...state.fundBalances,
          [request.workspaceId]: (state.fundBalances[request.workspaceId] ?? fallbackBalance) + contribution.amount,
        },
      }
    })
    return approved
  },
  rejectContribution: (workspaceId, requestId, memberUid) => {
    let updated = false
    set((state) => ({
      kattahRequests: state.kattahRequests.map((request) => request.workspaceId === workspaceId && request.id === requestId
        ? {
          ...request,
          contributions: request.contributions.map((contribution) => {
            if (contribution.uid !== memberUid || contribution.status !== 'awaiting') return contribution
            updated = true
            return { ...contribution, status: 'rejected', confirmedAt: null }
          }),
        }
        : request),
    }))
    return updated
  },
  approveAwaitingContributions: (workspaceId, requestId, fallbackBalance) => {
    let approved: Contribution[] = []
    set((state) => {
      const request = state.kattahRequests.find((item) => item.workspaceId === workspaceId && item.id === requestId)
      if (!request) return state
      approved = request.contributions.filter((contribution) => contribution.status === 'awaiting')
      if (!approved.length) return state
      const total = approved.reduce((sum, contribution) => sum + contribution.amount, 0)
      return {
        kattahRequests: state.kattahRequests.map((item) => item.workspaceId === workspaceId && item.id === requestId
          ? { ...item, contributions: item.contributions.map((contribution) => contribution.status === 'awaiting' ? { ...contribution, status: 'paid' } : contribution) }
          : item),
        fundBalances: {
          ...state.fundBalances,
          [request.workspaceId]: (state.fundBalances[request.workspaceId] ?? fallbackBalance) + total,
        },
      }
    })
    return approved
  },
  adjustFundBalance: (workspaceId, amount, fallbackBalance) => set((state) => ({
    fundBalances: {
      ...state.fundBalances,
      [workspaceId]: (state.fundBalances[workspaceId] ?? fallbackBalance) + amount,
    },
  })),
}))

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const isGatheringParticipant = (value: unknown): value is GatheringParticipant =>
  isRecord(value)
  && typeof value.name === 'string'
  && (value.uid === undefined || typeof value.uid === 'string')
  && ['joined', 'declined', 'pending'].includes(String(value.decision))

const isGatheringExpense = (value: unknown): value is GatheringExpense =>
  isRecord(value)
  && typeof value.id === 'number'
  && typeof value.description === 'string'
  && typeof value.payer === 'string'
  && typeof value.amount === 'number'

const isGatheringTask = (value: unknown): value is GatheringTask =>
  isRecord(value)
  && typeof value.id === 'number'
  && typeof value.title === 'string'
  && (value.assignedTo === undefined || typeof value.assignedTo === 'string')

const decodeGathering = (id: string, value: DocumentData, workspaceId: string): Gathering => {
  const participantDecisionsByUid = value.participantDecisionsByUid ?? {}
  const expensesByUid = value.expensesByUid ?? {}
  const taskClaimsByUid = value.taskClaimsByUid ?? {}
  if (
    typeof value.createdById !== 'string'
    || typeof value.createdByName !== 'string'
    || typeof value.title !== 'string'
    || typeof value.date !== 'string'
    || typeof value.eventAt !== 'number'
    || typeof value.deadlineAt !== 'number'
    || typeof value.location !== 'string'
    || typeof value.attendees !== 'number'
    || typeof value.total !== 'number'
    || typeof value.badge !== 'string'
    || typeof value.badgeColor !== 'string'
    || typeof value.icon !== 'string'
    || !Array.isArray(value.participants)
    || !value.participants.every(isGatheringParticipant)
    || !Array.isArray(value.expenses)
    || !value.expenses.every(isGatheringExpense)
    || !Array.isArray(value.tasks)
    || !value.tasks.every(isGatheringTask)
    || !isRecord(participantDecisionsByUid)
    || !Object.values(participantDecisionsByUid).every((decision) => decision === 'joined' || decision === 'declined')
    || !isRecord(expensesByUid)
    || !Object.values(expensesByUid).every((expenses) => Array.isArray(expenses) && expenses.every(isGatheringExpense))
    || !isRecord(taskClaimsByUid)
    || !Object.values(taskClaimsByUid).every((taskIds) => Array.isArray(taskIds) && taskIds.every((taskId) => typeof taskId === 'number'))
    || (value.estimatedCost !== undefined && typeof value.estimatedCost !== 'number')
  ) throw new Error(`بيانات الجمعة ${id} غير صالحة.`)

  const participants = (value.participants as GatheringParticipant[]).map((participant) => ({
    ...participant,
    ...(participant.uid && participantDecisionsByUid[participant.uid]
      ? { decision: participantDecisionsByUid[participant.uid] as Exclude<GatheringDecision, 'pending'> }
      : {}),
  }))
  const expenses = [
    ...(value.expenses as GatheringExpense[]),
    ...Object.values(expensesByUid as Record<string, GatheringExpense[]>).flat(),
  ]
  const participantNamesByUid = new Map(participants.flatMap((participant) =>
    participant.uid ? [[participant.uid, participant.name] as const] : []))
  const tasks = (value.tasks as GatheringTask[]).map((task) => {
    const claimantUid = Object.entries(taskClaimsByUid as Record<string, number[]>)
      .find(([, taskIds]) => taskIds.includes(task.id))?.[0]
    return claimantUid
      ? { ...task, assignedTo: participantNamesByUid.get(claimantUid) ?? 'عضو' }
      : task
  })

  return {
    id,
    workspaceId,
    createdById: value.createdById,
    createdByName: value.createdByName,
    title: value.title,
    date: value.date,
    eventAt: value.eventAt,
    deadlineAt: value.deadlineAt,
    location: value.location,
    attendees: participants.filter((participant) => participant.decision === 'joined').length,
    total: value.total,
    badge: value.badge,
    badgeColor: value.badgeColor,
    icon: value.icon,
    participants,
    expenses,
    tasks,
    participantDecisionsByUid: participantDecisionsByUid as Record<string, Exclude<GatheringDecision, 'pending'>>,
    expensesByUid: expensesByUid as Record<string, GatheringExpense[]>,
    taskClaimsByUid: taskClaimsByUid as Record<string, number[]>,
    ...(typeof value.estimatedCost === 'number' ? { estimatedCost: value.estimatedCost } : {}),
  }
}

const useGatheringStore = create<GatheringStore>((set) => ({
  gatherings: [],
  syncError: '',
  replaceCloudGatherings: (cloudGatherings) => set({ gatherings: cloudGatherings, syncError: '' }),
  setSyncError: (message) => set({ syncError: message }),
  updateGatherings: (_groupId, updater) => {
    set((state) => ({ gatherings: updater(state.gatherings) }))
  },
}))

type NavigationState = {
  activeView: View
  selectedWorkspaceId: string | null
  setRoute: (route: Pick<NavigationState, 'activeView' | 'selectedWorkspaceId'>) => void
}

const routeFromPath = (pathname: string): Pick<NavigationState, 'activeView' | 'selectedWorkspaceId'> => {
  const workspaceMatch = pathname.match(/^\/workspaces\/([^/]+)\/?$/)
  if (workspaceMatch) return { activeView: 'workspace', selectedWorkspaceId: workspaceMatch[1] }
  if (pathname === '/workspaces' || pathname === '/workspaces/') return { activeView: 'funds', selectedWorkspaceId: null }
  if (pathname === '/gatherings') return { activeView: 'gatherings', selectedWorkspaceId: null }
  if (pathname === '/split') return { activeView: 'split', selectedWorkspaceId: null }
  if (pathname === '/activity') return { activeView: 'activity', selectedWorkspaceId: null }
  return { activeView: 'overview', selectedWorkspaceId: null }
}

const useNavigationStore = create<NavigationState>((set) => ({
  ...routeFromPath(window.location.pathname),
  setRoute: (route) => set(route),
}))

const formatNumber = (value: number | string) => {
  const number = typeof value === 'string' ? Number.parseFloat(value) : value
  if (Number.isNaN(number)) return '0'
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(number)
}

const money = (value: number) => formatNumber(value)

type DueUrgency = 'soon' | 'due' | 'overdue'

function dueDaysRemaining(due: string, cadence: string, now = new Date()): number | null {
  const monthlyDay = cadence === 'شهري'
    ? Number(due.match(/^(?:monthly:|يوم\s*)?(\d{1,2})(?:\s|$)/i)?.[1])
    : Number.NaN
  let dueDate: Date
  if (Number.isInteger(monthlyDay) && monthlyDay >= 1 && monthlyDay <= 31) {
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    dueDate = new Date(now.getFullYear(), now.getMonth(), Math.min(monthlyDay, lastDay))
  } else {
    const isoDate = due.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (isoDate) dueDate = new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]))
    else {
      const parsed = new Date(due)
      if (Number.isNaN(parsed.getTime())) return null
      dueDate = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
    }
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((dueDate.getTime() - today.getTime()) / 86_400_000)
}

function dueUrgency(due: string, cadence: string, now?: Date): DueUrgency | null {
  const days = dueDaysRemaining(due, cadence, now)
  if (days === null || days > 3) return null
  return days < 0 ? 'overdue' : days === 0 ? 'due' : 'soon'
}

function dueLabel(due: string, cadence: string): string {
  const monthlyDay = cadence === 'شهري' ? Number(due.match(/^(?:monthly:|يوم\s*)?(\d{1,2})(?:\s|$)/i)?.[1]) : Number.NaN
  if (Number.isInteger(monthlyDay) && monthlyDay >= 1 && monthlyDay <= 31) return `يوم ${formatNumber(monthlyDay)} من كل شهر`
  const isoDate = due.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!isoDate) return due
  return new Intl.DateTimeFormat('ar-SA', { calendar: 'gregory', day: 'numeric', month: 'long', year: 'numeric', numberingSystem: 'latn' })
    .format(new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3])))
}

function DueBadge({ due, cadence, now }: { due: string; cadence: string; now?: Date }) {
  const urgency = dueUrgency(due, cadence, now)
  if (!urgency) return null
  const days = dueDaysRemaining(due, cadence, now)
  const label = urgency === 'overdue' ? 'متأخر' : urgency === 'due' ? 'مستحق اليوم' : `يستحق خلال ${formatNumber(days ?? 0)} أيام`
  return <span className={`due-badge due-${urgency}`}><i />{label}</span>
}

type DeadlinePreset = '30m' | '1h' | '2h' | 'before24h' | 'before6h' | 'before1h' | 'previousEvening'
type DeadlineOption = { id: DeadlinePreset; labelAr: string; labelEn: string; at: number }

const eventTimeFor = (dayOffset: number, time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  const eventDate = new Date()
  eventDate.setDate(eventDate.getDate() + dayOffset)
  eventDate.setHours(hours, minutes, 0, 0)
  return eventDate.getTime()
}

const deadlineOptionsFor = (dayOffset: number, eventAt: number): DeadlineOption[] => {
  const now = Date.now()
  const options: DeadlineOption[] = dayOffset === 0
    ? [
      { id: '30m', labelAr: 'بعد 30 دقيقة', labelEn: 'In 30 minutes', at: now + 30 * 60 * 1000 },
      { id: '1h', labelAr: 'بعد ساعة', labelEn: 'In 1 hour', at: now + 60 * 60 * 1000 },
      { id: '2h', labelAr: 'بعد ساعتين', labelEn: 'In 2 hours', at: now + 2 * 60 * 60 * 1000 },
      { id: 'before1h', labelAr: 'قبل الموعد بساعة', labelEn: '1 hour before', at: eventAt - 60 * 60 * 1000 },
    ]
    : [
      { id: 'previousEvening', labelAr: 'مساء اليوم السابق', labelEn: 'Previous evening', at: (() => {
        const evening = new Date(eventAt)
        evening.setDate(evening.getDate() - 1)
        evening.setHours(20, 0, 0, 0)
        return evening.getTime()
      })() },
      { id: 'before24h', labelAr: 'قبل الموعد بـ 24 ساعة', labelEn: '24 hours before', at: eventAt - 24 * 60 * 60 * 1000 },
      { id: 'before6h', labelAr: 'قبل الموعد بـ 6 ساعات', labelEn: '6 hours before', at: eventAt - 6 * 60 * 60 * 1000 },
      { id: 'before1h', labelAr: 'قبل الموعد بساعة', labelEn: '1 hour before', at: eventAt - 60 * 60 * 1000 },
    ]
  return options.filter((option) => option.at > now && option.at < eventAt)
}

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(auth !== null)
  const [userGroups, setUserGroups] = useState<UserGroup[]>([])
  const [groupsLoading, setGroupsLoading] = useState(auth !== null)
  const [groupModalOpen, setGroupModalOpen] = useState(() => Boolean(new URLSearchParams(window.location.search).get('invite')))
  const [joinCode, setJoinCode] = useState(() => new URLSearchParams(window.location.search).get('invite')?.toUpperCase() ?? '')
  const [createdInviteCode, setCreatedInviteCode] = useState('')
  const [groupActionError, setGroupActionError] = useState('')
  const [showAuthModal, setShowAuthModal] = useState(false)
  const activeView = useNavigationStore((state) => state.activeView)
  const selectedWorkspaceId = useNavigationStore((state) => state.selectedWorkspaceId)
  const setRoute = useNavigationStore((state) => state.setRoute)
  const [menuOpen, setMenuOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [amount, setAmount] = useState('240')
  const [people, setPeople] = useState(['أنت', 'سارة', 'خالد', 'نورة'])
  const [customShares, setCustomShares] = useState(false)
  const [shares, setShares] = useState(['60', '60', '60', '60'])
  const [splitSaved, setSplitSaved] = useState(false)
  const [createKind, setCreateKind] = useState<CreateKind | null>(null)
  const [newGroupType, setNewGroupType] = useState<'event' | 'ongoing'>('ongoing')
  const gatheringItems = useGatheringStore((state) => state.gatherings)
  const setGatheringItems = useGatheringStore((state) => state.updateGatherings)
  const replaceCloudGatherings = useGatheringStore((state) => state.replaceCloudGatherings)
  const setGatheringSyncError = useGatheringStore((state) => state.setSyncError)
  const gatheringSyncError = useGatheringStore((state) => state.syncError)
  const [createName, setCreateName] = useState('')
  const [gatheringLocation, setGatheringLocation] = useState('')
  const [gatheringDayOffset, setGatheringDayOffset] = useState(1)
  const [gatheringTime, setGatheringTime] = useState('19:30')
  const [gatheringDeadline, setGatheringDeadline] = useState<DeadlinePreset>('before24h')
  const [gatheringEstimate, setGatheringEstimate] = useState('')
  const [gatheringFormError, setGatheringFormError] = useState('')
  const [gatheringsLanguage, setGatheringsLanguage] = useState<GatheringLanguage>('ar')
  const [createdMessage, setCreatedMessage] = useState('')
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false)
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false)
  const [profileDisplayName, setProfileDisplayName] = useState('')
  const [profilePhotoURL, setProfilePhotoURL] = useState('')
  const currentUserId = currentUser?.uid ?? ''
  const currentUserName = profileDisplayName.trim() || currentUser?.displayName?.trim() || currentUser?.email || 'عضو'
  const fundBalances = useFundPaymentStore((state) => state.fundBalances)
  const kattahRequests = useFundPaymentStore((state) => state.kattahRequests)
  const addKattahRequest = useFundPaymentStore((state) => state.addKattahRequest)
  const confirmContributionInStore = useFundPaymentStore((state) => state.confirmContribution)
  const approveContributionInStore = useFundPaymentStore((state) => state.approveContribution)
  const rejectContributionInStore = useFundPaymentStore((state) => state.rejectContribution)
  const approveAwaitingInStore = useFundPaymentStore((state) => state.approveAwaitingContributions)
  const adjustFundBalance = useFundPaymentStore((state) => state.adjustFundBalance)
  const replaceCloudRequests = useFundPaymentStore((state) => state.replaceCloudRequests)
  const replaceCloudBalances = useFundPaymentStore((state) => state.replaceCloudBalances)
  const [firestoreStatus, setFirestoreStatus] = useState<'local' | 'connecting' | 'connected' | 'error'>(hasFirebaseConfig ? 'connecting' : 'local')
  const [firestoreError, setFirestoreError] = useState('')
  const [obligations, setObligations] = useState<Obligation[]>([])
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([])
  const [fundHistory, setFundHistory] = useState<FundActivity[]>([])
  const allGroups: WorkspaceGroup[] = userGroups.map((group, index) => ({
    id: group.id,
    title: group.name,
    members: group.memberNames.length,
    memberNames: group.memberNames,
    balance: fundBalances[group.id] ?? group.balance,
    hasFund: group.hasFund,
    role: group.role,
    icon: '👥',
    color: ['mint', 'lavender', 'peach'][index % 3],
    due: 'لا توجد التزامات قادمة',
  }))
  const allFunds = allGroups.filter((group) => group.hasFund)
  const allGatherings = gatheringItems

  const total = Number(amount) || 0
  const evenShare = people.length ? total / people.length : 0
  const selectedWorkspace = allFunds.find((fund) => fund.id === selectedWorkspaceId)
  const canManageGroup = (workspaceId: string) => {
    const role = userGroups.find((group) => group.id === workspaceId)?.role
    return role === 'owner' || role === 'admin'
  }
  const pageTitle = activeView === 'workspace'
    ? selectedWorkspace?.title ?? 'الصندوق'
    : navigation.find((item) => item.id === activeView)?.label ?? 'الصفحة الرئيسية'
  const selectedGroup = userGroups.find((group) => group.id === selectedWorkspaceId)

  useEffect(() => {
    if (!auth) return

    return onAuthStateChanged(
      auth,
      (user) => {
        setCurrentUser(user)
        setProfileDisplayName(user?.displayName ?? '')
        setProfilePhotoURL(user?.photoURL ?? '')
        setAuthLoading(false)
      },
      (error) => {
        console.error('Firebase authentication state listener failed:', error)
        setAuthLoading(false)
      },
    )
  }, [])

  useEffect(() => {
    if (authLoading) return
    let cancelled = false

    if (!currentUser) {
      setUserGroups([])
      setGroupsLoading(false)
      replaceCloudRequests([])
      replaceCloudBalances({})
      replaceCloudGatherings([])
      return
    }

    setUserGroups([])
    replaceCloudRequests([])
    replaceCloudBalances({})
    replaceCloudGatherings([])
    setGroupsLoading(true)
    void getUserGroups(currentUser.uid).then((groups) => {
      if (cancelled) return
      setUserGroups(groups)
      const route = useNavigationStore.getState()
      const selectedGroupExists = groups.some((group) => group.id === route.selectedWorkspaceId)
      const selectedGroupId = selectedGroupExists ? route.selectedWorkspaceId : groups[0]?.id ?? null
      const selectedGroup = groups.find((group) => group.id === selectedGroupId)
      if (route.activeView === 'workspace' && selectedGroup?.hasFund === false) {
        setRoute({ activeView: 'gatherings', selectedWorkspaceId: selectedGroupId })
        navigate('/gatherings')
      } else if (selectedGroupId !== route.selectedWorkspaceId) {
        setRoute({ activeView: route.activeView, selectedWorkspaceId: selectedGroupId })
        if (route.activeView === 'workspace' && selectedGroupId) {
          navigate(`/workspaces/${encodeURIComponent(selectedGroupId)}`)
        }
      }
      setFirestoreError('')
    }).catch((error: unknown) => {
      if (cancelled) return
      console.error('Firebase group loading failed:', error)
      setFirestoreStatus('error')
      setFirestoreError(error instanceof Error ? error.message : String(error))
    }).finally(() => {
      if (!cancelled) setGroupsLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [authLoading, currentUser, navigate, replaceCloudBalances, replaceCloudGatherings, replaceCloudRequests, setRoute])

  useEffect(() => {
    const route = routeFromPath(location.pathname)
    setRoute({
      ...route,
      selectedWorkspaceId: route.selectedWorkspaceId ?? useNavigationStore.getState().selectedWorkspaceId,
    })
  }, [location.pathname, setRoute])

  useEffect(() => {
    replaceCloudRequests([])
    replaceCloudBalances({})
    replaceCloudGatherings([])
    setObligations([])
    setReimbursements([])
    setFundHistory([])
    setGatheringSyncError('')
    setFirestoreError('')
    const groupIds = userGroups.map((group) => group.id)
    const fundGroupIds = userGroups.filter((group) => group.hasFund).map((group) => group.id)
    if (!hasFirebaseConfig || !currentUser || groupIds.length === 0) {
      setFirestoreStatus('local')
      return
    }

    let hasSyncError = false
    let cancelled = false
    const unsubscribers: (() => void)[] = []
    const requestsByGroup = new Map<string, KattahRequest[]>()
    const balancesByGroup = new Map<string, Record<string, number>>()
    const gatheringsByGroup = new Map<string, Gathering[]>()
    const obligationsByGroup = new Map<string, Obligation[]>()
    const reimbursementsByGroup = new Map<string, Reimbursement[]>()
    const ready = {
      requests: new Set<string>(),
      balances: new Set<string>(),
      gatherings: new Set<string>(),
      obligations: new Set<string>(),
      reimbursements: new Set<string>(),
    }
    setFirestoreStatus('connecting')
    const markConnected = () => {
      const allGatheringsReady = groupIds.every((groupId) => ready.gatherings.has(groupId))
      const allFundsReady = ['requests', 'balances', 'obligations', 'reimbursements']
        .every((key) => fundGroupIds.every((groupId) => ready[key as keyof typeof ready].has(groupId)))
      const allReady = allGatheringsReady && allFundsReady
      if (!hasSyncError && allReady) {
        setFirestoreStatus('connected')
        setFirestoreError('')
      }
    }
    const handleSyncError = (kind: string, error: Error) => {
      hasSyncError = true
      console.error(`Firestore ${kind} sync failed:`, error)
      setFirestoreStatus('error')
      setFirestoreError(error.message)
    }
    void import('./fundPaymentSync').then((paymentSync) => {
      if (cancelled) return
      for (const group of userGroups) {
        const groupId = group.id
        unsubscribers.push(paymentSync.subscribeToGatherings(
          groupId,
          (id, value) => decodeGathering(id, value, groupId),
          (gatherings) => {
            gatheringsByGroup.set(groupId, gatherings)
            replaceCloudGatherings([...gatheringsByGroup.values()].flat())
            setGatheringSyncError('')
            ready.gatherings.add(groupId)
            markConnected()
          },
          (error) => {
            handleSyncError('gathering', error)
            setGatheringSyncError(error.message)
          },
        ))
        if (group.hasFund) {
          unsubscribers.push(paymentSync.subscribeToFundPayments(
            groupId,
            (requests) => {
              requestsByGroup.set(groupId, requests)
              replaceCloudRequests([...requestsByGroup.values()].flat())
              ready.requests.add(groupId)
              markConnected()
            },
            (balances) => {
              balancesByGroup.set(groupId, balances)
              replaceCloudBalances(Object.assign({}, ...balancesByGroup.values()))
              ready.balances.add(groupId)
              markConnected()
            },
            (error) => handleSyncError('fund-payment', error),
          ))
          unsubscribers.push(subscribeToFundOperations(
            groupId,
            (items) => {
              obligationsByGroup.set(groupId, items)
              setObligations([...obligationsByGroup.values()].flat())
              ready.obligations.add(groupId)
              markConnected()
            },
            (items) => {
              reimbursementsByGroup.set(groupId, items)
              setReimbursements([...reimbursementsByGroup.values()].flat())
              ready.reimbursements.add(groupId)
              markConnected()
            },
            (error) => handleSyncError('fund-operation', error),
          ))
        }
      }
    }).catch((error: unknown) => {
      console.error('Firestore fund-payment sync initialization failed:', error)
      setFirestoreStatus('error')
      setFirestoreError(error instanceof Error ? error.message : String(error))
    })
    return () => {
      cancelled = true
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    }
  }, [currentUser, userGroups, replaceCloudBalances, replaceCloudGatherings, replaceCloudRequests, setGatheringSyncError])

  const openView = (view: View) => {
    const path = view === 'overview' ? '/' : view === 'funds' || view === 'workspace' ? '/workspaces' : `/${view}`
    navigate(path)
    setRoute({ activeView: view, selectedWorkspaceId: useNavigationStore.getState().selectedWorkspaceId })
    setMenuOpen(false)
    setSidebarOpen(false)
    setSplitSaved(false)
  }

  const refreshUserGroups = async () => {
    if (!currentUser) return
    const groups = await getUserGroups(currentUser.uid)
    setUserGroups(groups)
    const route = useNavigationStore.getState()
    const selectedExists = groups.some((group) => group.id === route.selectedWorkspaceId)
    if (selectedExists) return
    const nextGroupId = groups[0]?.id ?? null
    const nextView = route.activeView === 'workspace' && !nextGroupId ? 'funds' : route.activeView
    setRoute({ activeView: nextView, selectedWorkspaceId: nextGroupId })
    if (route.activeView === 'workspace') {
      navigate(nextGroupId ? `/workspaces/${encodeURIComponent(nextGroupId)}` : '/workspaces')
    }
  }

  const openWorkspace = (workspaceId: string) => {
    if (userGroups.find((group) => group.id === workspaceId)?.hasFund === false) {
      navigate('/gatherings')
      setRoute({ activeView: 'gatherings', selectedWorkspaceId: workspaceId })
      setMenuOpen(false)
      setSidebarOpen(false)
      return
    }
    navigate(`/workspaces/${encodeURIComponent(workspaceId)}`)
    setRoute({ activeView: 'workspace', selectedWorkspaceId: workspaceId })
    setMenuOpen(false)
    setSidebarOpen(false)
    setSplitSaved(false)
  }

  const openGroupHome = (group: Pick<UserGroup, 'id' | 'hasFund'>) => {
    if (group.hasFund) {
      openWorkspace(group.id)
      return
    }
    navigate('/gatherings')
    setRoute({ activeView: 'gatherings', selectedWorkspaceId: group.id })
    setMenuOpen(false)
    setSidebarOpen(false)
    setSplitSaved(false)
  }

  const openGroupSection = (workspaceId: string, view: Exclude<View, 'overview' | 'workspace'>) => {
    if (view === 'funds') {
      const group = userGroups.find((item) => item.id === workspaceId)
      if (group) openGroupHome(group)
      return
    }
    navigate(`/${view}`)
    setRoute({ activeView: view, selectedWorkspaceId: workspaceId })
    setMenuOpen(false)
    setSidebarOpen(false)
    setSplitSaved(false)
  }

  const openGroupSettings = (workspaceId: string) => {
    const group = userGroups.find((item) => item.id === workspaceId)
    if (!group || !['owner', 'admin'].includes(group.role)) return
    setRoute({ activeView: 'overview', selectedWorkspaceId: workspaceId })
    setGroupSettingsOpen(true)
  }

  const handleLogin = async (email: string, password: string) => {
    if (!auth) throw new Error('إعداد Firebase غير متاح.')
    await signInWithEmailAndPassword(auth, email, password)
  }

  const handleRegister = async (email: string, password: string) => {
    if (!auth) throw new Error('إعداد Firebase غير متاح.')
    await createUserWithEmailAndPassword(auth, email, password)
  }

  const handleResetPassword = async (email: string) => {
    if (!auth) throw new Error('إعداد Firebase غير متاح.')
    await sendPasswordResetEmail(auth, email)
  }

  const submitGroupJoin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setGroupActionError('')
    if (!currentUser) {
      setShowAuthModal(true)
      return
    }

    try {
      const joinedGroup = await joinGroup(joinCode, currentUser)
      setUserGroups(await getUserGroups(currentUser.uid))
      setGroupModalOpen(false)
      setJoinCode('')
      setCreatedInviteCode('')
      openGroupHome(joinedGroup)
      setCreatedMessage(`انضممت إلى مجموعة «${joinedGroup.name}».`)
    } catch (error) {
      console.error('Joining a Firebase group failed:', error)
      setGroupActionError(error instanceof Error ? error.message : String(error))
    }
  }

  const copyInviteCode = async () => {
    try {
      await navigator.clipboard.writeText(createdInviteCode)
      setCreatedMessage('تم نسخ رمز الدعوة.')
    } catch (error) {
      console.error('Copying the group invite code failed:', error)
      setGroupActionError('تعذر نسخ الرمز. يمكنك تحديده ونسخه يدويًا.')
    }
  }

  const startCreate = (kind: CreateKind) => {
    if (!currentUser) {
      setShowAuthModal(true)
      return
    }
    if (kind === 'fund') setNewGroupType('ongoing')
    if (kind === 'gathering' && !selectedWorkspaceId) {
      setCreatedMessage('أنشئ مجموعة أو انضم إلى واحدة قبل إضافة جمعة.')
      return
    }
    setCreateKind(kind)
    setCreateName('')
    setGatheringLocation('')
    setGatheringDayOffset(1)
    setGatheringTime('19:30')
    setGatheringDeadline('before24h')
    setGatheringEstimate('')
    setGatheringFormError('')
    setCreatedMessage('')
    setMenuOpen(false)
  }

  const createGathering = async (groupId: string, gathering: Gathering): Promise<void> => {
    if (!hasFirebaseConfig) {
      setGatheringItems(groupId, (current) => [gathering, ...current])
      return
    }
    const { createSyncedGathering } = await import('./fundPaymentSync')
    await createSyncedGathering(groupId, gathering)
    setGatheringSyncError('')
  }

  const mutateGathering = (groupId: string, gatheringId: string, update: (gathering: Gathering) => Gathering | null) => {
    if (!groupId) return
    if (!hasFirebaseConfig) {
      setGatheringItems(groupId, (current) => current.flatMap((gathering) => {
        if (gathering.id !== gatheringId) return [gathering]
        const next = update(gathering)
        return next ? [decodeGathering(next.id, { ...next }, groupId)] : []
      }))
      return
    }
    void import('./fundPaymentSync').then(({ mutateSyncedGathering }) =>
      mutateSyncedGathering(groupId, gatheringId, (id, value) => decodeGathering(id, value, groupId), update))
      .then(() => setGatheringSyncError(''))
      .catch((error: unknown) => {
        console.error('Updating a Firestore gathering failed:', error)
        const message = error instanceof Error ? error.message : String(error)
        setGatheringSyncError(message)
        showFundMessage(`تعذر تحديث الجمعة: ${message}`)
      })
  }

  const saveNewItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = createName.trim()
    if (!createKind) return
    if (!name) {
      if (createKind === 'gathering') setGatheringFormError(gatheringsLanguage === 'ar' ? 'اكتب عنوانًا للجمعة.' : 'Enter a gathering title.')
      return
    }

    if (createKind === 'fund') {
      if (!currentUser) {
        setCreateKind(null)
        setShowAuthModal(true)
        return
      }
      try {
        const newGroup = await createGroup(name, currentUser, undefined, { hasFund: newGroupType === 'ongoing' })
        setUserGroups((groups) => [...groups, newGroup])
        setCreateKind(null)
        openGroupHome(newGroup)
        setGroupActionError('')
        setCreatedInviteCode(newGroup.inviteCode)
        setGroupModalOpen(true)
        setCreatedMessage(`تم إنشاء المجموعة «${name}».`)
      } catch (error) {
        console.error('Creating a Firebase group failed:', error)
        setFirestoreError(error instanceof Error ? error.message : String(error))
        setFirestoreStatus('error')
      }
      return
    } else {
      if (!currentUser || !selectedWorkspaceId) {
        setGatheringFormError('سجّل الدخول واختر مجموعة قبل إنشاء جمعة.')
        return
      }
      const eventAt = eventTimeFor(gatheringDayOffset, gatheringTime)
      const options = deadlineOptionsFor(gatheringDayOffset, eventAt)
      const selectedDeadline = options.find((option) => option.id === gatheringDeadline) ?? options[0]
      if (eventAt <= Date.now() || !selectedDeadline) {
        setGatheringFormError(gatheringsLanguage === 'ar' ? 'اختر وقتًا مستقبليًا وموعد إغلاق يسبقه.' : 'Choose a future time and an RSVP deadline before it.')
        return
      }
      const group = userGroups.find((item) => item.id === selectedWorkspaceId)
      const participants: GatheringParticipant[] = (group?.members ?? []).map((member) => ({
        uid: member.uid,
        name: member.displayName,
        decision: member.uid === currentUser.uid ? 'joined' : 'pending',
      }))
      try {
        await createGathering(selectedWorkspaceId, {
          id: `gathering-${Date.now()}`,
          workspaceId: selectedWorkspaceId,
          createdById: currentUser.uid,
          createdByName: currentUserName,
          title: name,
          date: new Intl.DateTimeFormat('ar-SA', { weekday: 'long', day: 'numeric', month: 'long', numberingSystem: 'latn' }).format(eventAt),
          eventAt,
          deadlineAt: selectedDeadline.at,
          location: gatheringLocation.trim() || 'لم يُحدّد الموقع بعد',
          attendees: 1,
          total: participants.length,
          badge: 'التصويت مفتوح',
          badgeColor: 'green',
          icon: '🎉',
          participants,
          expenses: [],
          tasks: [],
          participantDecisionsByUid: {},
          expensesByUid: {},
          taskClaimsByUid: {},
          estimatedCost: Number(gatheringEstimate) || undefined,
        })
      } catch (error) {
        console.error('Creating a Firestore gathering failed:', error)
        const message = error instanceof Error ? error.message : String(error)
        setGatheringSyncError(message)
        setGatheringFormError(`تعذر إنشاء الجمعة: ${message}`)
        return
      }
    }

    setCreateKind(null)
    setCreatedMessage(createKind === 'gathering' && gatheringsLanguage === 'en'
      ? `Gathering "${name}" was added to your workspace.`
      : `تمت إضافة الجمعة «${name}» إلى المجموعة.`)
    window.setTimeout(() => setCreatedMessage(''), 3500)
  }

  const voteOnGathering = (workspaceId: string, gatheringId: string, decision: Exclude<GatheringDecision, 'pending'>) => {
    const gathering = gatheringItems.find((item) => item.workspaceId === workspaceId && item.id === gatheringId)
    if (!currentUser || !gathering || gathering.createdById === currentUserId || gathering.deadlineAt <= Date.now()) return
    mutateGathering(workspaceId, gatheringId, (item) => {
      if (item.createdById === currentUserId || item.deadlineAt <= Date.now()) return item
      return {
        ...item,
        participantDecisionsByUid: {
          ...item.participantDecisionsByUid,
          [currentUserId]: decision,
        },
      }
    })
  }

  const cancelGathering = (gatheringId: string) => {
    const gathering = gatheringItems.find((item) => item.workspaceId === selectedWorkspaceId && item.id === gatheringId)
    if (!currentUser || !gathering || gathering.createdById !== currentUserId) return
    mutateGathering(selectedWorkspaceId ?? '', gatheringId, () => null)
  }

  const addLateGatheringParticipant = (gatheringId: string, name: string) => {
    const normalizedName = name.trim()
    if (!normalizedName) return
    mutateGathering(selectedWorkspaceId ?? '', gatheringId, (item) => {
      if (item.participants.some((person) => person.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) return item
      const participants = [...item.participants.map((person) => ({ ...person, settlementStatus: undefined })), { name: normalizedName, decision: 'joined' as const, late: true }]
      return { ...item, participants, attendees: participants.filter((person) => person.decision === 'joined').length, total: participants.length }
    })
  }

  const addGatheringExpense = (gatheringId: string, description: string, payer: string, amount: number) => {
    if (!currentUser || !description.trim() || !payer || !Number.isFinite(amount) || amount <= 0) return
    mutateGathering(selectedWorkspaceId ?? '', gatheringId, (item) => ({
      ...item,
      expensesByUid: {
        ...item.expensesByUid,
        [currentUser.uid]: [
          ...(item.expensesByUid?.[currentUser.uid] ?? []),
          {
            id: Math.max(Date.now(), ...(item.expensesByUid?.[currentUser.uid] ?? []).map((expense) => expense.id + 1)),
            description: description.trim(),
            payer,
            amount,
          },
        ],
      },
    }))
  }

  const addGatheringTask = (gatheringId: string, title: string) => {
    const gathering = gatheringItems.find((item) => item.workspaceId === selectedWorkspaceId && item.id === gatheringId)
    const normalizedTitle = title.trim()
    if (!currentUser || !gathering || gathering.createdById !== currentUserId || !normalizedTitle) return
    mutateGathering(selectedWorkspaceId ?? '', gatheringId, (item) => {
      if (item.createdById !== currentUserId) return item
      return { ...item, tasks: [...item.tasks, { id: Math.max(Date.now(), ...item.tasks.map((task) => task.id + 1)), title: normalizedTitle }] }
    })
  }

  const claimGatheringTask = (gatheringId: string, taskId: number) => {
    const gathering = gatheringItems.find((item) => item.workspaceId === selectedWorkspaceId && item.id === gatheringId)
    const currentParticipant = gathering?.participants.find((person) => person.uid === currentUserId)
    if (!gathering || currentParticipant?.decision !== 'joined') return
    mutateGathering(selectedWorkspaceId ?? '', gatheringId, (item) => {
      if (item.participants.find((person) => person.uid === currentUserId)?.decision !== 'joined') return item
      if (item.tasks.find((task) => task.id === taskId)?.assignedTo) return item
      return {
        ...item,
        taskClaimsByUid: {
          ...item.taskClaimsByUid,
          [currentUserId]: [...(item.taskClaimsByUid?.[currentUserId] ?? []), taskId],
        },
      }
    })
  }

  const copySettlementDetails = async (gathering: Gathering, memberName: string, amountDue: number) => {
    const participant = gathering.participants.find((person) => person.name === memberName)
    const isCurrentMember = participant?.uid === currentUserId
    try {
      const profile = isCurrentMember && currentUser ? await getUserProfile(currentUser) : null
      const method = profile?.paymentMethod ?? participant?.paymentMethod
      const details = profile?.paymentDetails.trim() ?? participant?.paymentDetails?.trim() ?? ''
      const methodLabel = method ? paymentMethodLabel(method) : 'غير محددة'
      const text = `المستحق: ${memberName}\nالمبلغ: ${money(amountDue)} ر.س\nوسيلة التحويل: ${methodLabel}\nبيانات التحويل: ${details || 'غير متاحة'}`
      await navigator.clipboard.writeText(text)
      showFundMessage(details
        ? `تم نسخ بيانات تحويل ${memberName}.`
        : `نُسخ اسم ${memberName} والمبلغ؛ لم تُسجل بيانات التحويل لهذا العضو.`)
    } catch (error) {
      console.error('Loading or copying settlement details failed:', error)
      showFundMessage(error instanceof Error ? `تعذر نسخ بيانات التسوية: ${error.message}` : 'تعذر النسخ. تحقق من صلاحية الحافظة في المتصفح.')
    }
  }

  const setGatheringSettlementStatus = (gatheringId: string, memberName: string, status: 'pending' | 'paid') => {
    const gathering = gatheringItems.find((item) => item.workspaceId === selectedWorkspaceId && item.id === gatheringId)
    if (!currentUser || !gathering || gathering.createdById !== currentUserId) return
    const row = getSettlementRows(gathering).find((item) => item.name === memberName)
    if (!row || row.balance >= 0) return
    mutateGathering(selectedWorkspaceId ?? '', gatheringId, (item) => {
      const latestRow = getSettlementRows(item).find((settlement) => settlement.name === memberName)
      if (!latestRow || latestRow.balance >= 0) return item
      return {
        ...item,
        participants: item.participants.map((person) => person.name === memberName
          ? { ...person, settlementStatus: status }
          : person),
      }
    })
  }

  const showFundMessage = (message: string) => {
    setCreatedMessage(message)
    window.setTimeout(() => setCreatedMessage(''), 3500)
  }

  const addFundActivity = (workspaceId: string, title: string, detail: string, amount: string, kind: FundActivity['kind'] = 'event') => {
    setFundHistory((current) => [{ id: Date.now(), workspaceId, title, detail, amount, kind, time: 'الآن' }, ...current])
  }

  const confirmContribution = (workspaceId: string, requestId: number, memberUid: string) => {
    const request = useFundPaymentStore.getState().kattahRequests.find((item) => item.workspaceId === workspaceId && item.id === requestId)
    const contribution = request?.contributions.find((item) => item.uid === memberUid)
    if (!request || !contribution) return
    const memberName = contribution.name
    if (hasFirebaseConfig) {
      void import('./fundPaymentSync').then(({ confirmSyncedContribution }) => confirmSyncedContribution(request.workspaceId, requestId, memberUid)).then((confirmed) => {
        if (!confirmed) return
        if (request) addFundActivity(request.workspaceId, 'إشعار دفع بانتظار اعتماد المشرف', `${request.title} · ${memberName}`, `${money(contribution?.amount ?? 0)} ر.س`, 'pending')
        showFundMessage('تم تسجيل الدفع بانتظار المراجعة. لن يُضاف المبلغ للرصيد حتى اعتماده.')
      }).catch((error: unknown) => {
        console.error('Firestore contribution confirmation failed:', error)
        showFundMessage(`تعذر تسجيل تأكيد الدفع في Firestore: ${error instanceof Error ? error.message : String(error)}`)
      })
      return
    }
    if (!confirmContributionInStore(workspaceId, requestId, memberUid)) return
    if (request) addFundActivity(request.workspaceId, 'إشعار دفع بانتظار اعتماد المشرف', `${request.title} · ${memberName}`, `${money(contribution?.amount ?? 0)} ر.س`, 'pending')
    showFundMessage('تم تسجيل الدفع بانتظار المراجعة. لن يُضاف المبلغ للرصيد حتى اعتماده.')
  }

  const approveContribution = (workspaceId: string, requestId: number, memberUid: string) => {
    if (!canManageGroup(workspaceId)) return
    const request = useFundPaymentStore.getState().kattahRequests.find((item) => item.workspaceId === workspaceId && item.id === requestId)
    const contribution = request?.contributions.find((item) => item.uid === memberUid)
    if (!request || !contribution || contribution.status !== 'awaiting') return
    const memberName = contribution.name
    const workspace = allFunds.find((fund) => fund.id === request.workspaceId)
    if (hasFirebaseConfig) {
      void import('./fundPaymentSync').then(({ decideSyncedContribution }) => decideSyncedContribution(request.workspaceId, requestId, memberUid, 'paid', workspace?.balance ?? 0)).then((amount) => {
        if (amount === null) return
        addFundActivity(request.workspaceId, 'اعتماد مساهمة عضو', `${request.title} · ${memberName}`, `+ ${money(amount)} ر.س`, 'success')
        showFundMessage(`تم استلام دفعة ${memberName} واعتمادها وإضافتها إلى رصيد الصندوق.`)
      }).catch((error: unknown) => {
        console.error('Firestore contribution approval failed:', error)
        showFundMessage(`تعذر اعتماد الدفعة في Firestore: ${error instanceof Error ? error.message : String(error)}`)
      })
      return
    }
    const approved = approveContributionInStore(workspaceId, requestId, memberUid, workspace?.balance ?? 0)
    if (!approved) return
    addFundActivity(request.workspaceId, 'اعتماد مساهمة عضو', `${request.title} · ${memberName}`, `+ ${money(contribution.amount)} ر.س`, 'success')
    showFundMessage(`تم استلام دفعة ${memberName} واعتمادها وإضافتها إلى رصيد الصندوق.`)
  }

  const rejectContribution = (workspaceId: string, requestId: number, memberUid: string) => {
    if (!canManageGroup(workspaceId)) return
    const request = useFundPaymentStore.getState().kattahRequests.find((item) => item.workspaceId === workspaceId && item.id === requestId)
    const contribution = request?.contributions.find((item) => item.uid === memberUid)
    if (!request || !contribution) return
    const memberName = contribution.name
    if (hasFirebaseConfig) {
      void import('./fundPaymentSync').then(({ decideSyncedContribution }) => decideSyncedContribution(request.workspaceId, requestId, memberUid, 'rejected', 0)).then((result) => {
        if (result === null) return
        if (request) addFundActivity(request.workspaceId, 'رفض إشعار الدفع', `${request.title} · ${memberName}`, `${money(contribution?.amount ?? 0)} ر.س`, 'pending')
        showFundMessage(`تم تسجيل أن حوالة ${memberName} لم تصل. يمكنه تأكيد الدفع مجددًا بعد التحويل.`)
      }).catch((error: unknown) => {
        console.error('Firestore contribution rejection failed:', error)
        showFundMessage(`تعذر رفض الدفعة في Firestore: ${error instanceof Error ? error.message : String(error)}`)
      })
      return
    }
    if (!rejectContributionInStore(workspaceId, requestId, memberUid)) return
    if (request) addFundActivity(request.workspaceId, 'رفض إشعار الدفع', `${request.title} · ${memberName}`, `${money(contribution?.amount ?? 0)} ر.س`, 'pending')
    showFundMessage(`تم تسجيل أن حوالة ${memberName} لم تصل. يمكنه تأكيد الدفع مجددًا بعد التحويل.`)
  }

  const approveAllContributions = (workspaceId: string, requestId: number) => {
    if (!canManageGroup(workspaceId)) return
    const request = useFundPaymentStore.getState().kattahRequests.find((item) => item.workspaceId === workspaceId && item.id === requestId)
    if (!request) return
    const workspace = allFunds.find((fund) => fund.id === request.workspaceId)
    if (hasFirebaseConfig) {
      void import('./fundPaymentSync').then(({ approveAllSyncedContributions }) => approveAllSyncedContributions(request.workspaceId, requestId, workspace?.balance ?? 0)).then((result) => {
        if (!result.count) return
        addFundActivity(request.workspaceId, 'اعتماد جماعي للمساهمات', `${request.title} · ${formatNumber(result.count)} أعضاء`, `+ ${money(result.total)} ر.س`, 'success')
        showFundMessage(`تم استلام واعتماد ${formatNumber(result.count)} دفعة وإضافتها إلى رصيد الصندوق.`)
      }).catch((error: unknown) => {
        console.error('Firestore batch contribution approval failed:', error)
        showFundMessage(`تعذر اعتماد الدفعات في Firestore: ${error instanceof Error ? error.message : String(error)}`)
      })
      return
    }
    const pending = approveAwaitingInStore(workspaceId, requestId, workspace?.balance ?? 0)
    if (!pending.length) return
    const totalApproved = pending.reduce((sum, contribution) => sum + contribution.amount, 0)
    addFundActivity(request.workspaceId, 'اعتماد جماعي للمساهمات', `${request.title} · ${formatNumber(pending.length)} أعضاء`, `+ ${money(totalApproved)} ر.س`, 'success')
    showFundMessage(`تم استلام واعتماد ${formatNumber(pending.length)} دفعة وإضافتها إلى رصيد الصندوق.`)
  }

  const reportObligationPayment = (workspaceId: string, obligationId: number) => {
    const obligation = obligations.find((item) => item.workspaceId === workspaceId && item.id === obligationId)
    if (!obligation) return
    if (hasFirebaseConfig) {
      if (!currentUser) return
      void reportSyncedObligationPayment(obligation.workspaceId, obligationId, currentUser.uid).then((updated) => {
        if (!updated) return
        addFundActivity(obligation.workspaceId, 'إشعار سداد بانتظار الاعتماد', obligation.title, `${money(obligation.amount)} ر.س`, 'pending')
        showFundMessage('سُجل إشعار السداد وبانتظار اعتماد المشرف.')
      }).catch((error: unknown) => {
        console.error('Reporting an obligation payment failed:', error)
        showFundMessage(`تعذر تسجيل إشعار السداد: ${error instanceof Error ? error.message : String(error)}`)
      })
      return
    }
    setObligations((current) => current.map((item) => item.workspaceId === workspaceId && item.id === obligationId ? { ...item, status: 'awaiting' } : item))
    addFundActivity(obligation.workspaceId, 'إشعار سداد بانتظار الاعتماد', obligation.title, `${money(obligation.amount)} ر.س`, 'pending')
    showFundMessage('سُجل إشعار السداد وبانتظار اعتماد المشرف.')
  }

  const approveObligationPayment = (workspaceId: string, obligationId: number) => {
    const obligation = obligations.find((item) => item.workspaceId === workspaceId && item.id === obligationId)
    if (!obligation || obligation.status !== 'awaiting') return
    if (hasFirebaseConfig) {
      void approveSyncedObligationPayment(obligation.workspaceId, obligationId).then((updated) => {
        if (!updated) return
        addFundActivity(obligation.workspaceId, 'اعتماد سداد التزام', obligation.title, `− ${money(obligation.amount)} ر.س`, 'success')
        showFundMessage('تم اعتماد المصروف وتسجيله في السجل المحاسبي للصندوق.')
      }).catch((error: unknown) => {
        console.error('Approving an obligation payment failed:', error)
        showFundMessage(`تعذر اعتماد المصروف: ${error instanceof Error ? error.message : String(error)}`)
      })
      return
    }
    setObligations((current) => current.map((item) => item.workspaceId === workspaceId && item.id === obligationId ? { ...item, status: 'paid' } : item))
    const workspace = allFunds.find((fund) => fund.id === obligation.workspaceId)
    adjustFundBalance(obligation.workspaceId, -obligation.amount, workspace?.balance ?? 0)
    addFundActivity(obligation.workspaceId, 'اعتماد سداد التزام', obligation.title, `− ${money(obligation.amount)} ر.س`, 'success')
    showFundMessage('تم اعتماد المصروف وتسجيله في السجل المحاسبي للصندوق.')
  }

  const createReimbursement = (workspaceId: string, title: string, amount: number, receipt: string) => {
    if (hasFirebaseConfig) {
      if (!currentUser) return
      const reimbursement: Reimbursement = {
        id: Date.now(),
        workspaceId,
        title,
        member: currentUserName,
        memberUid: currentUser.uid,
        amount,
        receipt,
        status: 'review',
      }
      void createSyncedReimbursement(workspaceId, reimbursement).then(() => {
        addFundActivity(workspaceId, 'طلب تعويض جديد', `${title} · ${currentUserName}`, `${money(amount)} ر.س`, 'pending')
        showFundMessage('أُرسل طلب التعويض للمراجعة. لن يُسجل الصرف قبل اعتماد المشرف.')
      }).catch((error: unknown) => {
        console.error('Creating a reimbursement failed:', error)
        showFundMessage(`تعذر إرسال طلب التعويض: ${error instanceof Error ? error.message : String(error)}`)
      })
      return
    }
    setReimbursements((current) => [{ id: Date.now(), workspaceId, title, member: currentUserName, memberUid: currentUserId, amount, receipt, status: 'review' }, ...current])
    addFundActivity(workspaceId, 'طلب تعويض جديد', `${title} · ${currentUserName}`, `${money(amount)} ر.س`, 'pending')
    showFundMessage('أُرسل طلب التعويض للمراجعة. لن يُسجل الصرف قبل اعتماد المشرف.')
  }

  const createKattahRequest = (workspaceId: string, title: string, total: number, cadence: string, due: string) => {
    if (!currentUser) {
      showFundMessage('يجب تسجيل الدخول لإنشاء طلب مساهمة.')
      return
    }
    const members = userGroups.find((group) => group.id === workspaceId)?.members ?? []
    if (!members.length) {
      showFundMessage('لا يوجد أعضاء في المجموعة لتوزيع المساهمة عليهم.')
      return
    }
    if (members.length > MAX_GROUP_MEMBERS) {
      showFundMessage('عذراً، لا يمكن إنشاء طلب قطية لمجموعة تضم أكثر من 30 مشاركاً.')
      return
    }
    const share = Math.floor((total / members.length) * 100) / 100
    const contributions = members.map((member, index) => ({
      uid: member.uid,
      name: member.displayName,
      amount: index === members.length - 1 ? Math.round((total - share * (members.length - 1)) * 100) / 100 : share,
      status: 'unpaid' as const,
    }))
    const request = { id: Date.now(), workspaceId, createdBy: currentUser.uid, title, cadence, total, due, contributions }
    if (hasFirebaseConfig) {
      void import('./fundPaymentSync').then(({ createSyncedRequest }) => createSyncedRequest(workspaceId, request)).then(() => {
        addFundActivity(workspaceId, 'إنشاء طلب قطية', `${title} · ${cadence} · ${due}`, `${money(total)} ر.س`)
        showFundMessage('تم إنشاء طلب القطية ومزامنته مع أعضاء الصندوق.')
      }).catch((error: unknown) => {
        console.error('Firestore contribution request creation failed:', error)
        showFundMessage(`تعذر إنشاء الطلب في Firestore: ${error instanceof Error ? error.message : String(error)}`)
      })
      return
    }
    addKattahRequest(request)
    addFundActivity(workspaceId, 'إنشاء طلب قطية', `${title} · ${cadence} · ${due}`, `${money(total)} ر.س`)
    showFundMessage('تم إنشاء طلب القطية وتوزيع الحصص على أعضاء الصندوق.')
  }

  const createObligation = (workspaceId: string, title: string, amount: number, cadence: string, due: string) => {
    if (hasFirebaseConfig) {
      if (!currentUser) return
      const obligation = { id: Date.now(), workspaceId, title, amount, cadence, due, createdByUid: currentUser.uid }
      void createSyncedObligation(workspaceId, obligation).then(() => {
        addFundActivity(workspaceId, 'إضافة التزام للصندوق', `${title} · ${cadence} · ${due}`, `${money(amount)} ر.س`)
        showFundMessage('تمت إضافة الالتزام إلى سجل الصندوق.')
      }).catch((error: unknown) => {
        console.error('Creating a fund obligation failed:', error)
        showFundMessage(`تعذرت إضافة الالتزام: ${error instanceof Error ? error.message : String(error)}`)
      })
      return
    }
    setObligations((current) => [{ id: Date.now(), workspaceId, title, amount, cadence, due, status: 'upcoming' }, ...current])
    addFundActivity(workspaceId, 'إضافة التزام للصندوق', `${title} · ${cadence} · ${due}`, `${money(amount)} ر.س`)
    showFundMessage('تمت إضافة الالتزام إلى سجل الصندوق.')
  }

  const decideReimbursement = (workspaceId: string, reimbursementId: number, status: Reimbursement['status']) => {
    const reimbursement = reimbursements.find((item) => item.workspaceId === workspaceId && item.id === reimbursementId)
    if (!reimbursement || reimbursement.status !== 'review') return
    if (hasFirebaseConfig) {
      if (status !== 'awaiting-receipt' && status !== 'rejected') return
      void decideSyncedReimbursement(reimbursement.workspaceId, reimbursementId, status).then((updated) => {
        if (!updated) return
        if (status === 'awaiting-receipt') {
          addFundActivity(reimbursement.workspaceId, 'اعتماد التعويض وتسجيل الصرف', `${reimbursement.title} · ${reimbursement.member}`, `− ${money(reimbursement.amount)} ر.س`, 'success')
          showFundMessage('سُجل صرف التعويض محاسبيًا. ينتظر تأكيد المستفيد لوصول التحويل الخارجي.')
        } else {
          addFundActivity(reimbursement.workspaceId, 'رفض طلب التعويض', `${reimbursement.title} · ${reimbursement.member}`, `${money(reimbursement.amount)} ر.س`, 'pending')
          showFundMessage('تم رفض طلب التعويض وتسجيل القرار في السجل.')
        }
      }).catch((error: unknown) => {
        console.error('Deciding a reimbursement failed:', error)
        showFundMessage(`تعذر تحديث طلب التعويض: ${error instanceof Error ? error.message : String(error)}`)
      })
      return
    }
    setReimbursements((current) => current.map((item) => item.workspaceId === workspaceId && item.id === reimbursementId ? { ...item, status } : item))
    if (status === 'awaiting-receipt') {
      const workspace = allFunds.find((fund) => fund.id === reimbursement.workspaceId)
      adjustFundBalance(reimbursement.workspaceId, -reimbursement.amount, workspace?.balance ?? 0)
      addFundActivity(reimbursement.workspaceId, 'اعتماد التعويض وتسجيل الصرف', `${reimbursement.title} · ${reimbursement.member}`, `− ${money(reimbursement.amount)} ر.س`, 'success')
      showFundMessage('سُجل صرف التعويض محاسبيًا. ينتظر تأكيد المستفيد لوصول التحويل الخارجي.')
    } else if (status === 'rejected') {
      addFundActivity(reimbursement.workspaceId, 'رفض طلب التعويض', `${reimbursement.title} · ${reimbursement.member}`, `${money(reimbursement.amount)} ر.س`, 'pending')
      showFundMessage('تم رفض طلب التعويض وتسجيل القرار في السجل.')
    }
  }

  const confirmReimbursementReceipt = (workspaceId: string, reimbursementId: number, received: boolean) => {
    const reimbursement = reimbursements.find((item) => item.workspaceId === workspaceId && item.id === reimbursementId)
    if (hasFirebaseConfig) {
      if (!currentUser || !reimbursement) return
      void confirmSyncedReimbursementReceipt(reimbursement.workspaceId, reimbursementId, currentUser.uid, received).then((updated) => {
        if (!updated) return
        addFundActivity(reimbursement.workspaceId, received ? 'تأكيد استلام التعويض' : 'اعتراض: لم يصل التعويض', `${reimbursement.title} · ${reimbursement.member}`, `${money(reimbursement.amount)} ر.س`, received ? 'success' : 'pending')
        showFundMessage(received ? 'تم تأكيد استلام التعويض.' : 'تم تسجيل اعتراض المستفيد على عدم الاستلام.')
      }).catch((error: unknown) => {
        console.error('Confirming a reimbursement receipt failed:', error)
        showFundMessage(`تعذر تحديث تأكيد الاستلام: ${error instanceof Error ? error.message : String(error)}`)
      })
      return
    }
    setReimbursements((current) => current.map((item) => item.workspaceId === workspaceId && item.id === reimbursementId
      ? { ...item, status: received ? 'received' : 'objection' }
      : item))
    if (reimbursement) addFundActivity(reimbursement.workspaceId, received ? 'تأكيد استلام التعويض' : 'اعتراض: لم يصل التعويض', `${reimbursement.title} · ${reimbursement.member}`, `${money(reimbursement.amount)} ر.س`, received ? 'success' : 'pending')
    showFundMessage(received ? 'تم تأكيد استلام التعويض.' : 'تم تسجيل اعتراض المستفيد على عدم الاستلام.')
  }

  const addPerson = () => {
    setPeople((current) => [...current, `عضو ${formatNumber(current.length)}`])
    setShares((current) => [...current, '0'])
  }

  const removePerson = (index: number) => {
    if (people.length <= 1) return
    setPeople((current) => current.filter((_, personIndex) => personIndex !== index))
    setShares((current) => current.filter((_, shareIndex) => shareIndex !== index))
  }

  const updateShare = (index: number, value: string) => {
    setShares((current) => current.map((share, shareIndex) => (shareIndex === index ? value : share)))
  }

  const splitTotal = customShares
    ? shares.reduce((sum, share) => sum + (Number(share) || 0), 0)
    : total
  const splitMatches = !customShares || Math.abs(splitTotal - total) < 0.005

  return (
    <div className="app-shell" dir="rtl">
      {sidebarOpen && <button className="mobile-backdrop" aria-label="إغلاق القائمة" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <button className="brand" onClick={() => openView('overview')} aria-label="نسق، الصفحة الرئيسية">
          <span className="brand-mark"><span /></span>
          <span className="brand-name">نسق<span className="brand-dot">.</span></span>
        </button>

        <span className="nav-heading">القائمة الرئيسية</span>
        <nav className="side-nav" aria-label="التنقل الرئيسي">
          {navigation.filter(({ id }) => id !== 'funds' || selectedGroup?.hasFund !== false).map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-link ${activeView === id ? 'active' : ''}`} onClick={() => openView(id)}>
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
              {id === 'activity' && <span className="nav-count">{formatNumber(3)}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="profile-button" onClick={() => currentUser ? setProfileSettingsOpen(true) : setShowAuthModal(true)} aria-label="إعدادات الحساب ووسيلة التحويل">
            <span className="profile-avatar">{profilePhotoURL ? <img src={profilePhotoURL} alt="" /> : currentUserName.slice(0, 1)}</span>
            <span className="profile-copy"><strong>{authLoading ? 'جارٍ تحميل الحساب...' : currentUserName || currentUser?.email || 'تسجيل الدخول'}</strong><small>{currentUser ? 'الحساب الشخصي' : 'يلزم تسجيل الدخول'}</small></span>
            <ChevronDown size={16} />
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-title">
            <button className="icon-button mobile-menu" aria-label="فتح القائمة" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button>
            <div className="breadcrumb"><span>مساحة العمل</span><span className="breadcrumb-slash">/</span><strong>{pageTitle}</strong></div>
          </div>
          <div className="topbar-actions">
            <label className="search-box">
              <Search size={17} />
              <input aria-label="ابحث" placeholder="ابحث عن عملية أو شخص..." />
              <kbd>⌘ K</kbd>
            </label>
            <button className="icon-button notification-button" aria-label="الإشعارات"><Bell size={19} /><i /></button>
            <div className="create-wrap">
              <button className="button-primary top-create" onClick={() => setMenuOpen((isOpen) => !isOpen)}>
                <Plus size={17} /> إنشاء جديد <ChevronDown size={15} />
              </button>
              {menuOpen && (
                <div className="create-menu">
                  <button onClick={() => startCreate('fund')}><Wallet size={17} /><span><strong>مجموعة جديدة</strong><small>أنشئ مساحة لمصروفات الأعضاء</small></span></button>
                  <button onClick={() => startCreate('gathering')}><UsersRound size={17} /><span><strong>جمعة جديدة</strong><small>للمناسبات والطلعات</small></span></button>
                  <button onClick={() => openView('split')}><ArrowLeftRight size={17} /><span><strong>قسمة سريعة</strong><small>قسّم مبلغًا على المجموعة</small></span></button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="page-content">
          {(gatheringSyncError || firestoreError) && <div className="payment-sync-notice sync-error" role="alert">تعذرت مزامنة البيانات: {gatheringSyncError || firestoreError}</div>}
          {createdMessage && <div className="toast-message"><CircleCheck size={17} />{createdMessage}</div>}
          {activeView === 'overview' && <Overview
            onStartGroup={() => {
              setGroupActionError('')
              setJoinCode('')
              setCreatedInviteCode('')
              setGroupModalOpen(true)
            }}
            currentUserName={currentUserName}
            groupsLoading={groupsLoading}
            groups={allGroups}
            gatherings={allGatherings}
            requests={kattahRequests}
            obligations={obligations}
            currentUserId={currentUserId}
            paymentActionsEnabled={firestoreStatus === 'local' || firestoreStatus === 'connected'}
            onOpenGroupSection={openGroupSection}
            onManageGroup={openGroupSettings}
            onVote={voteOnGathering}
            onConfirmContribution={confirmContribution}
            onReportObligationPayment={reportObligationPayment}
          />}
          {(activeView === 'funds' || activeView === 'workspace') && (activeView === 'workspace' && selectedGroup?.hasFund === false
            ? <div className="panel workspace-not-found"><h1>هذه مجموعة مناسبات</h1><p>لا تحتوي المجموعة على صندوق مالي.</p><button className="button-primary" onClick={() => openGroupHome(selectedGroup)}>عرض الجمعات</button></div>
            : activeView === 'workspace' && !selectedWorkspace
              ? <div className="panel workspace-not-found"><h1>الصندوق غير موجود</h1><p>تعذر العثور على هذه المجموعة.</p><button className="button-primary" onClick={() => openView('funds')}>عرض جميع الصناديق</button></div>
              : activeView === 'funds' && allFunds.length === 0
                ? <div className="panel workspace-not-found"><h1>لا توجد صناديق مالية</h1><p>يمكنك إنشاء مجموعة مستمرة أو تفعيل صندوق من إعدادات إحدى مجموعات المناسبات.</p><button className="button-primary" onClick={() => startCreate('fund')}><Plus size={15} /> إنشاء مجموعة مستمرة</button></div>
            : <FundsView
            onNavigate={openView}
            onOpenWorkspace={openWorkspace}
            onCreate={() => startCreate('fund')}
            currentUserId={currentUserId}
            selectedWorkspaceId={selectedWorkspaceId ?? ''}
            canManageGroup={canManageGroup}
            funds={allFunds}
            workspace={activeView === 'workspace' ? selectedWorkspace : undefined}
            requests={kattahRequests}
            obligations={obligations}
            reimbursements={reimbursements}
            history={fundHistory}
            firestoreStatus={gatheringSyncError ? 'error' : firestoreStatus}
            onConfirmContribution={confirmContribution}
            onApproveContribution={approveContribution}
            onRejectContribution={rejectContribution}
            onApproveAllContributions={approveAllContributions}
            onReportObligationPayment={reportObligationPayment}
            onApproveObligationPayment={approveObligationPayment}
            onCreateReimbursement={createReimbursement}
            onCreateKattahRequest={createKattahRequest}
            onCreateObligation={createObligation}
            onDecideReimbursement={decideReimbursement}
            onConfirmReimbursementReceipt={confirmReimbursementReceipt}
          />)}
          {activeView === 'gatherings' && <GatheringsView
            language={gatheringsLanguage}
            currentUserId={currentUserId}
            history={fundHistory}
            onLanguageChange={setGatheringsLanguage}
            onNavigate={openView}
            onCreate={() => startCreate('gathering')}
            gatherings={allGatherings.filter((gathering) => gathering.workspaceId === selectedWorkspaceId)}
            onVote={(gatheringId, decision) => voteOnGathering(selectedWorkspaceId ?? '', gatheringId, decision)}
            onCancelGathering={cancelGathering}
            onAddLateParticipant={addLateGatheringParticipant}
            onAddExpense={addGatheringExpense}
            onAddTask={addGatheringTask}
            onClaimTask={claimGatheringTask}
            onSetSettlementStatus={setGatheringSettlementStatus}
            onCopySettlementDetails={copySettlementDetails}
            onDeadline={(gatheringId, attendees) => {
              const gathering = gatheringItems.find((item) => item.workspaceId === selectedWorkspaceId && item.id === gatheringId)
              if (gathering) showFundMessage(gatheringsLanguage === 'ar'
                ? `انتهى التصويت على «${gathering.title}». العدد النهائي: ${attendees} مشارك.`
                : `RSVP closed for "${gathering.title}". Final count: ${attendees} attendees.`)
            }}
            onReminder={() => showFundMessage(gatheringsLanguage === 'ar' ? 'تم تسجيل تذكير ودي بالتسوية. لا يتم خصم أي مبلغ تلقائيًا.' : 'A friendly settlement reminder was recorded. No funds are charged automatically.')}
          />}
          {activeView === 'split' && (
            <SplitView
              amount={amount}
              people={people}
              shares={shares}
              customShares={customShares}
              splitMatches={splitMatches}
              splitTotal={splitTotal}
              evenShare={evenShare}
              saved={splitSaved}
              onAmountChange={(value) => { setAmount(value); setSplitSaved(false) }}
              onPersonChange={(index, value) => setPeople((current) => current.map((person, personIndex) => (personIndex === index ? value : person)))}
              onShareChange={updateShare}
              onAddPerson={addPerson}
              onRemovePerson={removePerson}
              onCustomSharesChange={setCustomShares}
              onSave={() => setSplitSaved(true)}
              onNavigate={openView}
            />
          )}
          {activeView === 'activity' && <ActivityView onNavigate={openView} history={fundHistory} />}
          <footer className="page-footer">
            <span>نسق · مصروفاتكم، مرتّبة.</span>
            <span><span className="footer-status-dot" /> جميع الأرصدة المعروضة سجلات محاسبية وليست أموالًا محفوظة</span>
          </footer>
        </div>
      </main>
      {createKind && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateKind(null) }}>
          <form className={`create-modal ${createKind === 'gathering' && gatheringsLanguage === 'en' ? 'modal-english' : ''}`} onSubmit={saveNewItem}>
            <button type="button" className="icon-button modal-close" aria-label="إغلاق" onClick={() => setCreateKind(null)}><X size={18} /></button>
            <span className="modal-icon">{createKind === 'fund' ? <Wallet size={21} /> : <UsersRound size={21} />}</span>
            <span className="date-line">{createKind === 'fund' ? 'مساحة مشتركة للأعضاء' : gatheringsLanguage === 'ar' ? 'خططوا لها سوا' : 'Plan it together'}</span>
            <h2>{createKind === 'fund' ? 'أنشئ مجموعة جديدة' : gatheringsLanguage === 'ar' ? 'رتّبوا جمعتكم الجاية' : 'Create a gathering'}</h2>
            <p>{createKind === 'fund' ? 'اختر نوع المجموعة الآن؛ ويمكن تفعيل الصندوق لاحقًا لمجموعات المناسبات.' : gatheringsLanguage === 'ar' ? 'اختر موعدًا سريعًا وحدد آخر وقت لقبول الدعوة.' : 'Choose a quick date and set the RSVP deadline.'}</p>
            <label className="modal-field"><span>{createKind === 'fund' ? 'اسم المجموعة' : gatheringsLanguage === 'ar' ? 'عنوان الجمعة' : 'Gathering title'}</span><input autoFocus required value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder={createKind === 'fund' ? 'مثال: مجموعة الأصدقاء' : gatheringsLanguage === 'ar' ? 'مثال: عشاء فريق العمل' : 'e.g. Team dinner'} /></label>
            {createKind === 'fund' && <fieldset className="group-type-options">
              <legend>نوع المجموعة</legend>
              <label className={newGroupType === 'event' ? 'selected' : ''}><input type="radio" name="group-type" value="event" checked={newGroupType === 'event'} onChange={() => setNewGroupType('event')} /><span><strong>مجموعة مناسبات</strong><small>جمعات فقط، دون صندوق مالي</small></span></label>
              <label className={newGroupType === 'ongoing' ? 'selected' : ''}><input type="radio" name="group-type" value="ongoing" checked={newGroupType === 'ongoing'} onChange={() => setNewGroupType('ongoing')} /><span><strong>مجموعة مستمرة</strong><small>صندوق مالي وجمعات</small></span></label>
            </fieldset>}
            {createKind !== 'fund' && (
              <>
                <label className="modal-field"><span>{gatheringsLanguage === 'ar' ? 'الموقع' : 'Location'}</span><input value={gatheringLocation} onChange={(event) => setGatheringLocation(event.target.value)} placeholder={gatheringsLanguage === 'ar' ? 'مثال: استراحة الشباب' : 'e.g. The cabin'} /></label>
                <div className="modal-field">
                  <span>{gatheringsLanguage === 'ar' ? 'اختر اليوم · خلال الأسبوعين القادمين' : 'Choose a day · next 14 days'}</span>
                  <div className="mini-date-selector" role="group" aria-label={gatheringsLanguage === 'ar' ? 'اختر يوم المناسبة' : 'Choose gathering date'}>
                    {Array.from({ length: 14 }, (_, dayOffset) => {
                      const date = new Date(eventTimeFor(dayOffset, '12:00'))
                      const selected = gatheringDayOffset === dayOffset
                      const isToday = dayOffset === 0
                      const dateLabel = new Intl.DateTimeFormat(gatheringsLanguage === 'ar' ? 'ar-SA' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', numberingSystem: 'latn' }).format(date)
                      return (
                        <button
                          key={dayOffset}
                          type="button"
                          className={`mini-date-button ${selected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                          aria-label={`${dateLabel}${isToday ? ` · ${gatheringsLanguage === 'ar' ? 'اليوم' : 'Today'}` : ''}`}
                          aria-pressed={selected}
                          onClick={() => {
                            setGatheringDayOffset(dayOffset)
                            setGatheringDeadline(deadlineOptionsFor(dayOffset, eventTimeFor(dayOffset, gatheringTime))[0]?.id ?? (dayOffset === 0 ? '2h' : 'before24h'))
                          }}
                        >
                          <span>{isToday ? (gatheringsLanguage === 'ar' ? 'اليوم' : 'Today') : new Intl.DateTimeFormat(gatheringsLanguage === 'ar' ? 'ar-SA' : 'en-US', { weekday: 'short', numberingSystem: 'latn' }).format(date)}</span>
                          <strong>{new Intl.DateTimeFormat(gatheringsLanguage === 'ar' ? 'ar-SA' : 'en-US', { day: 'numeric', numberingSystem: 'latn' }).format(date)}</strong>
                          <small>{new Intl.DateTimeFormat(gatheringsLanguage === 'ar' ? 'ar-SA' : 'en-US', { month: 'short' }).format(date)}</small>
                        </button>
                      )
                    })}
                  </div>
                </div>
                <label className="modal-field custom-time-field">
                  <span>{gatheringsLanguage === 'ar' ? 'أو اختر وقتًا دقيقًا' : 'Or choose an exact time'}</span>
                  <span className="custom-time-input-wrap"><Clock3 size={16} /><input type="time" value={gatheringTime} onChange={(event) => {
                    const time = event.target.value
                    if (!time) return
                    setGatheringTime(time)
                    setGatheringDeadline(deadlineOptionsFor(gatheringDayOffset, eventTimeFor(gatheringDayOffset, time))[0]?.id ?? gatheringDeadline)
                  }} /></span>
                </label>
                <label className="modal-field">
                  <span>{gatheringsLanguage === 'ar' ? 'آخر موعد للانضمام أو الاعتذار' : 'RSVP deadline'}</span>
                  <select value={gatheringDeadline} onChange={(event) => {
                    const preset = deadlineOptionsFor(gatheringDayOffset, eventTimeFor(gatheringDayOffset, gatheringTime)).find((option) => option.id === event.target.value)
                    if (preset) setGatheringDeadline(preset.id)
                  }}>
                    {deadlineOptionsFor(gatheringDayOffset, eventTimeFor(gatheringDayOffset, gatheringTime)).map((option) => (
                      <option key={option.id} value={option.id}>{gatheringsLanguage === 'ar' ? option.labelAr : option.labelEn}</option>
                    ))}
                  </select>
                </label>
                <label className="modal-field"><span>{gatheringsLanguage === 'ar' ? 'التكلفة التقديرية للفرد · اختياري' : 'Estimated cost per person · optional'}</span><input min="0" type="number" value={gatheringEstimate} onChange={(event) => setGatheringEstimate(event.target.value)} placeholder="0" /></label>
                {gatheringFormError && <p className="form-error" role="alert">{gatheringFormError}</p>}
              </>
            )}
            <div className="modal-actions"><button type="button" className="button-outline" onClick={() => setCreateKind(null)}>{createKind === 'fund' || gatheringsLanguage === 'ar' ? 'إلغاء' : 'Cancel'}</button><button type="submit" className="button-primary"><Plus size={16} /> {createKind === 'fund' ? 'إنشاء المجموعة' : gatheringsLanguage === 'ar' ? 'إنشاء الجمعة' : 'Create gathering'}</button></div>
            {createKind === 'fund' && firestoreError && <p className="form-error" role="alert">{firestoreError}</p>}
          </form>
        </div>
      )}
      {groupModalOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setGroupModalOpen(false) }}>
          <form className="create-modal group-join-modal" onSubmit={createdInviteCode ? (event) => event.preventDefault() : submitGroupJoin}>
            <button type="button" className="icon-button modal-close" aria-label="إغلاق" onClick={() => setGroupModalOpen(false)}><X size={18} /></button>
            <span className="modal-icon"><UsersRound size={21} /></span>
            {createdInviteCode
              ? <>
                <span className="date-line">تم إنشاء المجموعة</span>
                <h2>شارك رمز الدعوة</h2>
                <p>أرسل هذا الرمز إلى الأعضاء الذين تريد دعوتهم.</p>
                <label className="modal-field"><span>رمز الدعوة</span><input readOnly value={createdInviteCode} dir="ltr" /></label>
                {groupActionError && <p className="form-error" role="alert">{groupActionError}</p>}
                <div className="modal-actions"><button type="button" className="button-outline" onClick={() => setGroupModalOpen(false)}>إغلاق</button><button type="button" className="button-primary" onClick={() => void copyInviteCode()}>نسخ الرمز</button></div>
              </>
              : <>
                <span className="date-line">الانضمام إلى مجموعة</span>
                <h2>أدخل رمز الدعوة</h2>
                <p>اطلب رمز الدعوة المكوّن من 8 أحرف أو أرقام من مالك المجموعة.</p>
                <label className="modal-field"><span>رمز الدعوة</span><input autoFocus required minLength={8} maxLength={8} value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="مثال: A2BC3DEF" /></label>
                <button type="button" className="text-button group-create-action" onClick={() => {
                  setGroupModalOpen(false)
                  startCreate('fund')
                }}><Plus size={15} /> إنشاء مجموعة جديدة</button>
                {groupActionError && <p className="form-error" role="alert">{groupActionError}</p>}
                <div className="modal-actions"><button type="button" className="button-outline" onClick={() => setGroupModalOpen(false)}>إلغاء</button><button type="submit" className="button-primary" disabled={groupsLoading}>انضمام</button></div>
              </>}
          </form>
        </div>
      )}
      {profileSettingsOpen && currentUser && <ProfileSettingsModal
        user={currentUser}
        onClose={() => setProfileSettingsOpen(false)}
        onSaved={(displayName, photoURL) => {
          setProfileDisplayName(displayName)
          setProfilePhotoURL(photoURL)
          void refreshUserGroups().catch((error: unknown) => {
            console.error('Refreshing group members after profile update failed:', error)
            setFirestoreStatus('error')
            setFirestoreError(error instanceof Error ? error.message : String(error))
          })
          showFundMessage('تم حفظ إعدادات الملف الشخصي وبيانات التحويل.')
        }}
      />}
      {groupSettingsOpen && selectedGroup && <GroupSettingsModal
        group={selectedGroup}
        currentUserId={currentUserId}
        onClose={() => setGroupSettingsOpen(false)}
        onChanged={refreshUserGroups}
      />}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onResetPassword={handleResetPassword}
      />
    </div>
  )
}

function Overview({ onStartGroup, currentUserName, groupsLoading, groups, gatherings, requests, obligations, currentUserId, paymentActionsEnabled, onOpenGroupSection, onManageGroup, onVote, onConfirmContribution, onReportObligationPayment }: {
  onStartGroup: () => void
  currentUserName: string
  groupsLoading: boolean
  groups: WorkspaceGroup[]
  gatherings: Gathering[]
  requests: KattahRequest[]
  obligations: Obligation[]
  currentUserId: string
  paymentActionsEnabled: boolean
  onOpenGroupSection: (workspaceId: string, view: Exclude<View, 'overview' | 'workspace'>) => void
  onManageGroup: (workspaceId: string) => void
  onVote: (workspaceId: string, gatheringId: string, decision: Exclude<GatheringDecision, 'pending'>) => void
  onConfirmContribution: (workspaceId: string, requestId: number, memberUid: string) => void
  onReportObligationPayment: (workspaceId: string, obligationId: number) => void
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const pendingGatherings = gatherings.filter((gathering) => gathering.deadlineAt > now
    && gathering.participants.some((participant) => participant.uid === currentUserId && participant.decision === 'pending'))
  const upcomingGatherings = gatherings.filter((gathering) => gathering.eventAt > now
    && gathering.participants.some((participant) => participant.uid === currentUserId && participant.decision === 'joined'))
    .sort((left, right) => left.eventAt - right.eventAt)
    .slice(0, 5)
  const pendingContributions = requests.flatMap((request) => request.contributions
    .filter((contribution) => contribution.uid === currentUserId && ['unpaid', 'rejected'].includes(contribution.status))
    .map((contribution) => ({ request, contribution })))
  const dueObligations = obligations.filter((obligation) => obligation.status !== 'paid' && obligation.status !== 'awaiting'
    && (obligation.status === 'due' || dueUrgency(obligation.due, obligation.cadence, new Date(now))))
  const dueContributions = pendingContributions.filter(({ request }) => dueUrgency(request.due, request.cadence, new Date(now)))
  const dueCount = dueObligations.length + dueContributions.length

  return (
    <>
      <section className="overview-welcome">
        <div>
          <div className="date-line"><CalendarDays size={15} /> نسق · مساحة مجموعاتك</div>
          <h1>هلا {currentUserName} <span>👋</span></h1>
          <p>كل مجموعاتك والتزاماتك المهمة في مكان واحد.</p>
        </div>
        <button className="button-primary welcome-cta" onClick={onStartGroup}><Plus size={16} /> انضمام أو إنشاء مجموعة</button>
      </section>

      {dueCount > 0 && <div className="dashboard-due-notice" role="status"><Bell size={17} /><span><strong>لديك {formatNumber(dueCount)} {dueCount === 1 ? 'استحقاق' : 'استحقاقات'} قريب{dueCount === 1 ? '' : 'ة'}</strong><small>تأكد من دفع المستحقات قبل تأخرها.</small></span></div>}

      <section className="dashboard-groups-section">
        <div className="panel-heading"><div><h2>مجموعاتي</h2><p>اختر المجموعة والقسم الذي تريد الوصول إليه</p></div><span className="pill green-pill">{formatNumber(groups.length)} مجموعات</span></div>
        <div className="dashboard-group-grid">
          {groups.map((group) => (
            <article className="dashboard-group-card" key={group.id}>
              <button className="dashboard-group-main" onClick={() => onOpenGroupSection(group.id, group.hasFund ? 'funds' : 'gatherings')}>
                <span className="overview-shortcut-icon shortcut-fund-icon"><UsersRound size={21} /></span>
                <span className="dashboard-group-copy"><strong>{group.title}</strong><small>{group.hasFund ? `${formatNumber(group.members)} أعضاء` : `مجموعة مناسبات · ${formatNumber(group.members)} أعضاء`}</small></span>
                {group.hasFund && <span className="dashboard-group-balance">{money(group.balance)} <small>ر.س</small></span>}
              </button>
              <div className="dashboard-group-links">
                {group.hasFund && <button onClick={() => onOpenGroupSection(group.id, 'funds')}><Wallet size={15} /> الصناديق</button>}
                <button onClick={() => onOpenGroupSection(group.id, 'gatherings')}><UsersRound size={15} /> الجمعات</button>
                <button onClick={() => onOpenGroupSection(group.id, 'split')}><ArrowLeftRight size={15} /> القسمة السريعة</button>
                {group.role !== 'member' && <button onClick={() => onManageGroup(group.id)}><Settings2 size={15} /> الإعدادات</button>}
              </div>
            </article>
          ))}
          {groupsLoading && <div className="dashboard-empty-groups"><p>جارٍ تحميل مجموعاتك...</p></div>}
          {!groupsLoading && groups.length === 0 && <div className="dashboard-empty-groups"><p>لا توجد مجموعات مرتبطة بحسابك بعد.</p><button className="button-outline" onClick={onStartGroup}><Plus size={15} /> انضمام أو إنشاء مجموعة</button></div>}
        </div>
      </section>

      <section className="dashboard-actions-grid">
        <section className="panel dashboard-action-panel">
          <div className="panel-heading"><div><h2>الجمعات القادمة</h2><p>الدعوات واللقاءات المرتبطة بك</p></div><CalendarDays size={18} /></div>
          <div className="dashboard-action-list">
            {pendingGatherings.map((gathering) => (
              <article className="dashboard-action-row" key={`${gathering.workspaceId}-${gathering.id}`}>
                <div className="dashboard-action-copy"><strong>{gathering.title}</strong><small>{groups.find((group) => group.id === gathering.workspaceId)?.title} · {new Intl.DateTimeFormat('ar-SA', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', numberingSystem: 'latn' }).format(gathering.eventAt)}</small></div>
                <div className="dashboard-action-buttons"><button className="button-primary" onClick={() => onVote(gathering.workspaceId, gathering.id, 'joined')}><Check size={14} /> قبول</button><button className="button-outline" onClick={() => onVote(gathering.workspaceId, gathering.id, 'declined')}><X size={14} /> رفض</button></div>
              </article>
            ))}
            {upcomingGatherings.map((gathering) => (
              <article className="dashboard-action-row" key={`${gathering.workspaceId}-${gathering.id}`}>
                <div className="dashboard-action-copy"><strong>{gathering.title}</strong><small>{groups.find((group) => group.id === gathering.workspaceId)?.title} · {new Intl.DateTimeFormat('ar-SA', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', numberingSystem: 'latn' }).format(gathering.eventAt)}</small></div>
                <span className="pill green-pill">قادم</span>
              </article>
            ))}
            {!pendingGatherings.length && !upcomingGatherings.length && <p className="dashboard-empty-message">لا توجد دعوات أو جمعات قادمة.</p>}
          </div>
        </section>

        <section className="panel dashboard-action-panel">
          <div className="panel-heading"><div><h2>مستحقات الصناديق</h2><p>تأكيد الدفع دون مغادرة الصفحة الرئيسية</p></div><ReceiptText size={18} /></div>
          <div className="dashboard-action-list">
            {pendingContributions.map(({ request, contribution }) => (
              <article className="dashboard-action-row" key={`${request.workspaceId}-${request.id}-${contribution.uid}`}>
                <div className="dashboard-action-copy"><strong>{request.title}</strong><small>{groups.find((group) => group.id === request.workspaceId)?.title} · {money(contribution.amount)} ر.س · {dueLabel(request.due, request.cadence)}</small>{contribution.status !== 'awaiting' && <DueBadge due={request.due} cadence={request.cadence} now={new Date(now)} />}</div>
                <button className="button-primary" disabled={!paymentActionsEnabled} onClick={() => onConfirmContribution(request.workspaceId, request.id, currentUserId)}><Check size={14} /> تأكيد الدفع</button>
              </article>
            ))}
            {dueObligations.map((obligation) => (
              <article className="dashboard-action-row" key={`${obligation.workspaceId}-${obligation.id}`}>
                <div className="dashboard-action-copy"><strong>{obligation.title}</strong><small>{groups.find((group) => group.id === obligation.workspaceId)?.title} · {money(obligation.amount)} ر.س · {dueLabel(obligation.due, obligation.cadence)}</small><DueBadge due={obligation.due} cadence={obligation.cadence} now={new Date(now)} /></div>
                <button className="button-primary" disabled={!paymentActionsEnabled} onClick={() => onReportObligationPayment(obligation.workspaceId, obligation.id)}><Check size={14} /> تأكيد الدفع</button>
              </article>
            ))}
            {!pendingContributions.length && !dueObligations.length && <p className="dashboard-empty-message">لا توجد مستحقات دفع حاليًا.</p>}
          </div>
        </section>
      </section>
    </>
  )
}

function StatCard({ icon: Icon, color, label, amount, suffix, note, trend }: {
  icon: LucideIcon; color: string; label: string; amount: string; suffix: string; note: string; trend: string
}) {
  return (
    <article className="stat-card">
      <div className="stat-top"><span className={`stat-icon ${color}`}><Icon size={18} /></span><span className={`stat-trend ${color}`}>{trend}</span></div>
      <span className="stat-label">{label}</span>
      <div className="stat-amount">{amount}<small>{suffix}</small></div>
      <span className="stat-note">{note}</span>
    </article>
  )
}

function FundCard({ fund, onClick }: { fund: Fund; onClick: () => void }) {
  return (
    <button className="fund-card" onClick={onClick}>
      <div className="fund-card-top"><span className={`fund-emoji ${fund.color}`}>{fund.icon}</span><span className="fund-menu-dots">•••</span></div>
      <strong className="fund-title">{fund.title}</strong>
      <span className="fund-members"><UsersRound size={14} /> {formatNumber(fund.members)} أعضاء</span>
      <div className="fund-balance"><span>الرصيد المحاسبي</span><strong>{money(fund.balance)} <small>ر.س</small></strong></div>
      <div className="fund-due"><CalendarDays size={13} /> {fund.due}</div>
    </button>
  )
}

function PaymentBadge({ status }: { status: PaymentStatus }) {
  const label = status === 'paid' ? 'تم الاعتماد' : status === 'awaiting' ? 'تم الدفع' : status === 'rejected' ? 'لم تُستلم الحوالة' : 'بانتظار الدفع'
  return <span className={`fund-status-badge payment-${status}`}><i />{label}</span>
}

function orderedContributions(contributions: Contribution[]) {
  const priority = (status: PaymentStatus) => status === 'awaiting' || status === 'paid' ? 0 : status === 'unpaid' ? 1 : 2
  return contributions
    .map((contribution, originalIndex) => ({ contribution, originalIndex }))
    .sort((left, right) => {
      const priorityDifference = priority(left.contribution.status) - priority(right.contribution.status)
      if (priorityDifference) return priorityDifference
      if (priority(left.contribution.status) === 0) {
        return (left.contribution.confirmedAt ?? Number.MAX_SAFE_INTEGER)
          - (right.contribution.confirmedAt ?? Number.MAX_SAFE_INTEGER)
          || left.contribution.name.localeCompare(right.contribution.name, 'ar')
      }
      return left.originalIndex - right.originalIndex
    })
    .map(({ contribution }) => contribution)
}

function ObligationBadge({ status }: { status: Obligation['status'] }) {
  const label = status === 'paid' ? 'تم السداد' : status === 'awaiting' ? 'بانتظار الاعتماد' : status === 'due' ? 'مستحق قريبًا' : 'قادم'
  return <span className={`fund-status-badge obligation-${status}`}><i />{label}</span>
}

function ReimbursementBadge({ status }: { status: Reimbursement['status'] }) {
  const label = status === 'review' ? 'بانتظار المراجعة' : status === 'awaiting-receipt' ? 'بانتظار تأكيد الاستلام' : status === 'received' ? 'تم تأكيد الاستلام' : status === 'rejected' ? 'مرفوض' : 'اعتراض المستفيد'
  return <span className={`fund-status-badge reimbursement-${status}`}><i />{label}</span>
}

function EmptyState({ message }: { message: string }) {
  return <div className="fund-empty-state"><CircleCheck size={17} />{message}</div>
}

type FundFormKind = 'kattah' | 'obligation' | 'reimbursement'
type FundTab = 'contributions' | 'obligations' | 'reimbursements' | 'archive'

function FundsView({
  onNavigate,
  onOpenWorkspace,
  onCreate,
  currentUserId,
  selectedWorkspaceId,
  canManageGroup,
  funds: currentFunds,
  workspace,
  requests,
  obligations,
  reimbursements,
  history,
  firestoreStatus,
  onConfirmContribution,
  onApproveContribution,
  onRejectContribution,
  onApproveAllContributions,
  onReportObligationPayment,
  onApproveObligationPayment,
  onCreateReimbursement,
  onCreateKattahRequest,
  onCreateObligation,
  onDecideReimbursement,
  onConfirmReimbursementReceipt,
}: {
  onNavigate: (view: View) => void
  onOpenWorkspace: (workspaceId: string) => void
  onCreate: () => void
  currentUserId: string
  selectedWorkspaceId: string
  canManageGroup: (workspaceId: string) => boolean
  funds: Fund[]
  workspace?: Fund
  requests: KattahRequest[]
  obligations: Obligation[]
  reimbursements: Reimbursement[]
  history: FundActivity[]
  firestoreStatus: 'local' | 'connecting' | 'connected' | 'error'
  onConfirmContribution: (workspaceId: string, requestId: number, memberUid: string) => void
  onApproveContribution: (workspaceId: string, requestId: number, memberUid: string) => void
  onRejectContribution: (workspaceId: string, requestId: number, memberUid: string) => void
  onApproveAllContributions: (workspaceId: string, requestId: number) => void
  onReportObligationPayment: (workspaceId: string, obligationId: number) => void
  onApproveObligationPayment: (workspaceId: string, obligationId: number) => void
  onCreateReimbursement: (workspaceId: string, title: string, amount: number, receipt: string) => void
  onCreateKattahRequest: (workspaceId: string, title: string, total: number, cadence: string, due: string) => void
  onCreateObligation: (workspaceId: string, title: string, amount: number, cadence: string, due: string) => void
  onDecideReimbursement: (workspaceId: string, reimbursementId: number, status: Reimbursement['status']) => void
  onConfirmReimbursementReceipt: (workspaceId: string, reimbursementId: number, received: boolean) => void
}) {
  const [formKind, setFormKind] = useState<FundFormKind | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formCadence, setFormCadence] = useState('شهري')
  const [formDue, setFormDue] = useState('')
  const [receiptName, setReceiptName] = useState('')
  const [activeFundTab, setActiveFundTab] = useState<FundTab>('contributions')
  const [dueNow, setDueNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setDueNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const selectedFund = workspace ?? currentFunds.find((fund) => fund.id === selectedWorkspaceId) ?? currentFunds[0]
  const workspaceId = selectedFund?.id ?? ''
  const currentRequests = requests.filter((request) => request.workspaceId === workspaceId)
  const currentObligations = obligations.filter((obligation) => obligation.workspaceId === workspaceId)
  const currentReimbursements = reimbursements.filter((request) => request.workspaceId === workspaceId)
  const currentHistory = history.filter((item) => item.workspaceId === workspaceId)
  const switchToWorkspace = (nextWorkspaceId: string) => {
    setActiveFundTab('contributions')
    onOpenWorkspace(nextWorkspaceId)
  }
  const currentRequest = currentRequests[0]
  const sortedContributions = currentRequest ? orderedContributions(currentRequest.contributions) : []
  const confirmedContributions = sortedContributions.filter((item) => item.status === 'awaiting' || item.status === 'paid')
  const confirmationRanks = new Map(confirmedContributions.map((item, index) => [item.name, index + 1]))
  const firstConfirmer = confirmedContributions[0]?.name
  const currentMemberPayment = currentRequest?.contributions.find((item) => item.uid === currentUserId)
  const canConfirmPayment = currentMemberPayment?.status === 'unpaid' || currentMemberPayment?.status === 'rejected'
  const paymentActionsEnabled = firestoreStatus === 'local' || firestoreStatus === 'connected'
  const paidContributions = currentRequest?.contributions.filter((item) => item.status === 'paid') ?? []
  const awaitingContributions = currentRequest?.contributions.filter((item) => item.status === 'awaiting') ?? []
  const collectedAmount = paidContributions.reduce((sum, item) => sum + item.amount, 0)
  const goal = currentRequest?.total ?? 3000
  const totalDue = currentObligations.filter((item) => item.status !== 'paid').reduce((sum, item) => sum + item.amount, 0)

  const submitForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = formTitle.trim()
    const amount = Number(formAmount)
    if (!title || !Number.isFinite(amount) || amount <= 0 || !formKind) return

    if (formKind === 'kattah' || formKind === 'obligation') {
      const due = formCadence === 'شهري' ? `monthly:${Number(formDue)}` : formDue
      if (!formDue.trim()) return
      if (formKind === 'kattah') onCreateKattahRequest(workspaceId, title, amount, formCadence, due)
      else onCreateObligation(workspaceId, title, amount, formCadence, due)
    }
    if (formKind === 'reimbursement') onCreateReimbursement(workspaceId, title, amount, receiptName || 'لم يُرفق إيصال')
    setFormKind(null)
    setFormTitle('')
    setFormAmount('')
    setFormDue('')
    setReceiptName('')
  }

  return (
    <>
      <PageIntro
        eyebrow={workspace ? 'تفاصيل المجموعة' : 'إدارة المصروفات المستمرة'}
        title={workspace?.title ?? 'الصندوق'}
        description={workspace ? 'الرصيد الحالي وأعضاء المجموعة ومصروفاتها في مكان واحد.' : 'التزاماتكم وقطياتكم وتعويضاتكم في سجل واضح، من الطلب إلى التسوية.'}
        action={workspace ? 'إضافة مصروف' : 'إنشاء صندوق'}
        onAction={workspace ? () => { setFormKind('reimbursement'); setFormTitle(''); setFormAmount(''); setReceiptName('') } : onCreate}
      />

      <section className="balance-banner">
        <div className="balance-main">
          <div className="balance-title"><span className="balance-wallet"><Wallet size={19} /></span><span><small>الصندوق النشط</small><strong>{selectedFund?.title ?? 'صندوق المجموعة'}</strong></span></div>
          <span className="balance-caption">{workspace ? 'الرصيد الحالي للصندوق' : 'الرصيد التراكمي المسجّل'}</span>
          <strong className="balance-amount">{money(selectedFund?.balance ?? 0)} <small>ر.س</small></strong>
        </div>
        <div className="goal-progress">
          <div className="goal-heading"><span><strong>هدف التحصيل الشهري</strong><small>قطية أكتوبر · {currentRequest?.title ?? 'لا توجد قطية نشطة'}</small></span><strong>{Math.round(Math.min(collectedAmount / goal, 1) * 100)}<small>%</small></strong></div>
          <div className="goal-track"><span style={{ width: `${Math.min(collectedAmount / goal, 1) * 100}%` }} /></div>
          <div className="goal-amounts"><span>تم تحصيل <strong>{money(collectedAmount)} ر.س</strong></span><span>الهدف <strong>{money(goal)} ر.س</strong></span></div>
          <div className="balance-mini-stats"><span><Check size={14} /> {formatNumber(paidContributions.length)} دفعوا</span><span><Clock3 size={14} /> {formatNumber(awaitingContributions.length)} بانتظار الاعتماد</span><span><CalendarDays size={14} /> {money(totalDue)} ر.س التزامات قادمة</span></div>
        </div>
      </section>

      {currentFunds.length > 1 && <section className="fund-quick-switch" aria-label="التنقل بين الصناديق">
        <div className="fund-quick-switch-heading"><strong>مجموعاتك</strong><small>انتقل مباشرة إلى صندوق آخر</small></div>
        <div className="fund-quick-switch-list">
          {currentFunds.filter((fund) => fund.id !== workspaceId).map((fund) => (
            <button key={fund.id} onClick={() => switchToWorkspace(fund.id)}>
              <span><strong>{fund.title}</strong><small>{formatNumber(fund.members)} أعضاء</small></span>
              <b>{money(fund.balance)} <small>ر.س</small></b>
            </button>
          ))}
        </div>
      </section>}

      {workspace && <section className="panel workspace-members-panel">
        <div className="panel-heading"><div><h2>أعضاء المجموعة</h2><p>{formatNumber(workspace.members)} أعضاء</p></div><UsersRound size={19} /></div>
        <div className="workspace-members">
          {workspace.memberNames.map((name) => <span className="workspace-member" key={name}><span className={`person-avatar person-${name.length % 4}`}>{name.slice(0, 1)}</span>{name}</span>)}
        </div>
      </section>}

      <section className="fund-workspace-actions" aria-label="إدارة الصندوق">
        <button onClick={() => { setFormKind('kattah'); setFormTitle(''); setFormAmount(''); setFormDue('') }}><span className="action-symbol green"><UsersRound size={17} /></span><span><strong>طلب قطية</strong><small>توزيع مساهمات الأعضاء</small></span><Plus size={16} /></button>
        <button onClick={() => { setFormKind('obligation'); setFormTitle(''); setFormAmount(''); setFormDue('') }}><span className="action-symbol purple"><CalendarDays size={17} /></span><span><strong>إضافة التزام</strong><small>شهري أو سنوي أو فوري</small></span><Plus size={16} /></button>
        <button onClick={() => { setFormKind('reimbursement'); setFormTitle(''); setFormAmount(''); setReceiptName('') }}><span className="action-symbol orange"><ReceiptText size={17} /></span><span><strong>طلب استرداد</strong><small>إضافة مصروف وإرفاق الإيصال</small></span><Plus size={16} /></button>
      </section>

      {formKind && (
        <form className="panel fund-form-panel" onSubmit={submitForm}>
          <div className="panel-heading"><div><h2>{formKind === 'kattah' ? 'إنشاء طلب قطية' : formKind === 'obligation' ? 'إضافة التزام للصندوق' : 'رفع طلب تعويض'}</h2><p>{formKind === 'reimbursement' ? 'سيراجع المشرف الطلب والإيصال قبل تسجيل الصرف.' : 'ستظهر التفاصيل لجميع أعضاء الصندوق.'}</p></div><button className="icon-button mini" type="button" aria-label="إغلاق النموذج" onClick={() => setFormKind(null)}><X size={17} /></button></div>
          <div className="fund-form-fields">
            <label><span>{formKind === 'kattah' ? 'عنوان القطية' : formKind === 'obligation' ? 'اسم الالتزام' : 'سبب المصروف'}</span><input required value={formTitle} onChange={(event) => setFormTitle(event.target.value)} placeholder={formKind === 'kattah' ? 'مثال: قطية شهر نوفمبر' : formKind === 'obligation' ? 'مثال: فاتورة المياه' : 'مثال: مستلزمات طارئة للاستراحة'} /></label>
            <label><span>المبلغ الإجمالي (ر.س)</span><input required type="number" min="0.01" step="0.01" value={formAmount} onChange={(event) => setFormAmount(event.target.value)} placeholder="0.00" /></label>
            {formKind !== 'reimbursement' && <label><span>نوع الاستحقاق</span><select value={formCadence} onChange={(event) => { setFormCadence(event.target.value); setFormDue('') }}><option>فوري</option><option>شهري</option><option>سنوي</option></select></label>}
            {formKind !== 'reimbursement' && <label><span>{formCadence === 'شهري' ? 'يوم الاستحقاق من كل شهر' : 'تاريخ الاستحقاق'}</span>{formCadence === 'شهري'
              ? <input required type="number" min="1" max="31" step="1" inputMode="numeric" value={formDue} onChange={(event) => setFormDue(event.target.value)} placeholder="مثال: 27" />
              : <input required type="date" value={formDue} onChange={(event) => setFormDue(event.target.value)} />}</label>}
            {formKind === 'reimbursement' && <label className="receipt-upload"><span>إيصال الشراء</span><span className="receipt-picker"><ReceiptText size={14} />{receiptName || 'اختر صورة أو ملف PDF لإرفاقه'}<input type="file" accept="image/*,.pdf" onChange={(event) => setReceiptName(event.target.files?.[0]?.name ?? '')} /></span></label>}
          </div>
          {formKind === 'reimbursement' && <p className="fund-form-note"><ShieldCheck size={14} /> الإيصال يبقى ضمن هذا النموذج التجريبي ولا يُرفع إلى خادم.</p>}
          <div className="fund-form-footer"><button type="button" className="button-outline" onClick={() => setFormKind(null)}>إلغاء</button><button type="submit" className="button-primary"><Check size={15} /> {formKind === 'kattah' ? 'إنشاء الطلب وتوزيعه' : formKind === 'obligation' ? 'إضافة الالتزام' : 'إرسال للمراجعة'}</button></div>
        </form>
      )}

      <div className="fund-tabs" role="tablist" aria-label="أقسام الصندوق">
        {([
          ['contributions', 'القطات والاشتراكات'],
          ['obligations', 'الالتزامات والمصروفات'],
          ['reimbursements', 'طلبات التعويض'],
          ['archive', 'أرشيف الصناديق'],
        ] as const).map(([id, label]) => <button key={id} id={`fund-tab-${id}`} role="tab" aria-selected={activeFundTab === id} className={activeFundTab === id ? 'selected' : ''} onClick={() => setActiveFundTab(id)}>{label}</button>)}
      </div>

      {activeFundTab === 'contributions' && <section id="fund-panel-contributions" role="tabpanel" aria-labelledby="fund-tab-contributions" className="panel kattah-panel fund-section-panel">
        <div className="panel-heading"><div><span className="section-kicker">الاشتراكات والمساهمات</span><h2>القطية والاشتراك الشهري</h2><p>آلية موحّدة: يؤكد العضو الدفع، ثم يعتمد المسؤول وصول الحوالة لإضافة المبلغ للرصيد.</p></div><div className="kattah-header-actions"><span className="pill green-pill">{currentRequest?.cadence ?? 'شهري'}</span>{canManageGroup(workspaceId) && awaitingContributions.length > 0 && <button className="button-primary batch-approve" disabled={!paymentActionsEnabled} onClick={() => currentRequest && onApproveAllContributions(workspaceId, currentRequest.id)}><Check size={14} /> اعتماد المنتظرين ({formatNumber(awaitingContributions.length)})</button>}</div></div>
        {currentRequest ? (
          <>
            <div className="contribution-primary-action">
              {canConfirmPayment
                ? <button className="button-primary" disabled={!paymentActionsEnabled} onClick={() => onConfirmContribution(workspaceId, currentRequest.id, currentUserId)}><Check size={16} /> تأكيد الدفع</button>
                : currentMemberPayment && <PaymentBadge status={currentMemberPayment.status} />}
              {canConfirmPayment && <small>تأكيدك سيظهر في أعلى القائمة، ولا يضاف المبلغ للرصيد قبل الاعتماد.</small>}
            </div>
            <div className="request-summary">
              <span><strong>{currentRequest.title}</strong><small>الاستحقاق {dueLabel(currentRequest.due, currentRequest.cadence)}</small>{canConfirmPayment && <DueBadge due={currentRequest.due} cadence={currentRequest.cadence} now={new Date(dueNow)} />}</span>
              <span><strong>{money(currentRequest.total)} ر.س</strong><small>الحصة المتوقعة لكل عضو</small></span>
              <span><strong>{formatNumber(paidContributions.length)} من {formatNumber(currentRequest.contributions.length)}</strong><small>تأكيدات معتمدة</small></span>
            </div>
            <div className="contribution-list">
              {sortedContributions.map((contribution) => (
                <div className="contribution-row" key={`${currentRequest.id}-${contribution.name}`}>
                  <span className={`person-avatar person-${contribution.name.length % 4}`}>{contribution.name.slice(0, 1)}</span>
                  <span className="contribution-name"><strong>{confirmationRanks.has(contribution.name) && `${formatNumber(confirmationRanks.get(contribution.name) ?? 0)}- `}{contribution.name}{contribution.name === firstConfirmer && <span className="first-confirmer-badge">⚡ أول المسددين</span>}</strong><small>{money(contribution.amount)} ر.س</small></span>
                  <PaymentBadge status={contribution.status} />
                  {contribution.status === 'unpaid' && <span className="member-waiting">بانتظار العضو</span>}
                  {contribution.status === 'rejected' && contribution.uid !== currentUserId && <span className="member-waiting">لم تُستلم الحوالة</span>}
                  {contribution.status === 'awaiting' && canManageGroup(workspaceId) && <span className="review-actions"><button className="button-outline row-action approve-action" disabled={!paymentActionsEnabled} onClick={() => onApproveContribution(workspaceId, currentRequest.id, contribution.uid)}><Check size={13} /> تم الاستلام</button><button className="reject-action" disabled={!paymentActionsEnabled} onClick={() => onRejectContribution(workspaceId, currentRequest.id, contribution.uid)}>لم تصل الحوالة</button></span>}
                  {contribution.status === 'paid' && <span className="verified-mark"><CircleCheck size={15} /></span>}
                </div>
              ))}
            </div>
          </>
        ) : <EmptyState message="لا توجد طلبات قطية نشطة." />}
      </section>}

      {activeFundTab === 'obligations' && <div id="fund-panel-obligations" role="tabpanel" aria-labelledby="fund-tab-obligations">
      <section className="panel fund-section-panel">
        <div className="panel-heading"><div><span className="section-kicker">مصروفات دورية أو طارئة</span><h2>الالتزامات المستقرة</h2><p>سجّلوا الاستحقاق وتابعوا إشعار السداد واعتماد المشرف.</p></div><button className="text-button" onClick={() => { setFormKind('obligation'); setFormTitle(''); setFormAmount(''); setFormDue('') }}><Plus size={15} /> إضافة التزام</button></div>
        <div className="obligation-list">
          {currentObligations.map((obligation) => (
            <div className="obligation-row" key={obligation.id}>
              <span className={`obligation-icon ${obligation.status === 'due' ? 'due' : ''}`}><ReceiptText size={17} /></span>
              <span className="obligation-name"><strong>{obligation.title}</strong><small>{obligation.cadence} · الاستحقاق {dueLabel(obligation.due, obligation.cadence)}</small>{!['paid', 'awaiting'].includes(obligation.status) && <DueBadge due={obligation.due} cadence={obligation.cadence} now={new Date(dueNow)} />}</span>
              <strong className="obligation-amount">{money(obligation.amount)} <small>ر.س</small></strong>
              <ObligationBadge status={obligation.status} />
              {obligation.status === 'paid' ? <span className="verified-mark"><CircleCheck size={15} /></span> : obligation.status === 'awaiting' ? <button className="button-outline row-action approve-action" onClick={() => onApproveObligationPayment(workspaceId, obligation.id)}><Check size={13} /> اعتماد السداد</button> : <button className="button-outline row-action" onClick={() => onReportObligationPayment(workspaceId, obligation.id)}>تسجيل السداد</button>}
            </div>
          ))}
          {currentObligations.length === 0 && <EmptyState message="لا توجد التزامات مسجلة." />}
        </div>
      </section>

      <section className="panel fund-section-panel">
        <div className="panel-heading"><div><span className="section-kicker">سجل المجموعة</span><h2>المصروفات والسجلات</h2><p>العمليات المسجلة لهذه المجموعة فقط.</p></div>{!workspace && <button className="text-button" onClick={() => onNavigate('activity')}>السجل الكامل <ArrowUpLeft size={15} /></button>}</div>
        <FundHistoryRows history={currentHistory} />
      </section>
      </div>}

      {activeFundTab === 'reimbursements' && <section id="fund-panel-reimbursements" role="tabpanel" aria-labelledby="fund-tab-reimbursements" className="panel fund-section-panel">
        <div className="panel-heading"><div><span className="section-kicker">مصروفات دفعها عضو نيابة عن المجموعة</span><h2>طلبات التعويض والاسترداد</h2><p>راجعوا الإيصال، وسجّلوا الصرف، ثم انتظروا تأكيد المستفيد.</p></div><button className="text-button" onClick={() => { setFormKind('reimbursement'); setFormTitle(''); setFormAmount(''); setReceiptName('') }}><Plus size={15} /> طلب تعويض</button></div>
        {currentReimbursements.length ? <div className="reimbursement-list">
          {currentReimbursements.map((request) => (
            <div className="reimbursement-row" key={request.id}>
              <span className="expense-icon orange"><ReceiptText size={17} /></span>
              <span className="reimbursement-name"><strong>{request.title}</strong><small>طلبه {request.member} · الإيصال: {request.receipt}</small></span>
              <strong className="obligation-amount">{money(request.amount)} <small>ر.س</small></strong>
              <ReimbursementBadge status={request.status} />
              {request.status === 'review' && <span className="review-actions"><button className="button-outline row-action approve-action" onClick={() => onDecideReimbursement(workspaceId, request.id, 'awaiting-receipt')}><Check size={13} /> اعتماد وتسجيل الصرف</button><button className="reject-action" onClick={() => onDecideReimbursement(workspaceId, request.id, 'rejected')}>رفض</button></span>}
              {request.status === 'awaiting-receipt' && <span className="review-actions"><button className="button-outline row-action approve-action" onClick={() => onConfirmReimbursementReceipt(workspaceId, request.id, true)}>تأكيد الاستلام</button><button className="reject-action" onClick={() => onConfirmReimbursementReceipt(workspaceId, request.id, false)}>لم يصلني</button></span>}
            </div>
          ))}
        </div> : <EmptyState message="لا توجد طلبات تعويض." />}
      </section>}

      {activeFundTab === 'archive' && <section id="fund-panel-archive" role="tabpanel" aria-labelledby="fund-tab-archive" className="section-block fund-archive-section">
        <div className="panel-heading section-heading"><div><h2>أرشيف الصناديق</h2><p>اختر أي صندوق للانتقال إليه مباشرة</p></div><span className="pill green-pill">{formatNumber(currentFunds.length)} صناديق</span></div>
        <div className="fund-cards fund-cards-large">{currentFunds.map((fund) => <div className={`fund-archive-card ${fund.id === workspaceId ? 'active' : ''}`} key={fund.id}><FundCard fund={fund} onClick={() => switchToWorkspace(fund.id)} /></div>)}</div>
        {!currentFunds.length && <EmptyState message="لا توجد صناديق في الأرشيف." />}
      </section>}
    </>
  )
}

function GatheringsView({
  language,
  currentUserId,
  history,
  onLanguageChange,
  onNavigate,
  onCreate,
  gatherings: currentGatherings,
  onVote,
  onCancelGathering,
  onAddLateParticipant,
  onAddExpense,
  onAddTask,
  onClaimTask,
  onSetSettlementStatus,
  onCopySettlementDetails,
  onDeadline,
  onReminder,
}: {
  language: GatheringLanguage
  currentUserId: string
  history: FundActivity[]
  onLanguageChange: (language: GatheringLanguage) => void
  onNavigate: (view: View) => void
  onCreate: () => void
  gatherings: Gathering[]
  onVote: (gatheringId: string, decision: Exclude<GatheringDecision, 'pending'>) => void
  onCancelGathering: (gatheringId: string) => void
  onAddLateParticipant: (gatheringId: string, name: string) => void
  onAddExpense: (gatheringId: string, description: string, payer: string, amount: number) => void
  onAddTask: (gatheringId: string, title: string) => void
  onClaimTask: (gatheringId: string, taskId: number) => void
  onSetSettlementStatus: (gatheringId: string, memberName: string, status: 'pending' | 'paid') => void
  onCopySettlementDetails: (gathering: Gathering, memberName: string, amountDue: number) => void
  onDeadline: (gatheringId: string, attendees: number) => void
  onReminder: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [lateName, setLateName] = useState('')
  const [lateFormError, setLateFormError] = useState('')
  const [expenseDescription, setExpenseDescription] = useState('')
  const [expensePayer, setExpensePayer] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseFormError, setExpenseFormError] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const notifiedDeadlines = useRef(new Set<string>())
  const isEnglish = language === 'en'
  const formatMoney = (value: number) => formatNumber(value)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    for (const gathering of currentGatherings) {
      if (gathering.deadlineAt <= now && !notifiedDeadlines.current.has(gathering.id)) {
        notifiedDeadlines.current.add(gathering.id)
        onDeadline(gathering.id, gathering.participants.filter((person) => person.decision === 'joined').length)
      }
    }
  }, [currentGatherings, now, onDeadline])

  const selectedGathering = currentGatherings.find((gathering) => gathering.id === selectedId)
  const settlementRows = selectedGathering ? getSettlementRows(selectedGathering) : []

  const submitLateParticipant = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedGathering || !lateName.trim()) return
    if (selectedGathering.participants.some((person) => person.name.toLocaleLowerCase() === lateName.trim().toLocaleLowerCase())) {
      setLateFormError(isEnglish ? 'This member is already on the list.' : 'هذا العضو موجود في القائمة بالفعل.')
      return
    }
    onAddLateParticipant(selectedGathering.id, lateName)
    setLateName('')
    setLateFormError('')
  }

  const submitExpense = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedGathering) return
    if (!expenseDescription.trim()) {
      setExpenseFormError(isEnglish ? 'Enter expense details.' : 'اكتب تفاصيل المصروف.')
      return
    }
    const payer = selectedGathering.participants.some((person) => person.name === expensePayer)
      ? expensePayer
      : selectedGathering.participants[0]?.name
    if (!payer || !Number.isFinite(Number(expenseAmount)) || Number(expenseAmount) <= 0) {
      setExpenseFormError(isEnglish ? 'Choose a payer and enter a positive amount.' : 'اختر الدافع وأدخل مبلغًا أكبر من صفر.')
      return
    }
    onAddExpense(selectedGathering.id, expenseDescription, payer, Number(expenseAmount))
    setExpenseDescription('')
    setExpenseAmount('')
    setExpenseFormError('')
  }

  return (
    <div className={isEnglish ? 'gatherings-view gatherings-english' : 'gatherings-view'} dir={isEnglish ? 'ltr' : 'rtl'}>
      <section className="welcome-row page-intro">
        <div>
          <div className="date-line"><Sparkles size={15} /> {isEnglish ? 'Plan it together' : 'خططوا لها سوا'}</div>
          <h1>{isEnglish ? 'Gatherings' : 'الجمعات'}</h1>
          <p>{isEnglish ? 'Plan quickly, see who is coming, and keep expenses organized.' : 'رتب اللقاء بسرعة، واعرف من سيحضر، ونسّق المصروفات بشكل مرتب.'}</p>
        </div>
        <div className="gathering-page-actions">
          <button className="button-outline language-toggle" onClick={() => onLanguageChange(isEnglish ? 'ar' : 'en')}><Languages size={16} /> {isEnglish ? 'العربية' : 'English'}</button>
          <button className="button-primary welcome-cta" onClick={onCreate}><Plus size={17} /> {isEnglish ? 'New gathering' : 'إنشاء جمعة'}</button>
        </div>
      </section>
      <section className="gathering-cards">
        {currentGatherings.map((gathering) => {
          const closed = now >= gathering.deadlineAt
          const remaining = Math.max(0, gathering.deadlineAt - now)
          const days = Math.floor(remaining / 86_400_000)
          const hours = Math.floor((remaining % 86_400_000) / 3_600_000)
          const minutes = Math.floor((remaining % 3_600_000) / 60_000)
          const countdown = days > 0
            ? `${String(days).padStart(2, '0')}:${String(hours).padStart(2, '0')}`
            : `${String(Math.floor(remaining / 3_600_000)).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
          const joined = gathering.participants.filter((person) => person.decision === 'joined')
          const currentDecision = gathering.participants.find((person) => person.uid === currentUserId)?.decision
          const isOrganizer = gathering.createdById === currentUserId
          const displayDate = new Intl.DateTimeFormat(isEnglish ? 'en-US' : 'ar-SA', {
            weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', numberingSystem: 'latn',
          }).format(gathering.eventAt)
          const deadlineLabel = new Intl.DateTimeFormat(isEnglish ? 'en-US' : 'ar-SA', {
            day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', numberingSystem: 'latn',
          }).format(gathering.deadlineAt)

          return (
            <article className="panel gathering-card" key={gathering.id}>
              <div className="gathering-card-top">
                <span className="gathering-emoji large-emoji">{gathering.icon}</span>
                <div className="gathering-card-actions">
                  <span className={`gathering-status ${closed ? 'status-closed' : ''}`}>{closed ? (isEnglish ? 'In progress' : 'قيد التنفيذ') : (isEnglish ? 'RSVP open' : 'التصويت مفتوح')}</span>
                  {gathering.createdById === currentUserId && <button className="cancel-gathering-button" onClick={() => onCancelGathering(gathering.id)}>{isEnglish ? 'Cancel gathering' : 'إلغاء الجمعة'}</button>}
                </div>
              </div>
              <h2>{gathering.title}</h2>
              <div className="gathering-creator"><span aria-hidden="true">👑</span><strong>{isEnglish ? 'Organizer' : 'المنشئ'}: {gathering.createdByName}</strong></div>
              <div className="gathering-meta"><span><CalendarDays size={15} /> {displayDate}</span><span><MapPin size={15} /> {gathering.location}</span></div>
              <div className={`gathering-countdown ${remaining < 2 * 60 * 60 * 1000 && !closed ? 'countdown-urgent' : ''}`}>
                <Clock3 size={15} />
                <span>{closed ? (isEnglish ? 'RSVP closed' : 'انتهى وقت الرد') : (isEnglish ? 'Time to decide' : 'الوقت المتبقي للقرار')}</span>
                <strong>{countdown}</strong>
                {!closed && <small>{isEnglish ? `Deadline ${deadlineLabel}` : `الإغلاق ${deadlineLabel}`}</small>}
              </div>
              {closed && <div className="organizer-notice"><Bell size={14} /> {isEnglish ? `${formatNumber(joined.length)} confirmed attendee${joined.length === 1 ? '' : 's'} — notify the organizer` : `تأكيد العدد النهائي: ${formatNumber(joined.length)} مشارك · أبلغ المنشئ`}</div>}
              <div className="attendee-block">
                <div className="attendee-label"><span><UsersRound size={15} /> {isEnglish ? 'Confirmed' : 'تأكيدات الحضور'}</span><strong>{formatNumber(joined.length)} <small>/ {formatNumber(gathering.participants.length)}</small></strong></div>
                <div className="progress-track"><span style={{ width: `${gathering.participants.length ? (joined.length / gathering.participants.length) * 100 : 0}%` }} /></div>
                <div className="participant-chips">{gathering.participants.filter((person) => person.decision === 'joined' || person.name === gathering.createdByName).map((person) => <span className={person.name === gathering.createdByName ? 'creator-chip' : ''} key={person.name} title={person.name === gathering.createdByName ? `${isEnglish ? 'Organizer' : 'المنشئ'}: ${person.name}` : person.late ? (isEnglish ? 'Added after RSVP closed' : 'أُضيف بعد إغلاق التصويت') : person.name}>{person.name.slice(0, 1)}<small>{person.name}</small>{person.name === gathering.createdByName && <i aria-hidden="true">👑</i>}{person.late && <i>+</i>}</span>)}</div>
              </div>
              {isOrganizer
                ? <div className="gathering-decisions"><button className="organizer-manage-button" onClick={() => setSelectedId(gathering.id)}><Settings2 size={15} /> {isEnglish ? 'Manage gathering' : 'إدارة الجمعة'}</button></div>
                : <div className="gathering-decisions">
                  <button disabled={closed} className={currentDecision === 'joined' ? 'decision-selected' : ''} onClick={() => onVote(gathering.id, 'joined')}><Check size={15} /> {isEnglish ? 'Join' : 'انضم'}</button>
                  <button disabled={closed} className={currentDecision === 'declined' ? 'decision-selected decision-decline' : ''} onClick={() => onVote(gathering.id, 'declined')}><X size={15} /> {isEnglish ? 'Decline' : 'أعتذر'}</button>
                </div>}
              <div className="gathering-card-footer">
                {gathering.estimatedCost !== undefined && <span>{isEnglish ? 'Estimated / person' : 'التكلفة التقديرية للفرد'}<strong>{formatMoney(gathering.estimatedCost)} {isEnglish ? 'SAR' : 'ر.س'}</strong></span>}
                <button className="button-outline" onClick={() => setSelectedId(selectedId === gathering.id ? null : gathering.id)}>{selectedId === gathering.id ? (isEnglish ? 'Hide details' : 'إخفاء التفاصيل') : (isEnglish ? 'Details & settlement' : 'التفاصيل والتسوية')} <ArrowUpLeft size={15} /></button>
              </div>
            </article>
          )
        })}
        <button className="new-gathering-card" onClick={onCreate}><span><Plus size={21} /></span><strong>{isEnglish ? 'Plan your next gathering' : 'رتّبوا جمعتكم الجاية'}</strong><small>{isEnglish ? 'Set a time and invite your group' : 'اختر وقتًا ومكانًا وابدأ التصويت'}</small></button>
      </section>
      {selectedGathering && (
        <section className="panel gathering-details">
          <div className="panel-heading">
            <div><h2>{isEnglish ? 'Expense and settlement management' : 'إدارة المصروفات والتسوية'}</h2></div>
            <button className="button-outline" onClick={() => onNavigate('activity')}>{isEnglish ? 'Activity' : 'سجل العمليات'} <ArrowUpLeft size={15} /></button>
          </div>
          <div className="settlement-layout">
            <div className="settlement-column">
              <h3>{isEnglish ? 'Attendees' : 'المشاركون'}</h3>
              <div className="participant-list">
                {selectedGathering.participants.map((person) => (
                  <div className="participant-row" key={person.name}>
                    <span className="participant-avatar">{person.name.slice(0, 1)}</span><strong>{person.name}{person.name === selectedGathering.createdByName && <span className="creator-label">👑 {isEnglish ? 'Organizer' : 'المنشئ'}</span>}{person.late && <small>{isEnglish ? ' · late addition' : ' · حضور متأخر'}</small>}</strong>
                    <span className={`participant-state participant-${person.decision}`}>{person.decision === 'joined' ? (isEnglish ? 'Joined' : 'منضم') : person.decision === 'declined' ? (isEnglish ? 'Declined' : 'اعتذر') : (isEnglish ? 'Pending' : 'بانتظار الرد')}</span>
                  </div>
                ))}
              </div>
              <form className="inline-form late-member-form" onSubmit={submitLateParticipant}>
                <label className="modal-field"><span>{isEnglish ? 'Add someone who attended' : 'إضافة عضو حضر متأخرًا'}</span><input required value={lateName} onChange={(event) => { setLateName(event.target.value); setLateFormError('') }} placeholder={isEnglish ? 'Member name' : 'اسم العضو'} /></label>
                <button className="button-outline" type="submit"><UserRoundPlus size={15} /> {isEnglish ? 'Add attendee' : 'إضافة مشارك'}</button>
              </form>
              {lateFormError && <p className="form-error" role="alert">{lateFormError}</p>}
            </div>
            <div className="settlement-column">
              <h3>{isEnglish ? 'Add a manual expense' : 'تسجيل مصروف يدوي'}</h3>
              <form className="expense-entry-form" onSubmit={submitExpense}>
                <label className="modal-field"><span>{isEnglish ? 'Expense details' : 'تفاصيل المصروف'}</span><input required value={expenseDescription} onChange={(event) => { setExpenseDescription(event.target.value); setExpenseFormError('') }} placeholder={isEnglish ? 'e.g. Dinner' : 'مثال: الوجبة الرئيسية'} /></label>
                <div className="expense-entry-row">
                  <label className="modal-field"><span>{isEnglish ? 'Paid by' : 'الدافع'}</span><select required value={selectedGathering.participants.some((person) => person.name === expensePayer) ? expensePayer : selectedGathering.participants[0]?.name || ''} onChange={(event) => setExpensePayer(event.target.value)}>{selectedGathering.participants.map((person) => <option key={person.name} value={person.name}>{person.name}{person.decision === 'declined' ? (isEnglish ? ' (declined)' : ' (اعتذر)') : ''}</option>)}</select></label>
                  <label className="modal-field"><span>{isEnglish ? 'Amount (SAR)' : 'المبلغ (ر.س)'}</span><input required min="0.01" step="0.01" type="number" value={expenseAmount} onChange={(event) => { setExpenseAmount(event.target.value); setExpenseFormError('') }} placeholder="0.00" /></label>
                </div>
                <button className="button-primary" type="submit" disabled={!selectedGathering.participants.length}><Plus size={15} /> {isEnglish ? 'Add expense' : 'إضافة المصروف'}</button>
                {expenseFormError && <p className="form-error" role="alert">{expenseFormError}</p>}
              </form>
              <h3 className="expense-list-title">{isEnglish ? 'Recorded expenses' : 'المصروفات المسجلة'}</h3>
              {selectedGathering.expenses.length ? <div className="manual-expense-list">{selectedGathering.expenses.map((expense) => <div key={expense.id}><span><ReceiptText size={14} />{expense.description}<small>{isEnglish ? 'Paid by' : 'دفعها'} {expense.payer}</small></span><strong>{formatMoney(expense.amount)} {isEnglish ? 'SAR' : 'ر.س'}</strong></div>)}</div> : <p className="empty-expenses">{isEnglish ? 'No expenses recorded yet.' : 'لم تُسجّل مصروفات بعد.'}</p>}
            </div>
          </div>
          <section className="gathering-tasks" aria-labelledby="gathering-tasks-heading">
            <div className="gathering-tasks-heading"><div><h3 id="gathering-tasks-heading">{isEnglish ? 'Tasks to organize' : 'مهام تحتاج تنظيم'}</h3><p>{isEnglish ? 'Claim a task to coordinate with the group.' : 'اختر مهمة لتسجيلها باسمك ومنع تكرار التكليف.'}</p></div><span>{formatNumber(selectedGathering.tasks.length)}</span></div>
            {selectedGathering.createdById === currentUserId && <form className="task-entry-form" onSubmit={(event) => { event.preventDefault(); if (!taskTitle.trim()) return; onAddTask(selectedGathering.id, taskTitle); setTaskTitle('') }}><label className="modal-field"><span>{isEnglish ? 'New task' : 'مهمة جديدة'}</span><input required value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder={isEnglish ? 'e.g. Bring drinks' : 'مثال: شراء المشروبات'} /></label><button className="button-outline" type="submit"><Plus size={15} /> {isEnglish ? 'Add task' : 'إضافة مهمة'}</button></form>}
            <div className="gathering-task-list">{selectedGathering.tasks.map((task) => {
              const currentMemberJoined = selectedGathering.participants.some((person) => person.uid === currentUserId && person.decision === 'joined')
              return <div className="gathering-task-row" key={task.id}><span className={task.assignedTo ? 'task-check task-assigned' : 'task-check'}>{task.assignedTo ? <Check size={13} /> : null}</span><strong>{task.title}</strong>{task.assignedTo ? <span className="task-assignee">{isEnglish ? `Taken by ${task.assignedTo}` : `متكفل بها: ${task.assignedTo}`}</span> : currentMemberJoined ? <button className="task-claim-button" onClick={() => onClaimTask(selectedGathering.id, task.id)}>{isEnglish ? 'I can do it' : 'أتكفل بها'}</button> : <span className="task-assignee">{isEnglish ? 'Available' : 'متاحة'}</span>}</div>
            })}{selectedGathering.tasks.length === 0 && <p className="empty-expenses">{isEnglish ? 'No tasks added yet.' : 'لا توجد مهام مضافة بعد.'}</p>}</div>
          </section>
          <div className="settlement-summary">
            <div className="settlement-summary-heading"><span><Wallet size={17} />{isEnglish ? 'Fair-share settlement' : 'حساب نصيب الفرد العادل'}</span><strong>{isEnglish ? 'Total' : 'الإجمالي'}: {formatMoney(selectedGathering.expenses.reduce((sum, expense) => sum + expense.amount, 0))} {isEnglish ? 'SAR' : 'ر.س'}</strong></div>
            <p>{isEnglish ? 'Total expenses ÷ confirmed attendees. Positive balance means money to receive; negative means amount owed.' : 'إجمالي المصروفات ÷ عدد المشاركين المؤكدين. الموجب مستحق للاسترداد، والسالب مبلغ مستحق على العضو.'}</p>
            <div className="settlement-rows">
              {settlementRows.map((row) => {
                const participant = selectedGathering.participants.find((person) => person.name === row.name)
                const paymentStatus = participant?.settlementStatus ?? 'pending'
                const isOrganizer = selectedGathering.createdById === currentUserId
                return (
                  <div className="settlement-row" key={row.name}>
                    <strong>{row.name}</strong>
                    <span>{isEnglish ? 'Paid' : 'دفع'} {formatMoney(row.paid)} · {isEnglish ? 'Share' : 'حصته'} {formatMoney(row.share)}</span>
                    <b className={row.balance >= 0 ? 'balance-positive' : 'balance-negative'}>{row.balance >= 0 ? '+' : '−'}{formatMoney(Math.abs(row.balance))} {isEnglish ? 'SAR' : 'ر.س'}</b>
                    {row.balance < 0
                      ? <span className={`settlement-payment-badge ${paymentStatus === 'paid' ? 'settlement-paid' : 'settlement-pending'}`}>{paymentStatus === 'paid' ? (isEnglish ? 'Paid' : 'تم الدفع') : (isEnglish ? 'Awaiting payment' : 'بانتظار السداد')}</span>
                      : row.balance > 0
                        ? <span className="settlement-payment-badge settlement-credit">{isEnglish ? 'To receive' : 'مستحق له'}</span>
                        : <span className="settlement-payment-badge settlement-paid">{isEnglish ? 'Settled' : 'متوازن'}</span>}
                    {row.balance > 0 && <button className="settlement-copy-button" title={isEnglish ? `Copy transfer details for ${row.name}` : `نسخ بيانات تحويل ${row.name}`} aria-label={isEnglish ? `Copy transfer details for ${row.name}` : `نسخ بيانات تحويل ${row.name}`} onClick={() => onCopySettlementDetails(selectedGathering, row.name, row.balance)}><Copy size={14} /></button>}
                    {isOrganizer && row.balance < 0 && <button className="settlement-status-toggle" onClick={() => onSetSettlementStatus(selectedGathering.id, row.name, paymentStatus === 'paid' ? 'pending' : 'paid')}>{paymentStatus === 'paid' ? (isEnglish ? 'Undo' : 'تراجع') : (isEnglish ? 'Mark paid' : 'تسجيل السداد')}</button>}
                  </div>
                )
              })}
              {!settlementRows.length && <p className="empty-expenses">{isEnglish ? 'Add confirmed attendees to calculate each share.' : 'أضف مشاركين مؤكدين لحساب نصيب كل فرد.'}</p>}
            </div>
            <button className="button-outline reminder-button" disabled={!settlementRows.some((row) => row.balance < 0)} onClick={onReminder}><Bell size={15} /> {isEnglish ? 'Send friendly settlement reminder' : 'إرسال تذكير ودي بالتسوية'}</button>
            <small className="settlement-disclaimer">{isEnglish ? 'Reminders only. Members settle between themselves; no balance is charged or transferred by Nasq.' : 'للتذكير فقط؛ تتم التسوية بين الأعضاء ولا يخصم نسق أو يحوّل أي رصيد.'}</small>
          </div>
        </section>
      )}
      <section className="panel table-panel">
        <div className="panel-heading"><div><h2>{isEnglish ? 'Recent activity' : 'آخر الجمعات'}</h2><p>{isEnglish ? 'Recent events and their settlements' : 'المناسبات السابقة والتسويات المرتبطة بها'}</p></div></div>
        <ActivityRows compact history={history.slice(0, 3)} />
      </section>
    </div>
  )
}

function getSettlementRows(gathering: Gathering) {
  const joinedParticipants = gathering.participants.filter((person) => person.decision === 'joined')
  const paidByName = new Map(gathering.participants.map((person) => [person.name, 0]))
  for (const expense of gathering.expenses) paidByName.set(expense.payer, (paidByName.get(expense.payer) ?? 0) + expense.amount)
  const participantsByName = new Map(gathering.participants.map((person) => [person.name, person]))
  const settlementNames = new Set([
    ...joinedParticipants.map((person) => person.name),
    ...[...paidByName].filter(([, paid]) => paid > 0).map(([name]) => name),
  ])
  const total = gathering.expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const share = joinedParticipants.length ? total / joinedParticipants.length : 0
  return [...settlementNames].map((name) => {
    const paid = paidByName.get(name) ?? 0
    const fairShare = participantsByName.get(name)?.decision === 'joined' ? share : 0
    return {
      name,
      paid,
      share: fairShare,
      balance: paid - fairShare,
    }
  })
}

function paymentMethodLabel(method: PaymentMethod) {
  return method === 'iban' ? 'IBAN' : method === 'stcPay' ? 'stc pay' : method === 'urpay' ? 'urpay' : 'رقم الجوال'
}

function PageIntro({ eyebrow, title, description, action, onAction }: { eyebrow: string; title: string; description: string; action: string; onAction: () => void }) {
  return (
    <section className="welcome-row page-intro">
      <div><div className="date-line"><Sparkles size={15} /> {eyebrow}</div><h1>{title}</h1><p>{description}</p></div>
      <button className="button-primary welcome-cta" onClick={onAction}><Plus size={17} /> {action}</button>
    </section>
  )
}

function SplitView({ amount, people, shares, customShares, splitMatches, splitTotal, evenShare, saved, onAmountChange, onPersonChange, onShareChange, onAddPerson, onRemovePerson, onCustomSharesChange, onSave, onNavigate }: {
  amount: string
  people: string[]
  shares: string[]
  customShares: boolean
  splitMatches: boolean
  splitTotal: number
  evenShare: number
  saved: boolean
  onAmountChange: (value: string) => void
  onPersonChange: (index: number, value: string) => void
  onShareChange: (index: number, value: string) => void
  onAddPerson: () => void
  onRemovePerson: (index: number) => void
  onCustomSharesChange: (enabled: boolean) => void
  onSave: () => void
  onNavigate: (view: View) => void
}) {
  const total = Number(amount) || 0

  return (
    <>
      <PageIntro eyebrow="قسمة عادلة، في ثوانٍ" title="القسمة السريعة" description="أدخل المبلغ واختر المشاركين، ونسق يحسب حصة كل شخص." action="رجوع للرئيسية" onAction={() => onNavigate('overview')} />
      <div className="split-layout">
        <section className="panel split-form">
          <div className="split-step-heading"><span className="step-number">1</span><div><h2>كم إجمالي المبلغ؟</h2><p>المبلغ اللي اندفع أو ودّكم تقسّمونه</p></div></div>
          <label className="amount-input-wrap"><input inputMode="decimal" type="number" min="0" step="0.01" value={amount} onChange={(event) => onAmountChange(event.target.value)} aria-label="إجمالي المبلغ" /><span>ر.س</span></label>
          <div className="split-divider" />
          <div className="split-step-heading"><span className="step-number">2</span><div><h2>مين يشارك بالقسمة؟</h2><p>{formatNumber(people.length)} أشخاص · اضغط على الاسم لتعديله</p></div></div>
          <div className="people-list">
            {people.map((person, index) => (
              <div className="person-row" key={`${index}-${person}`}>
                <span className={`person-avatar person-${index % 4}`}>{person === 'أنت' ? 'م' : person.slice(0, 1)}</span>
                <input value={person} aria-label={`اسم المشارك ${index + 1}`} onChange={(event) => onPersonChange(index, event.target.value)} />
                {customShares ? <label className="share-input"><input inputMode="decimal" type="number" min="0" step="0.01" value={shares[index] ?? '0'} onChange={(event) => onShareChange(index, event.target.value)} aria-label={`حصة ${person}`} /><span>ر.س</span></label> : <strong className="person-share">{money(evenShare)} <small>ر.س</small></strong>}
                <button className="icon-button mini remove-person" onClick={() => onRemovePerson(index)} aria-label={`إزالة ${person}`}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button className="add-person-button" onClick={onAddPerson}><UserRoundPlus size={16} /> أضف شخصًا</button>
          <div className="split-divider" />
          <label className="custom-split-toggle"><span><strong>تقسيم مخصص</strong><small>حدد حصة مختلفة لكل شخص</small></span><input type="checkbox" checked={customShares} onChange={(event) => onCustomSharesChange(event.target.checked)} /><i /></label>
        </section>

        <aside className="split-summary">
          <div className="summary-card">
            <span className="summary-eyebrow"><span className="summary-live-dot" /> ملخص القسمة</span>
            <span className="summary-total-label">إجمالي المصروف</span>
            <strong className="summary-total">{money(total)} <small>ر.س</small></strong>
            <div className="summary-line" />
            <div className="summary-row"><span>عدد المشاركين</span><strong>{formatNumber(people.length)} أشخاص</strong></div>
            <div className="summary-row"><span>{customShares ? 'مجموع الحصص' : 'حصة كل شخص'}</span><strong>{money(customShares ? splitTotal : evenShare)} <small>ر.س</small></strong></div>
            {customShares && !splitMatches && <div className="split-warning"><CircleAlert size={15} /> مجموع الحصص لا يطابق إجمالي المبلغ</div>}
            {customShares && splitMatches && <div className="split-valid"><CircleCheck size={15} /> مجموع الحصص يطابق إجمالي المبلغ</div>}
            <button className="button-primary save-split" disabled={!people.length || !splitMatches || total <= 0} onClick={onSave}>{saved ? <><Check size={17} /> تم تسجيلها في النموذج</> : <><ArrowLeftRight size={17} /> تسجيل القسمة</>}</button>
            <p className="ledger-disclaimer"><ShieldCheck size={14} /> هذا سجل محاسبي فقط. لن يتم تحويل أي مبلغ من هنا.</p>
          </div>
          <div className="split-help"><Sparkles size={17} /><span><strong>بسيطة وعادلة</strong><small>قسّموا بالتساوي أو خصّصوا حصة كل شخص حسب طلبه.</small></span></div>
        </aside>
      </div>
    </>
  )
}

function ActivityView({ onNavigate, history }: { onNavigate: (view: View) => void; history: FundActivity[] }) {
  return (
    <>
      <PageIntro eyebrow="عمليات المجموعة الحالية" title="سجل العمليات" description="تتبّعوا العمليات المسجلة للمجموعة المحددة." action="عرض المجموعات" onAction={() => onNavigate('funds')} />
      <section className="stats-grid activity-stats">
        <StatCard icon={ReceiptText} color="green" label="العمليات" amount={money(history.length)} suffix="عملية" note="في المجموعة الحالية" trend="مسجّل" />
        <StatCard icon={Clock3} color="peach" label="بانتظار التأكيد" amount={money(history.filter((item) => item.kind === 'pending').length)} suffix="عملية" note="بحسب السجل الحالي" trend="متابعة" />
        <StatCard icon={CircleCheck} color="lavender" label="مكتملة" amount={money(history.filter((item) => item.kind === 'success').length)} suffix="عملية" note="بحسب السجل الحالي" trend="مكتملة" />
        <StatCard icon={UsersRound} color="blue" label="الأنشطة" amount={money(history.filter((item) => item.kind === 'event').length)} suffix="عملية" note="في المجموعة الحالية" trend="محدّثة" />
      </section>
      <section className="panel table-panel activity-table-panel">
        <div className="panel-heading"><div><h2>كل العمليات</h2><p>سجل المجموعة المالي</p></div><div className="filter-pills"><button className="selected">الكل <span>{formatNumber(history.length)}</span></button></div></div>
        <ActivityRows history={history} />
      </section>
      <div className="important-note"><ShieldCheck size={18} /><p><strong>عن التحويلات الخارجية</strong><span>تسجيل المحصّل للدفع لا يعني وصول التحويل. يكتمل السجل بعد تأكيد المستفيد استلامه، ويمكنه الاعتراض عند الحاجة.</span></p></div>
    </>
  )
}

function ActivityRows({ compact = false, history }: { compact?: boolean; history: FundActivity[] }) {
  return (
    <div className={`activity-rows ${compact ? 'compact-rows' : ''}`}>
      {history.map((item, index) => (
        <div className="activity-row" key={item.title}>
          <span className={`activity-icon activity-${item.kind}`}>{item.kind === 'success' ? <Check size={17} /> : item.kind === 'event' ? <UsersRound size={17} /> : <ArrowUpRight size={17} />}</span>
          <div className="activity-description"><strong>{item.title}</strong><span>{item.detail}</span></div>
          <strong className="activity-amount">{item.amount}</strong>
          <span className="activity-time">{item.time}</span>
          {!compact && <button className="icon-button mini" aria-label={`عرض ${item.title}`}><ArrowUpLeft size={15} /></button>}
          {compact && index === 0 && <span className="pill green-pill">مكتملة</span>}
        </div>
      ))}
    </div>
  )
}

function FundHistoryRows({ history }: { history: FundActivity[] }) {
  if (!history.length) return <EmptyState message="لا توجد سجلات لهذه المجموعة بعد." />
  return (
    <div className="activity-rows fund-history-rows">
      {history.slice(0, 6).map((item) => (
        <div className="activity-row" key={item.id}>
          <span className={`activity-icon activity-${item.kind}`}>{item.kind === 'success' ? <Check size={17} /> : item.kind === 'event' ? <ReceiptText size={17} /> : <Clock3 size={17} />}</span>
          <div className="activity-description"><strong>{item.title}</strong><span>{item.detail}</span></div>
          <strong className="activity-amount">{item.amount}</strong>
          <span className="activity-time">{item.time}</span>
        </div>
      ))}
    </div>
  )
}

export default App
