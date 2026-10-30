import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { LucideIcon } from 'lucide-react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useLocation, useNavigate } from 'react-router-dom'
import type { DocumentData } from 'firebase/firestore'
import type { SyncedContribution, SyncedKattahRequest } from './fundPaymentSync'
import {
  ArrowDownLeft,
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
  CreditCard,
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
type Fund = { id: string; title: string; members: number; memberNames: string[]; balance: number; icon: string; color: string; due: string }
type GatheringDecision = 'joined' | 'declined' | 'pending'
type PaymentMethod = 'iban' | 'stcPay' | 'urpay' | 'phone'
type PaymentProfile = { method: PaymentMethod; details: string }
type GatheringParticipant = { name: string; decision: GatheringDecision; late?: boolean; settlementStatus?: 'pending' | 'paid'; paymentMethod?: PaymentMethod; paymentDetails?: string }
type GatheringExpense = { id: number; description: string; payer: string; amount: number }
type GatheringTask = { id: number; title: string; assignedTo?: string }
type Gathering = {
  id: string
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
  estimatedCost?: number
}
type GatheringLanguage = 'ar' | 'en'
const currentUserId = 'mohammed'
const currentUserName = 'محمد السالم'
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
  updateGatherings: (updater: (current: Gathering[]) => Gathering[]) => void
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
  confirmContribution: (requestId: number, memberName: string) => boolean
  approveContribution: (requestId: number, memberName: string, fallbackBalance: number) => Contribution | null
  rejectContribution: (requestId: number, memberName: string) => boolean
  approveAwaitingContributions: (requestId: number, fallbackBalance: number) => Contribution[]
  adjustFundBalance: (workspaceId: string, amount: number, fallbackBalance: number) => void
}
type Obligation = { id: number; workspaceId: string; title: string; amount: number; cadence: string; due: string; status: 'upcoming' | 'due' | 'awaiting' | 'paid' }
type Reimbursement = { id: number; workspaceId: string; title: string; member: string; amount: number; receipt: string; status: 'review' | 'awaiting-receipt' | 'received' | 'objection' | 'rejected' }
type FundActivity = { id: number; workspaceId: string; title: string; detail: string; amount: string; kind: 'pending' | 'success' | 'event'; time: string }

const navigation: { id: View; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'نظرة عامة', icon: LayoutDashboard },
  { id: 'funds', label: 'الصناديق', icon: Wallet },
  { id: 'gatherings', label: 'الجمعات', icon: UsersRound },
  { id: 'split', label: 'القسمة السريعة', icon: ArrowLeftRight },
  { id: 'activity', label: 'سجل العمليات', icon: ReceiptText },
]

const expenses = [
  { name: 'مقاضي الاستراحة', group: 'استراحة الشباب', person: 'أحمد العتيبي', amount: 248, time: 'منذ ساعتين', status: 'بانتظار المراجعة', color: 'orange', icon: ReceiptText },
  { name: 'فاتورة الإنترنت', group: 'سكن الروضة', person: 'سارة محمد', amount: 230, time: 'أمس، ٨:٣٠ م', status: 'تمت التسوية', color: 'blue', icon: CreditCard },
  { name: 'عشاء الجمعة', group: 'جمعة نهاية الأسبوع', person: 'خالد الحربي', amount: 420, time: 'أمس، ٦:١٢ م', status: 'بانتظار الدفع', color: 'purple', icon: UsersRound },
]

const funds: Fund[] = [
  { id: 'youth-lounge', title: 'استراحة الشباب', members: 8, memberNames: ['أحمد العتيبي', 'سارة محمد', 'خالد الحربي', 'عبدالله فهد', 'نورة سعد', 'محمد السالم', 'فهد علي', 'ريم خالد'], balance: 1260, icon: '🏡', color: 'mint', due: 'فاتورة الكهرباء · ٢٨ أكتوبر' },
  { id: 'rawdah-residence', title: 'سكن الروضة', members: 4, memberNames: ['محمد السالم', 'سارة محمد', 'خالد الحربي', 'أحمد العتيبي'], balance: 840, icon: '🏠', color: 'lavender', due: 'الإيجار الشهري · ١ نوفمبر' },
  { id: 'abha-trip', title: 'رحلة أبها', members: 6, memberNames: ['محمد السالم', 'أحمد العتيبي', 'سارة محمد', 'خالد الحربي', 'نورة سعد', 'عبدالله فهد'], balance: 2150, icon: '⛰️', color: 'peach', due: 'الحجز النهائي · ٥ نوفمبر' },
]

const initialKattahRequests: KattahRequest[] = [{
  id: 1,
  workspaceId: 'youth-lounge',
  title: 'قطية مصروفات أكتوبر',
  cadence: 'شهرية',
  total: 2520,
  due: '٢٨ أكتوبر ٢٠٢٦',
  contributions: [
    { name: 'أحمد العتيبي', amount: 315, status: 'paid', confirmedAt: 1793193000000 },
    { name: 'سارة محمد', amount: 315, status: 'paid', confirmedAt: 1793196600000 },
    { name: 'خالد الحربي', amount: 315, status: 'paid', confirmedAt: 1793200200000 },
    { name: 'عبدالله فهد', amount: 315, status: 'paid', confirmedAt: 1793203800000 },
    { name: 'نورة سعد', amount: 315, status: 'awaiting', confirmedAt: 1793207400000 },
    { name: 'محمد السالم', amount: 315, status: 'unpaid' },
    { name: 'فهد علي', amount: 315, status: 'unpaid' },
    { name: 'ريم خالد', amount: 315, status: 'unpaid' },
  ],
}]

const useFundPaymentStore = create<FundPaymentState>()(persist((set) => ({
  kattahRequests: initialKattahRequests,
  fundBalances: {},
  replaceCloudRequests: (requests) => set({ kattahRequests: requests }),
  replaceCloudBalances: (balances) => set({ fundBalances: balances }),
  addKattahRequest: (request) => set((state) => ({ kattahRequests: [request, ...state.kattahRequests] })),
  confirmContribution: (requestId, memberName) => {
    let updated = false
    set((state) => ({
      kattahRequests: state.kattahRequests.map((request) => request.id === requestId
        ? {
          ...request,
          contributions: request.contributions.map((contribution) => {
            if (contribution.name !== memberName || !['unpaid', 'rejected'].includes(contribution.status)) return contribution
            updated = true
            return { ...contribution, status: 'awaiting', confirmedAt: Date.now() }
          }),
        }
        : request),
    }))
    return updated
  },
  approveContribution: (requestId, memberName, fallbackBalance) => {
    let approved: Contribution | null = null
    set((state) => {
      const request = state.kattahRequests.find((item) => item.id === requestId)
      const contribution = request?.contributions.find((item) => item.name === memberName && item.status === 'awaiting')
      if (!request || !contribution) return state
      approved = { ...contribution, status: 'paid' }
      const approvedContribution = approved
      return {
        kattahRequests: state.kattahRequests.map((item) => item.id === requestId
          ? { ...item, contributions: item.contributions.map((itemContribution) => itemContribution.name === memberName ? approvedContribution : itemContribution) }
          : item),
        fundBalances: {
          ...state.fundBalances,
          [request.workspaceId]: (state.fundBalances[request.workspaceId] ?? fallbackBalance) + contribution.amount,
        },
      }
    })
    return approved
  },
  rejectContribution: (requestId, memberName) => {
    let updated = false
    set((state) => ({
      kattahRequests: state.kattahRequests.map((request) => request.id === requestId
        ? {
          ...request,
          contributions: request.contributions.map((contribution) => {
            if (contribution.name !== memberName || contribution.status !== 'awaiting') return contribution
            updated = true
            return { ...contribution, status: 'rejected', confirmedAt: null }
          }),
        }
        : request),
    }))
    return updated
  },
  approveAwaitingContributions: (requestId, fallbackBalance) => {
    let approved: Contribution[] = []
    set((state) => {
      const request = state.kattahRequests.find((item) => item.id === requestId)
      if (!request) return state
      approved = request.contributions.filter((contribution) => contribution.status === 'awaiting')
      if (!approved.length) return state
      const total = approved.reduce((sum, contribution) => sum + contribution.amount, 0)
      return {
        kattahRequests: state.kattahRequests.map((item) => item.id === requestId
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
}), { name: 'nasq-fund-payments' }))

const initialObligations: Obligation[] = [
  { id: 1, workspaceId: 'youth-lounge', title: 'فاتورة الكهرباء', amount: 380, cadence: 'شهري', due: '٢٨ أكتوبر ٢٠٢٦', status: 'due' },
  { id: 2, workspaceId: 'rawdah-residence', title: 'فاتورة الإنترنت', amount: 230, cadence: 'شهري', due: '١ نوفمبر ٢٠٢٦', status: 'upcoming' },
  { id: 3, workspaceId: 'youth-lounge', title: 'الماء والصيانة', amount: 160, cadence: 'شهري', due: '٥ نوفمبر ٢٠٢٦', status: 'upcoming' },
]

const initialReimbursements: Reimbursement[] = [
  { id: 1, workspaceId: 'youth-lounge', title: 'مقاضي ومستلزمات الاستراحة', member: 'أحمد العتيبي', amount: 248, receipt: 'فاتورة_المقاضي.jpg', status: 'review' },
]

const initialFundActivity: FundActivity[] = [
  { id: 1, workspaceId: 'youth-lounge', title: 'اعتماد مساهمة شهر أكتوبر', detail: 'قطية مصروفات أكتوبر · أحمد العتيبي', amount: '+ ٣١٥ ر.س', kind: 'success', time: 'اليوم، ٩:١٥ ص' },
  { id: 2, workspaceId: 'youth-lounge', title: 'إرسال طلب تعويض للمراجعة', detail: 'مقاضي ومستلزمات الاستراحة · أحمد العتيبي', amount: '٢٤٨ ر.س', kind: 'pending', time: 'أمس، ٦:٢٠ م' },
  { id: 3, workspaceId: 'youth-lounge', title: 'إضافة التزام شهري', detail: 'فاتورة الكهرباء · استراحة الشباب', amount: '٣٨٠ ر.س', kind: 'event', time: '٢٥ أكتوبر، ١١:٤٠ ص' },
]

const createInitialGathering = (id: string, title: string, dayOffset: number, location: string, icon: string): Gathering => {
  const eventDate = new Date()
  eventDate.setDate(eventDate.getDate() + dayOffset)
  eventDate.setHours(19, 30, 0, 0)
  const participants: GatheringParticipant[] = [
    { name: 'محمد السالم', decision: 'joined' },
    { name: 'أحمد العتيبي', decision: 'joined' },
    { name: 'سارة محمد', decision: 'joined' },
    { name: 'خالد الحربي', decision: 'joined' },
    { name: 'نورة سعد', decision: 'pending' },
    { name: 'عبدالله فهد', decision: 'pending' },
  ]
  return {
    id,
    createdById: 'ahmed',
    createdByName: 'أحمد العتيبي',
    title,
    date: new Intl.DateTimeFormat('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' }).format(eventDate),
    eventAt: eventDate.getTime(),
    deadlineAt: Date.now() + (dayOffset === 1 ? 2 : 30) * 60 * 60 * 1000,
    location,
    attendees: participants.filter((person) => person.decision === 'joined').length,
    total: participants.length,
    badge: 'التصويت مفتوح',
    badgeColor: 'green',
    icon,
    participants,
    expenses: [],
    tasks: [],
  }
}

const gatherings: Gathering[] = [
  createInitialGathering('gathering-1', 'عشاء نهاية الأسبوع', 1, 'اختروا المطعم', '🍽️'),
  createInitialGathering('gathering-2', 'مباراة الهلال والنصر', 2, 'استراحة الشباب', '⚽'),
]

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const isGatheringParticipant = (value: unknown): value is GatheringParticipant =>
  isRecord(value)
  && typeof value.name === 'string'
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

const decodeGathering = (id: string, value: DocumentData): Gathering => {
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
    || (value.estimatedCost !== undefined && typeof value.estimatedCost !== 'number')
  ) throw new Error(`بيانات الجمعة ${id} غير صالحة.`)

  return {
    id,
    createdById: value.createdById,
    createdByName: value.createdByName,
    title: value.title,
    date: value.date,
    eventAt: value.eventAt,
    deadlineAt: value.deadlineAt,
    location: value.location,
    attendees: value.attendees,
    total: value.total,
    badge: value.badge,
    badgeColor: value.badgeColor,
    icon: value.icon,
    participants: value.participants,
    expenses: value.expenses,
    tasks: value.tasks,
    ...(typeof value.estimatedCost === 'number' ? { estimatedCost: value.estimatedCost } : {}),
  }
}

const useGatheringStore = create<GatheringStore>((set, get) => ({
  gatherings,
  syncError: '',
  replaceCloudGatherings: (cloudGatherings) => set({ gatherings: cloudGatherings, syncError: '' }),
  setSyncError: (message) => set({ syncError: message }),
  updateGatherings: (updater) => {
    const previous = get().gatherings
    const next = updater(previous)
    set({ gatherings: next })
    if (!hasFirebaseConfig || JSON.stringify(previous) === JSON.stringify(next)) return
    void import('./fundPaymentSync')
      .then(({ syncGatheringChanges }) => syncGatheringChanges(previous, next))
      .then(() => set({ syncError: '' }))
      .catch((error: unknown) => {
        console.error('Firestore gathering sync failed:', error)
        set({ syncError: error instanceof Error ? error.message : String(error) })
      })
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

const activityItems = [
  { title: 'أحمد أضاف مصروفًا جديدًا', detail: 'مقاضي الاستراحة · استراحة الشباب', amount: '+ ٢٤٨ ر.س', time: 'منذ ساعتين', kind: 'pending' },
  { title: 'تم تأكيد استلام التعويض', detail: 'فاتورة الإنترنت · سكن الروضة', amount: '٢٣٠ ر.س', time: 'أمس، ٨:٣٠ م', kind: 'success' },
  { title: 'تم إنشاء جمعة جديدة', detail: 'عشاء نهاية الأسبوع', amount: '٧ مشاركين', time: 'أمس، ٦:١٢ م', kind: 'event' },
]

const money = (value: number) =>
  new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 }).format(value)

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
      { id: '30m', labelAr: 'بعد ٣٠ دقيقة', labelEn: 'In 30 minutes', at: now + 30 * 60 * 1000 },
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
      { id: 'before24h', labelAr: 'قبل الموعد بـ ٢٤ ساعة', labelEn: '24 hours before', at: eventAt - 24 * 60 * 60 * 1000 },
      { id: 'before6h', labelAr: 'قبل الموعد بـ ٦ ساعات', labelEn: '6 hours before', at: eventAt - 6 * 60 * 60 * 1000 },
      { id: 'before1h', labelAr: 'قبل الموعد بساعة', labelEn: '1 hour before', at: eventAt - 60 * 60 * 1000 },
    ]
  return options.filter((option) => option.at > now && option.at < eventAt)
}

function App() {
  const navigate = useNavigate()
  const location = useLocation()
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
  const [createdFunds, setCreatedFunds] = useState<Fund[]>([])
  const gatheringItems = useGatheringStore((state) => state.gatherings)
  const setGatheringItems = useGatheringStore((state) => state.updateGatherings)
  const replaceCloudGatherings = useGatheringStore((state) => state.replaceCloudGatherings)
  const setGatheringSyncError = useGatheringStore((state) => state.setSyncError)
  const gatheringSyncError = useGatheringStore((state) => state.syncError)
  const [createName, setCreateName] = useState('')
  const [createDetail, setCreateDetail] = useState('')
  const [gatheringLocation, setGatheringLocation] = useState('')
  const [gatheringDayOffset, setGatheringDayOffset] = useState(1)
  const [gatheringTime, setGatheringTime] = useState('19:30')
  const [gatheringDeadline, setGatheringDeadline] = useState<DeadlinePreset>('before24h')
  const [gatheringEstimate, setGatheringEstimate] = useState('')
  const [gatheringFormError, setGatheringFormError] = useState('')
  const [gatheringsLanguage, setGatheringsLanguage] = useState<GatheringLanguage>('ar')
  const [createdMessage, setCreatedMessage] = useState('')
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false)
  const [paymentProfile, setPaymentProfile] = useState<PaymentProfile>({ method: 'iban', details: '' })
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
  const [obligations, setObligations] = useState(initialObligations)
  const [reimbursements, setReimbursements] = useState(initialReimbursements)
  const [fundHistory, setFundHistory] = useState(initialFundActivity)
  const allFunds = [...funds, ...createdFunds].map((fund) => ({ ...fund, balance: fundBalances[fund.id] ?? fund.balance }))
  const allGatherings = gatheringItems

  const total = Number(amount) || 0
  const evenShare = people.length ? total / people.length : 0
  const selectedWorkspace = allFunds.find((fund) => fund.id === selectedWorkspaceId)
  const pageTitle = activeView === 'workspace'
    ? selectedWorkspace?.title ?? 'الصندوق'
    : navigation.find((item) => item.id === activeView)?.label ?? 'نظرة عامة'

  useEffect(() => {
    setRoute(routeFromPath(location.pathname))
  }, [location.pathname, setRoute])

  useEffect(() => {
    if (!hasFirebaseConfig) return

    let receivedRequests = false
    let receivedBalances = false
    let receivedGatherings = false
    let hasSyncError = false
    let cancelled = false
    let unsubscribePayments = () => {}
    let unsubscribeGatherings = () => {}
    const markConnected = () => {
      if (!hasSyncError && receivedRequests && receivedBalances && receivedGatherings) {
        setFirestoreStatus('connected')
        setFirestoreError('')
      }
    }
    void import('./fundPaymentSync').then(({ subscribeToFundPayments, subscribeToGatherings }) => {
      if (cancelled) return
      unsubscribePayments = subscribeToFundPayments(
        (requests) => {
          replaceCloudRequests(requests)
          receivedRequests = true
          markConnected()
        },
        (balances) => {
          replaceCloudBalances(balances)
          receivedBalances = true
          markConnected()
        },
        (error) => {
          hasSyncError = true
          console.error('Firestore fund-payment sync failed:', error)
          setFirestoreStatus('error')
          setFirestoreError(error.message)
        },
      )
      unsubscribeGatherings = subscribeToGatherings(
        decodeGathering,
        (cloudGatherings) => {
          replaceCloudGatherings(cloudGatherings)
          setGatheringSyncError('')
          receivedGatherings = true
          markConnected()
        },
        (error) => {
          hasSyncError = true
          console.error('Firestore gathering sync failed:', error)
          setFirestoreStatus('error')
          setFirestoreError(error.message)
          setGatheringSyncError(error.message)
        },
      )
    }).catch((error: unknown) => {
      console.error('Firestore fund-payment sync initialization failed:', error)
      setFirestoreStatus('error')
      setFirestoreError(error instanceof Error ? error.message : String(error))
    })
    return () => {
      cancelled = true
      unsubscribePayments()
      unsubscribeGatherings()
    }
  }, [replaceCloudBalances, replaceCloudGatherings, replaceCloudRequests, setGatheringSyncError])

  const openView = (view: View) => {
    const path = view === 'overview' ? '/' : view === 'funds' || view === 'workspace' ? '/workspaces' : `/${view}`
    navigate(path)
    setRoute({ activeView: view, selectedWorkspaceId: null })
    setMenuOpen(false)
    setSidebarOpen(false)
    setSplitSaved(false)
  }

  const openWorkspace = (workspaceId: string) => {
    navigate(`/workspaces/${encodeURIComponent(workspaceId)}`)
    setRoute({ activeView: 'workspace', selectedWorkspaceId: workspaceId })
    setMenuOpen(false)
    setSidebarOpen(false)
    setSplitSaved(false)
  }

  const startCreate = (kind: CreateKind) => {
    setCreateKind(kind)
    setCreateName('')
    setCreateDetail('')
    setGatheringLocation('')
    setGatheringDayOffset(1)
    setGatheringTime('19:30')
    setGatheringDeadline('before24h')
    setGatheringEstimate('')
    setGatheringFormError('')
    setCreatedMessage('')
    setMenuOpen(false)
  }

  const saveNewItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = createName.trim()
    if (!createKind) return
    if (!name) {
      if (createKind === 'gathering') setGatheringFormError(gatheringsLanguage === 'ar' ? 'اكتب عنوانًا للجمعة.' : 'Enter a gathering title.')
      return
    }

    if (createKind === 'fund') {
      setCreatedFunds((current) => [...current, {
        id: `workspace-${Date.now()}`,
        title: name,
        members: 1,
        memberNames: ['محمد السالم'],
        balance: 0,
        icon: '✨',
        color: 'mint',
        due: createDetail.trim() || 'لا توجد التزامات قادمة',
      }])
    } else {
      const eventAt = eventTimeFor(gatheringDayOffset, gatheringTime)
      const options = deadlineOptionsFor(gatheringDayOffset, eventAt)
      const selectedDeadline = options.find((option) => option.id === gatheringDeadline) ?? options[0]
      if (eventAt <= Date.now() || !selectedDeadline) {
        setGatheringFormError(gatheringsLanguage === 'ar' ? 'اختر وقتًا مستقبليًا وموعد إغلاق يسبقه.' : 'Choose a future time and an RSVP deadline before it.')
        return
      }
      const participants: GatheringParticipant[] = [
        { name: 'محمد السالم', decision: 'joined' },
        { name: 'أحمد العتيبي', decision: 'pending' },
        { name: 'سارة محمد', decision: 'pending' },
        { name: 'خالد الحربي', decision: 'pending' },
      ]
      setGatheringItems((current) => [{
        id: `gathering-${Date.now()}`,
        createdById: currentUserId,
        createdByName: currentUserName,
        title: name,
        date: new Intl.DateTimeFormat('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' }).format(eventAt),
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
        estimatedCost: Number(gatheringEstimate) || undefined,
      }, ...current])
    }

    setCreateKind(null)
    setCreatedMessage(createKind === 'gathering' && gatheringsLanguage === 'en'
      ? `Gathering "${name}" was added to your workspace.`
      : `تمت إضافة ${createKind === 'fund' ? 'الصندوق' : 'الجمعة'} «${name}» إلى مساحة عملك.`)
    window.setTimeout(() => setCreatedMessage(''), 3500)
  }

  const voteOnGathering = (gatheringId: string, decision: Exclude<GatheringDecision, 'pending'>) => {
    const gathering = gatheringItems.find((item) => item.id === gatheringId)
    if (!gathering || gathering.createdById === currentUserId || gathering.deadlineAt <= Date.now()) return
    setGatheringItems((current) => current.map((item) => item.id === gatheringId
      ? {
        ...item,
        participants: item.participants.map((person) => ({
          ...person,
          ...(person.name === 'محمد السالم' ? { decision } : {}),
          settlementStatus: undefined,
        })),
        attendees: item.participants.filter((person) => person.name === 'محمد السالم' ? decision === 'joined' : person.decision === 'joined').length,
      }
      : item))
  }

  const cancelGathering = (gatheringId: string) => {
    const gathering = gatheringItems.find((item) => item.id === gatheringId)
    if (!gathering || gathering.createdById !== currentUserId) return
    setGatheringItems((current) => current.filter((item) => item.id !== gatheringId))
  }

  const addLateGatheringParticipant = (gatheringId: string, name: string) => {
    const normalizedName = name.trim()
    if (!normalizedName) return
    setGatheringItems((current) => current.map((item) => {
      if (item.id !== gatheringId || item.participants.some((person) => person.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) return item
      const participants = [...item.participants.map((person) => ({ ...person, settlementStatus: undefined })), { name: normalizedName, decision: 'joined' as const, late: true }]
      return { ...item, participants, attendees: participants.filter((person) => person.decision === 'joined').length, total: participants.length }
    }))
  }

  const addGatheringExpense = (gatheringId: string, description: string, payer: string, amount: number) => {
    if (!description.trim() || !payer || !Number.isFinite(amount) || amount <= 0) return
    setGatheringItems((current) => current.map((item) => item.id === gatheringId
      ? {
        ...item,
        expenses: [...item.expenses, { id: Date.now(), description: description.trim(), payer, amount }],
        participants: item.participants.map((person) => ({ ...person, settlementStatus: undefined })),
      }
      : item))
  }

  const addGatheringTask = (gatheringId: string, title: string) => {
    const gathering = gatheringItems.find((item) => item.id === gatheringId)
    const normalizedTitle = title.trim()
    if (!gathering || gathering.createdById !== currentUserId || !normalizedTitle) return
    setGatheringItems((current) => current.map((item) => item.id === gatheringId
      ? { ...item, tasks: [...item.tasks, { id: Date.now(), title: normalizedTitle }] }
      : item))
  }

  const claimGatheringTask = (gatheringId: string, taskId: number) => {
    const gathering = gatheringItems.find((item) => item.id === gatheringId)
    const currentParticipant = gathering?.participants.find((person) => person.name === currentUserName)
    if (!gathering || currentParticipant?.decision !== 'joined') return
    setGatheringItems((current) => current.map((item) => item.id === gatheringId
      ? { ...item, tasks: item.tasks.map((task) => task.id === taskId && !task.assignedTo ? { ...task, assignedTo: currentUserName } : task) }
      : item))
  }

  const copySettlementDetails = async (gathering: Gathering, memberName: string, amountDue: number) => {
    const participant = gathering.participants.find((person) => person.name === memberName)
    const method = memberName === currentUserName ? paymentProfile.method : participant?.paymentMethod
    const details = memberName === currentUserName ? paymentProfile.details.trim() : participant?.paymentDetails?.trim()
    const methodLabel = method ? paymentMethodLabel(method) : 'غير محددة'
    const text = `المستحق: ${memberName}\nالمبلغ: ${money(amountDue)} ر.س\nوسيلة التحويل: ${methodLabel}\nبيانات التحويل: ${details || 'غير متاحة'}`
    try {
      await navigator.clipboard.writeText(text)
      showFundMessage(details
        ? `تم نسخ بيانات تحويل ${memberName}.`
        : `نُسخ اسم ${memberName} والمبلغ؛ لم تُسجل بيانات التحويل لهذا العضو.`)
    } catch {
      showFundMessage('تعذر النسخ. تحقق من صلاحية الحافظة في المتصفح.')
    }
  }

  const setGatheringSettlementStatus = (gatheringId: string, memberName: string, status: 'pending' | 'paid') => {
    const gathering = gatheringItems.find((item) => item.id === gatheringId)
    if (!gathering || gathering.createdById !== currentUserId) return
    const row = getSettlementRows(gathering).find((item) => item.name === memberName)
    if (!row || row.balance >= 0) return
    setGatheringItems((current) => current.map((item) => item.id === gatheringId
      ? {
        ...item,
        participants: item.participants.map((person) => person.name === memberName
          ? { ...person, settlementStatus: status }
          : person),
      }
      : item))
  }

  const showFundMessage = (message: string) => {
    setCreatedMessage(message)
    window.setTimeout(() => setCreatedMessage(''), 3500)
  }

  const addFundActivity = (workspaceId: string, title: string, detail: string, amount: string, kind: FundActivity['kind'] = 'event') => {
    setFundHistory((current) => [{ id: Date.now(), workspaceId, title, detail, amount, kind, time: 'الآن' }, ...current])
  }

  const confirmContribution = (requestId: number, memberName: string) => {
    if (hasFirebaseConfig) {
      void import('./fundPaymentSync').then(({ confirmSyncedContribution }) => confirmSyncedContribution(requestId, memberName)).then((confirmed) => {
        if (!confirmed) return
        const request = useFundPaymentStore.getState().kattahRequests.find((item) => item.id === requestId)
        const contribution = request?.contributions.find((item) => item.name === memberName)
        if (request) addFundActivity(request.workspaceId, 'إشعار دفع بانتظار اعتماد المشرف', `${request.title} · ${memberName}`, `${money(contribution?.amount ?? 0)} ر.س`, 'pending')
        showFundMessage('تم تسجيل الدفع بانتظار المراجعة. لن يُضاف المبلغ للرصيد حتى اعتماده.')
      }).catch((error: unknown) => {
        console.error('Firestore contribution confirmation failed:', error)
        showFundMessage(`تعذر تسجيل تأكيد الدفع في Firestore: ${error instanceof Error ? error.message : String(error)}`)
      })
      return
    }
    if (!confirmContributionInStore(requestId, memberName)) return
    const request = useFundPaymentStore.getState().kattahRequests.find((item) => item.id === requestId)
    const contribution = request?.contributions.find((item) => item.name === memberName)
    if (request) addFundActivity(request.workspaceId, 'إشعار دفع بانتظار اعتماد المشرف', `${request.title} · ${memberName}`, `${money(contribution?.amount ?? 0)} ر.س`, 'pending')
    showFundMessage('تم تسجيل الدفع بانتظار المراجعة. لن يُضاف المبلغ للرصيد حتى اعتماده.')
  }

  const approveContribution = (requestId: number, memberName: string) => {
    const request = useFundPaymentStore.getState().kattahRequests.find((item) => item.id === requestId)
    const contribution = request?.contributions.find((item) => item.name === memberName)
    if (!request || !contribution || contribution.status !== 'awaiting') return
    const workspace = allFunds.find((fund) => fund.id === request.workspaceId)
    if (hasFirebaseConfig) {
      void import('./fundPaymentSync').then(({ decideSyncedContribution }) => decideSyncedContribution(requestId, memberName, 'paid', workspace?.balance ?? 0)).then((amount) => {
        if (amount === null) return
        addFundActivity(request.workspaceId, 'اعتماد مساهمة عضو', `${request.title} · ${memberName}`, `+ ${money(amount)} ر.س`, 'success')
        showFundMessage(`تم استلام دفعة ${memberName} واعتمادها وإضافتها إلى رصيد الصندوق.`)
      }).catch((error: unknown) => {
        console.error('Firestore contribution approval failed:', error)
        showFundMessage(`تعذر اعتماد الدفعة في Firestore: ${error instanceof Error ? error.message : String(error)}`)
      })
      return
    }
    const approved = approveContributionInStore(requestId, memberName, workspace?.balance ?? 0)
    if (!approved) return
    addFundActivity(request.workspaceId, 'اعتماد مساهمة عضو', `${request.title} · ${memberName}`, `+ ${money(contribution.amount)} ر.س`, 'success')
    showFundMessage(`تم استلام دفعة ${memberName} واعتمادها وإضافتها إلى رصيد الصندوق.`)
  }

  const rejectContribution = (requestId: number, memberName: string) => {
    if (hasFirebaseConfig) {
      void import('./fundPaymentSync').then(({ decideSyncedContribution }) => decideSyncedContribution(requestId, memberName, 'rejected', 0)).then((result) => {
        if (result === null) return
        const request = useFundPaymentStore.getState().kattahRequests.find((item) => item.id === requestId)
        const contribution = request?.contributions.find((item) => item.name === memberName)
        if (request) addFundActivity(request.workspaceId, 'رفض إشعار الدفع', `${request.title} · ${memberName}`, `${money(contribution?.amount ?? 0)} ر.س`, 'pending')
        showFundMessage(`تم تسجيل أن حوالة ${memberName} لم تصل. يمكنه تأكيد الدفع مجددًا بعد التحويل.`)
      }).catch((error: unknown) => {
        console.error('Firestore contribution rejection failed:', error)
        showFundMessage(`تعذر رفض الدفعة في Firestore: ${error instanceof Error ? error.message : String(error)}`)
      })
      return
    }
    if (!rejectContributionInStore(requestId, memberName)) return
    const request = useFundPaymentStore.getState().kattahRequests.find((item) => item.id === requestId)
    const contribution = request?.contributions.find((item) => item.name === memberName)
    if (request) addFundActivity(request.workspaceId, 'رفض إشعار الدفع', `${request.title} · ${memberName}`, `${money(contribution?.amount ?? 0)} ر.س`, 'pending')
    showFundMessage(`تم تسجيل أن حوالة ${memberName} لم تصل. يمكنه تأكيد الدفع مجددًا بعد التحويل.`)
  }

  const approveAllContributions = (requestId: number) => {
    const request = useFundPaymentStore.getState().kattahRequests.find((item) => item.id === requestId)
    if (!request) return
    const workspace = allFunds.find((fund) => fund.id === request.workspaceId)
    if (hasFirebaseConfig) {
      void import('./fundPaymentSync').then(({ approveAllSyncedContributions }) => approveAllSyncedContributions(requestId, workspace?.balance ?? 0)).then((result) => {
        if (!result.count) return
        addFundActivity(request.workspaceId, 'اعتماد جماعي للمساهمات', `${request.title} · ${result.count} أعضاء`, `+ ${money(result.total)} ر.س`, 'success')
        showFundMessage(`تم استلام واعتماد ${result.count} دفعة وإضافتها إلى رصيد الصندوق.`)
      }).catch((error: unknown) => {
        console.error('Firestore batch contribution approval failed:', error)
        showFundMessage(`تعذر اعتماد الدفعات في Firestore: ${error instanceof Error ? error.message : String(error)}`)
      })
      return
    }
    const pending = approveAwaitingInStore(requestId, workspace?.balance ?? 0)
    if (!pending.length) return
    const totalApproved = pending.reduce((sum, contribution) => sum + contribution.amount, 0)
    addFundActivity(request.workspaceId, 'اعتماد جماعي للمساهمات', `${request.title} · ${pending.length} أعضاء`, `+ ${money(totalApproved)} ر.س`, 'success')
    showFundMessage(`تم استلام واعتماد ${pending.length} دفعة وإضافتها إلى رصيد الصندوق.`)
  }

  const reportObligationPayment = (obligationId: number) => {
    const obligation = obligations.find((item) => item.id === obligationId)
    setObligations((current) => current.map((item) => item.id === obligationId ? { ...item, status: 'awaiting' } : item))
    if (obligation) addFundActivity(obligation.workspaceId, 'إشعار سداد بانتظار الاعتماد', obligation.title, `${money(obligation.amount)} ر.س`, 'pending')
    showFundMessage('سُجل إشعار السداد وبانتظار اعتماد المشرف.')
  }

  const approveObligationPayment = (obligationId: number) => {
    const obligation = obligations.find((item) => item.id === obligationId)
    if (!obligation || obligation.status !== 'awaiting') return
    setObligations((current) => current.map((item) => item.id === obligationId ? { ...item, status: 'paid' } : item))
    const workspace = allFunds.find((fund) => fund.id === obligation.workspaceId)
    adjustFundBalance(obligation.workspaceId, -obligation.amount, workspace?.balance ?? 0)
    addFundActivity(obligation.workspaceId, 'اعتماد سداد التزام', obligation.title, `− ${money(obligation.amount)} ر.س`, 'success')
    showFundMessage('تم اعتماد المصروف وتسجيله في السجل المحاسبي للصندوق.')
  }

  const createReimbursement = (workspaceId: string, title: string, amount: number, receipt: string) => {
    setReimbursements((current) => [{ id: Date.now(), workspaceId, title, member: 'محمد السالم', amount, receipt, status: 'review' }, ...current])
    addFundActivity(workspaceId, 'طلب تعويض جديد', `${title} · محمد السالم`, `${money(amount)} ر.س`, 'pending')
    showFundMessage('أُرسل طلب التعويض للمراجعة. لن يُسجل الصرف قبل اعتماد المشرف.')
  }

  const createKattahRequest = (workspaceId: string, title: string, total: number, cadence: string, due: string) => {
    const members = ['أحمد العتيبي', 'سارة محمد', 'خالد الحربي', 'عبدالله فهد', 'نورة سعد', 'محمد السالم', 'فهد علي', 'ريم خالد']
    const share = Math.floor((total / members.length) * 100) / 100
    const contributions = members.map((name, index) => ({
      name,
      amount: index === members.length - 1 ? Math.round((total - share * (members.length - 1)) * 100) / 100 : share,
      status: 'unpaid' as const,
    }))
    const request = { id: Date.now(), workspaceId, title, cadence, total, due, contributions }
    if (hasFirebaseConfig) {
      void import('./fundPaymentSync').then(({ createSyncedRequest }) => createSyncedRequest(request)).then(() => {
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
    setObligations((current) => [{ id: Date.now(), workspaceId, title, amount, cadence, due, status: 'upcoming' }, ...current])
    addFundActivity(workspaceId, 'إضافة التزام للصندوق', `${title} · ${cadence} · ${due}`, `${money(amount)} ر.س`)
    showFundMessage('تمت إضافة الالتزام إلى سجل الصندوق.')
  }

  const decideReimbursement = (reimbursementId: number, status: Reimbursement['status']) => {
    const reimbursement = reimbursements.find((item) => item.id === reimbursementId)
    if (!reimbursement || reimbursement.status !== 'review') return
    setReimbursements((current) => current.map((item) => item.id === reimbursementId ? { ...item, status } : item))
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

  const confirmReimbursementReceipt = (reimbursementId: number, received: boolean) => {
    setReimbursements((current) => current.map((item) => item.id === reimbursementId
      ? { ...item, status: received ? 'received' : 'objection' }
      : item))
    const reimbursement = reimbursements.find((item) => item.id === reimbursementId)
    if (reimbursement) addFundActivity(reimbursement.workspaceId, received ? 'تأكيد استلام التعويض' : 'اعتراض: لم يصل التعويض', `${reimbursement.title} · ${reimbursement.member}`, `${money(reimbursement.amount)} ر.س`, received ? 'success' : 'pending')
    showFundMessage(received ? 'تم تأكيد استلام التعويض.' : 'تم تسجيل اعتراض المستفيد على عدم الاستلام.')
  }

  const addPerson = () => {
    setPeople((current) => [...current, `عضو ${current.length}`])
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

        <div className="workspace-switcher">
          <div className="workspace-avatar">ع</div>
          <div className="workspace-copy">
            <span>مساحة العمل</span>
            <strong>مجموعة الأصدقاء</strong>
          </div>
          <ChevronDown size={16} />
        </div>

        <span className="nav-heading">القائمة الرئيسية</span>
        <nav className="side-nav" aria-label="التنقل الرئيسي">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-link ${activeView === id ? 'active' : ''}`} onClick={() => openView(id)}>
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
              {id === 'activity' &&                             <span className="nav-count">3</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-divider" />
        <div className="side-section-heading">
          <span className="nav-heading">صناديقي</span>
          <button className="icon-button mini" aria-label="إنشاء صندوق" onClick={() => openView('funds')}><Plus size={16} /></button>
        </div>
        {allFunds.map((fund) => (
          <button key={fund.id} className={`side-fund ${selectedWorkspaceId === fund.id ? 'active' : ''}`} aria-current={selectedWorkspaceId === fund.id ? 'page' : undefined} onClick={() => openWorkspace(fund.id)}>
            <span className={`side-fund-icon ${fund.color}`}>{fund.icon}</span>
            <span>{fund.title}</span>
            <span className="side-fund-dot" />
          </button>
        ))}

        <div className="sidebar-bottom">
          <button className="profile-button" onClick={() => setProfileSettingsOpen(true)} aria-label="إعدادات الحساب ووسيلة التحويل">
            <span className="profile-avatar">م</span>
            <span className="profile-copy"><strong>محمد السالم</strong><small>الحساب الشخصي</small></span>
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
                  <button onClick={() => startCreate('fund')}><Wallet size={17} /><span><strong>صندوق جديد</strong><small>للمصروفات المستمرة</small></span></button>
                  <button onClick={() => startCreate('gathering')}><UsersRound size={17} /><span><strong>جمعة جديدة</strong><small>للمناسبات والطلعات</small></span></button>
                  <button onClick={() => openView('split')}><ArrowLeftRight size={17} /><span><strong>قسمة سريعة</strong><small>قسّم مبلغًا على المجموعة</small></span></button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="page-content">
          <div className={`payment-sync-notice sync-${gatheringSyncError || firestoreError ? 'error' : firestoreStatus}`} role="status">
            {(gatheringSyncError || firestoreError) && `تعذرت مزامنة Firestore: ${gatheringSyncError || firestoreError}`}
            {!gatheringSyncError && !firestoreError && firestoreStatus === 'connected' && `متصل بـ Firestore (${import.meta.env.VITE_FIREBASE_PROJECT_ID})؛ الجمعات والمساهمات تتزامن مباشرة.`}
            {!gatheringSyncError && !firestoreError && firestoreStatus === 'connecting' && 'جار الاتصال بـ Firestore؛ إجراءات الدفع متوقفة حتى اكتمال المزامنة.'}
            {!gatheringSyncError && !firestoreError && firestoreStatus === 'error' && 'تعذّر الاتصال بـ Firestore.'}
            {!hasFirebaseConfig && 'تنبيه: Firebase غير مهيأ؛ البيانات محفوظة محلياً في هذا المتصفح فقط.'}
          </div>
          {createdMessage && <div className="toast-message"><CircleCheck size={17} />{createdMessage}</div>}
          {activeView === 'overview' && <Overview onNavigate={openView} onOpenWorkspace={openWorkspace} funds={allFunds} gatherings={allGatherings} />}
          {(activeView === 'funds' || activeView === 'workspace') && (activeView === 'workspace' && !selectedWorkspace
            ? <div className="panel workspace-not-found"><h1>الصندوق غير موجود</h1><p>تعذر العثور على هذه المجموعة.</p><button className="button-primary" onClick={() => openView('funds')}>عرض جميع الصناديق</button></div>
            : <FundsView
            onNavigate={openView}
            onOpenWorkspace={openWorkspace}
            onCreate={() => startCreate('fund')}
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
            onLanguageChange={setGatheringsLanguage}
            onNavigate={openView}
            onCreate={() => startCreate('gathering')}
            gatherings={allGatherings}
            onVote={voteOnGathering}
            onCancelGathering={cancelGathering}
            onAddLateParticipant={addLateGatheringParticipant}
            onAddExpense={addGatheringExpense}
            onAddTask={addGatheringTask}
            onClaimTask={claimGatheringTask}
            onSetSettlementStatus={setGatheringSettlementStatus}
            onCopySettlementDetails={copySettlementDetails}
            onDeadline={(gatheringId, attendees) => {
              const gathering = gatheringItems.find((item) => item.id === gatheringId)
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
          {activeView === 'activity' && <ActivityView onNavigate={openView} />}
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
            <span className="date-line">{createKind === 'fund' ? 'مصروفاتكم المستمرة' : gatheringsLanguage === 'ar' ? 'خططوا لها سوا' : 'Plan it together'}</span>
            <h2>{createKind === 'fund' ? 'أنشئ صندوقًا جديدًا' : gatheringsLanguage === 'ar' ? 'رتّبوا جمعتكم الجاية' : 'Create a gathering'}</h2>
            <p>{createKind === 'fund' ? 'اجمع التزامات ومصروفات مجموعتك في مكان واحد.' : gatheringsLanguage === 'ar' ? 'اختر موعدًا سريعًا وحدد آخر وقت لقبول الدعوة.' : 'Choose a quick date and set the RSVP deadline.'}</p>
            <label className="modal-field"><span>{createKind === 'fund' ? 'اسم الصندوق' : gatheringsLanguage === 'ar' ? 'عنوان الجمعة' : 'Gathering title'}</span><input autoFocus required value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder={createKind === 'fund' ? 'مثال: سكن الأصدقاء' : gatheringsLanguage === 'ar' ? 'مثال: عشاء فريق العمل' : 'e.g. Team dinner'} /></label>
            {createKind === 'fund' ? (
              <label className="modal-field"><span>أقرب التزام (اختياري)</span><input value={createDetail} onChange={(event) => setCreateDetail(event.target.value)} placeholder="مثال: فاتورة الإنترنت · ١ نوفمبر" /></label>
            ) : (
              <>
                <label className="modal-field"><span>{gatheringsLanguage === 'ar' ? 'الموقع' : 'Location'}</span><input value={gatheringLocation} onChange={(event) => setGatheringLocation(event.target.value)} placeholder={gatheringsLanguage === 'ar' ? 'مثال: استراحة الشباب' : 'e.g. The cabin'} /></label>
                <div className="modal-field">
                  <span>{gatheringsLanguage === 'ar' ? 'اختر اليوم · خلال الأسبوعين القادمين' : 'Choose a day · next 14 days'}</span>
                  <div className="mini-date-selector" role="group" aria-label={gatheringsLanguage === 'ar' ? 'اختر يوم المناسبة' : 'Choose gathering date'}>
                    {Array.from({ length: 14 }, (_, dayOffset) => {
                      const date = new Date(eventTimeFor(dayOffset, '12:00'))
                      const selected = gatheringDayOffset === dayOffset
                      const isToday = dayOffset === 0
                      const dateLabel = new Intl.DateTimeFormat(gatheringsLanguage === 'ar' ? 'ar-SA' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' }).format(date)
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
                          <span>{isToday ? (gatheringsLanguage === 'ar' ? 'اليوم' : 'Today') : new Intl.DateTimeFormat(gatheringsLanguage === 'ar' ? 'ar-SA' : 'en-US', { weekday: 'short' }).format(date)}</span>
                          <strong>{new Intl.DateTimeFormat(gatheringsLanguage === 'ar' ? 'ar-SA' : 'en-US', { day: 'numeric' }).format(date)}</strong>
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
            <div className="modal-actions"><button type="button" className="button-outline" onClick={() => setCreateKind(null)}>{createKind === 'fund' || gatheringsLanguage === 'ar' ? 'إلغاء' : 'Cancel'}</button><button type="submit" className="button-primary"><Plus size={16} /> {createKind === 'fund' ? 'إنشاء الصندوق' : gatheringsLanguage === 'ar' ? 'إنشاء الجمعة' : 'Create gathering'}</button></div>
            {createKind === 'fund' && <small className="modal-prototype-note">نموذج أولي · تُحفظ الإضافة لهذه الجلسة فقط</small>}
          </form>
        </div>
      )}
      {profileSettingsOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileSettingsOpen(false) }}>
          <form className="create-modal profile-settings-modal" onSubmit={(event) => {
            event.preventDefault()
            setProfileSettingsOpen(false)
            showFundMessage('تم حفظ وسيلة التحويل المفضلة في هذه الجلسة.')
          }}>
            <button type="button" className="icon-button modal-close" aria-label="إغلاق" onClick={() => setProfileSettingsOpen(false)}><X size={18} /></button>
            <span className="modal-icon"><CreditCard size={21} /></span>
            <span className="date-line">إعدادات الحساب</span>
            <h2>وسيلة التحويل المفضلة</h2>
            <p>تظهر هذه البيانات عند نسخ مستحقاتك في تسوية الجمعة.</p>
            <label className="modal-field"><span>وسيلة التحويل</span><select value={paymentProfile.method} onChange={(event) => setPaymentProfile((current) => ({ ...current, method: event.target.value as PaymentMethod }))}><option value="iban">IBAN</option><option value="stcPay">stc pay</option><option value="urpay">urpay</option><option value="phone">رقم الجوال</option></select></label>
            <label className="modal-field"><span>{paymentProfile.method === 'iban' ? 'رقم الآيبان' : paymentProfile.method === 'phone' ? 'رقم الجوال' : 'رقم الحساب أو الجوال'}</span><input value={paymentProfile.details} onChange={(event) => setPaymentProfile((current) => ({ ...current, details: event.target.value }))} placeholder={paymentProfile.method === 'iban' ? 'SA...' : '05xxxxxxxx'} /></label>
            <div className="modal-actions"><button type="button" className="button-outline" onClick={() => setProfileSettingsOpen(false)}>إلغاء</button><button type="submit" className="button-primary"><Check size={16} /> حفظ الإعدادات</button></div>
          </form>
        </div>
      )}
    </div>
  )
}

function Overview({ onNavigate, onOpenWorkspace, funds: currentFunds, gatherings: currentGatherings }: { onNavigate: (view: View) => void; onOpenWorkspace: (workspaceId: string) => void; funds: Fund[]; gatherings: Gathering[] }) {
  return (
    <>
      <section className="welcome-row">
        <div>
          <div className="date-line"><CalendarDays size={15} /> الثلاثاء، ٢٧ أكتوبر ٢٠٢٦</div>
          <h1>هلا محمد <span>👋</span></h1>
          <p>هذي لمحة سريعة عن حسابك ومصروفاتك المشتركة والتزاماتك.</p>
        </div>
        <button className="button-primary welcome-cta" onClick={() => onNavigate('split')}><Plus size={17} /> سجّل مصروف</button>
      </section>

      <section className="stats-grid" aria-label="ملخص الحساب">
        <StatCard icon={Wallet} color="green" label="إجمالي الصناديق" amount="٤٬٢٥٠" suffix="ر.س" note="في ٣ صناديق نشطة" trend="+ ٨٪" />
        <StatCard icon={ArrowUpLeft} color="peach" label="مبالغ لك" amount="٦٧٨" suffix="ر.س" note="من ٤ أعضاء" trend="مستحق لك" />
        <StatCard icon={ArrowDownLeft} color="lavender" label="مبالغ عليك" amount="٢٤٠" suffix="ر.س" note="على ٣ عمليات" trend="عليك تسويتها" />
        <StatCard icon={UsersRound} color="blue" label="الجمعات القادمة" amount="٢" suffix="جمعات" note="أقربها الجمعة القادمة" trend="قريبًا" />
      </section>

      <section className="content-grid">
        <div className="panel expenses-panel">
          <div className="panel-heading">
            <div><h2>آخر العمليات</h2><p>تابع مصروفاتك المشتركة أولًا بأول</p></div>
            <button className="text-button" onClick={() => onNavigate('activity')}>عرض الكل <ArrowUpLeft size={15} /></button>
          </div>
          <div className="expense-list">
            {expenses.map((expense) => {
              const Icon = expense.icon
              return (
                <div className="expense-row" key={expense.name}>
                  <span className={`expense-icon ${expense.color}`}><Icon size={19} /></span>
                  <div className="expense-details"><strong>{expense.name}</strong><span>{expense.group} <i /> {expense.person}</span></div>
                  <div className="expense-amount"><strong>{money(expense.amount)} <small>ر.س</small></strong><span className={`status-label ${expense.status === 'تمت التسوية' ? 'status-done' : ''}`}>{expense.status === 'تمت التسوية' ? <CircleCheck size={12} /> : <Clock3 size={12} />}{expense.status}</span></div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="panel upcoming-panel">
          <div className="panel-heading">
            <div><h2>التزاماتك القادمة</h2><p>لا تفوّت موعد أي التزام</p></div>
            <button className="icon-button mini" aria-label="عرض التقويم"><CalendarDays size={17} /></button>
          </div>
          <div className="due-card">
            <span className="due-date"><strong>٢٨</strong><small>أكتوبر</small></span>
            <div className="due-copy"><strong>فاتورة الكهرباء</strong><span>استراحة الشباب · بعد يوم</span></div>
            <strong className="due-amount">٣٨٠ <small>ر.س</small></strong>
          </div>
          <div className="due-card">
            <span className="due-date due-date-purple"><strong>٠١</strong><small>نوفمبر</small></span>
            <div className="due-copy"><strong>الإيجار الشهري</strong><span>سكن الروضة · بعد ٥ أيام</span></div>
            <strong className="due-amount">٢٬٤٠٠ <small>ر.س</small></strong>
          </div>
          <button className="panel-link" onClick={() => onNavigate('funds')}>كل الالتزامات <ArrowUpLeft size={15} /></button>
        </div>
      </section>

      <section className="section-block">
        <div className="panel-heading section-heading">
          <div><h2>مساحاتك</h2><p>صناديقك وجمعاتك المشتركة في مكان واحد</p></div>
          <button className="text-button" onClick={() => onNavigate('funds')}>عرض الكل <ArrowUpLeft size={15} /></button>
        </div>
        <div className="fund-cards">
          {currentFunds.map((fund) => <FundCard key={fund.id} fund={fund} onClick={() => onOpenWorkspace(fund.id)} />)}
        </div>
      </section>

      <section className="bottom-grid">
        <div className="panel gatherings-panel">
          <div className="panel-heading">
            <div><h2>جمعاتك القادمة</h2><p>خطّط لها من بدري</p></div>
            <button className="text-button" onClick={() => onNavigate('gatherings')}>كل الجمعات <ArrowUpLeft size={15} /></button>
          </div>
          {currentGatherings.slice(0, 1).map((gathering) => (
            <div className="gathering-preview" key={gathering.title}>
              <div className="gathering-emoji">{gathering.icon}</div>
              <div className="gathering-info"><strong>{gathering.title}</strong><span><CalendarDays size={13} /> {gathering.date} <i /> {gathering.attendees} أكدوا حضورهم</span></div>
              <span className="pill green-pill">{gathering.badge}</span>
            </div>
          ))}
        </div>
        <div className="tip-card">
          <span className="tip-icon"><Sparkles size={18} /></span>
          <span className="tip-eyebrow">نصيحة نسق</span>
          <h3>الوضوح يخلّي الوناسة تدوم</h3>
          <p>سجّل المصروف وقت حدوثه، وتعرّف على حصة كل عضو بسهولة.</p>
          <button onClick={() => onNavigate('split')}>جرّب القسمة السريعة <ArrowUpLeft size={15} /></button>
          <span className="tip-decoration">ق</span>
        </div>
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
      <span className="fund-members"><UsersRound size={14} /> {fund.members} أعضاء</span>
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

function FundsView({
  onNavigate,
  onOpenWorkspace,
  onCreate,
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
  funds: Fund[]
  workspace?: Fund
  requests: KattahRequest[]
  obligations: Obligation[]
  reimbursements: Reimbursement[]
  history: FundActivity[]
  firestoreStatus: 'local' | 'connecting' | 'connected' | 'error'
  onConfirmContribution: (requestId: number, memberName: string) => void
  onApproveContribution: (requestId: number, memberName: string) => void
  onRejectContribution: (requestId: number, memberName: string) => void
  onApproveAllContributions: (requestId: number) => void
  onReportObligationPayment: (obligationId: number) => void
  onApproveObligationPayment: (obligationId: number) => void
  onCreateReimbursement: (workspaceId: string, title: string, amount: number, receipt: string) => void
  onCreateKattahRequest: (workspaceId: string, title: string, total: number, cadence: string, due: string) => void
  onCreateObligation: (workspaceId: string, title: string, amount: number, cadence: string, due: string) => void
  onDecideReimbursement: (reimbursementId: number, status: Reimbursement['status']) => void
  onConfirmReimbursementReceipt: (reimbursementId: number, received: boolean) => void
}) {
  const [formKind, setFormKind] = useState<FundFormKind | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formCadence, setFormCadence] = useState('شهري')
  const [formDue, setFormDue] = useState('')
  const [receiptName, setReceiptName] = useState('')

  const selectedFund = workspace ?? currentFunds[0]
  const workspaceId = selectedFund?.id ?? funds[0].id
  const currentRequests = workspace ? requests.filter((request) => request.workspaceId === workspace.id) : requests
  const currentObligations = workspace ? obligations.filter((obligation) => obligation.workspaceId === workspace.id) : obligations
  const currentReimbursements = workspace ? reimbursements.filter((request) => request.workspaceId === workspace.id) : reimbursements
  const currentHistory = workspace ? history.filter((item) => item.workspaceId === workspace.id) : history
  const currentRequest = currentRequests[0]
  const sortedContributions = currentRequest ? orderedContributions(currentRequest.contributions) : []
  const confirmedContributions = sortedContributions.filter((item) => item.status === 'awaiting' || item.status === 'paid')
  const confirmationRanks = new Map(confirmedContributions.map((item, index) => [item.name, index + 1]))
  const firstConfirmer = confirmedContributions[0]?.name
  const currentMemberPayment = currentRequest?.contributions.find((item) => item.name === currentUserName)
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

    if (formKind === 'kattah') onCreateKattahRequest(workspaceId, title, amount, formCadence, formDue.trim() || 'يُحدّد لاحقًا')
    if (formKind === 'obligation') onCreateObligation(workspaceId, title, amount, formCadence, formDue.trim() || 'يُحدّد لاحقًا')
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
          <div className="balance-title"><span className="balance-wallet"><Wallet size={19} /></span><span><small>الصندوق المحدد</small><strong>{selectedFund?.title ?? 'صندوق المجموعة'}</strong></span></div>
          <span className="balance-caption">{workspace ? 'الرصيد الحالي للصندوق' : 'الرصيد التراكمي المسجّل'}</span>
          <strong className="balance-amount">{money(selectedFund?.balance ?? 0)} <small>ر.س</small></strong>
        </div>
        <div className="goal-progress">
          <div className="goal-heading"><span><strong>هدف التحصيل الشهري</strong><small>قطية أكتوبر · {currentRequest?.title ?? 'لا توجد قطية نشطة'}</small></span><strong>{Math.round(Math.min(collectedAmount / goal, 1) * 100)}<small>%</small></strong></div>
          <div className="goal-track"><span style={{ width: `${Math.min(collectedAmount / goal, 1) * 100}%` }} /></div>
          <div className="goal-amounts"><span>تم تحصيل <strong>{money(collectedAmount)} ر.س</strong></span><span>الهدف <strong>{money(goal)} ر.س</strong></span></div>
          <div className="balance-mini-stats"><span><Check size={14} /> {paidContributions.length} دفعوا</span><span><Clock3 size={14} /> {awaitingContributions.length} بانتظار الاعتماد</span><span><CalendarDays size={14} /> {money(totalDue)} ر.س التزامات قادمة</span></div>
        </div>
      </section>

      {workspace && <section className="panel workspace-members-panel">
        <div className="panel-heading"><div><h2>أعضاء المجموعة</h2><p>{workspace.members} أعضاء</p></div><UsersRound size={19} /></div>
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
            {formKind !== 'reimbursement' && <label><span>نوع الاستحقاق</span><select value={formCadence} onChange={(event) => setFormCadence(event.target.value)}><option>فوري</option><option>شهري</option><option>سنوي</option></select></label>}
            {formKind !== 'reimbursement' && <label><span>تاريخ الاستحقاق</span><input value={formDue} onChange={(event) => setFormDue(event.target.value)} placeholder="مثال: ١ نوفمبر ٢٠٢٦" /></label>}
            {formKind === 'reimbursement' && <label className="receipt-upload"><span>إيصال الشراء</span><span className="receipt-picker"><ReceiptText size={14} />{receiptName || 'اختر صورة أو ملف PDF لإرفاقه'}<input type="file" accept="image/*,.pdf" onChange={(event) => setReceiptName(event.target.files?.[0]?.name ?? '')} /></span></label>}
          </div>
          {formKind === 'reimbursement' && <p className="fund-form-note"><ShieldCheck size={14} /> الإيصال يبقى ضمن هذا النموذج التجريبي ولا يُرفع إلى خادم.</p>}
          <div className="fund-form-footer"><button type="button" className="button-outline" onClick={() => setFormKind(null)}>إلغاء</button><button type="submit" className="button-primary"><Check size={15} /> {formKind === 'kattah' ? 'إنشاء الطلب وتوزيعه' : formKind === 'obligation' ? 'إضافة الالتزام' : 'إرسال للمراجعة'}</button></div>
        </form>
      )}

      <section className="panel kattah-panel fund-section-panel">
        <div className="panel-heading"><div><span className="section-kicker">الاشتراكات والمساهمات</span><h2>القطية والاشتراك الشهري</h2><p>آلية موحّدة: يؤكد العضو الدفع، ثم يعتمد المسؤول وصول الحوالة لإضافة المبلغ للرصيد.</p></div><div className="kattah-header-actions"><span className="pill green-pill">{currentRequest?.cadence ?? 'شهري'}</span>{awaitingContributions.length > 0 && <button className="button-primary batch-approve" disabled={!paymentActionsEnabled} onClick={() => currentRequest && onApproveAllContributions(currentRequest.id)}><Check size={14} /> اعتماد المنتظرين ({awaitingContributions.length})</button>}</div></div>
        {currentRequest ? (
          <>
            <div className="contribution-primary-action">
              {canConfirmPayment
                ? <button className="button-primary" disabled={!paymentActionsEnabled} onClick={() => onConfirmContribution(currentRequest.id, currentUserName)}><Check size={16} /> تأكيد الدفع</button>
                : currentMemberPayment && <PaymentBadge status={currentMemberPayment.status} />}
              {canConfirmPayment && <small>تأكيدك سيظهر في أعلى القائمة، ولا يضاف المبلغ للرصيد قبل الاعتماد.</small>}
            </div>
            <div className="request-summary">
              <span><strong>{currentRequest.title}</strong><small>الاستحقاق {currentRequest.due}</small></span>
              <span><strong>{money(currentRequest.total)} ر.س</strong><small>الحصة المتوقعة لكل عضو</small></span>
              <span><strong>{paidContributions.length} من {currentRequest.contributions.length}</strong><small>تأكيدات معتمدة</small></span>
            </div>
            <div className="contribution-list">
              {sortedContributions.map((contribution) => (
                <div className="contribution-row" key={`${currentRequest.id}-${contribution.name}`}>
                  <span className={`person-avatar person-${contribution.name.length % 4}`}>{contribution.name.slice(0, 1)}</span>
                  <span className="contribution-name"><strong>{confirmationRanks.has(contribution.name) && `${confirmationRanks.get(contribution.name)}- `}{contribution.name}{contribution.name === firstConfirmer && <span className="first-confirmer-badge">⚡ أول المسددين</span>}</strong><small>{money(contribution.amount)} ر.س</small></span>
                  <PaymentBadge status={contribution.status} />
                  {contribution.status === 'unpaid' && <span className="member-waiting">بانتظار العضو</span>}
                  {contribution.status === 'rejected' && contribution.name !== currentUserName && <span className="member-waiting">لم تُستلم الحوالة</span>}
                  {contribution.status === 'awaiting' && <span className="review-actions"><button className="button-outline row-action approve-action" disabled={!paymentActionsEnabled} onClick={() => onApproveContribution(currentRequest.id, contribution.name)}><Check size={13} /> تم الاستلام</button><button className="reject-action" disabled={!paymentActionsEnabled} onClick={() => onRejectContribution(currentRequest.id, contribution.name)}>لم تصل الحوالة</button></span>}
                  {contribution.status === 'paid' && <span className="verified-mark"><CircleCheck size={15} /></span>}
                </div>
              ))}
            </div>
          </>
        ) : <EmptyState message="لا توجد طلبات قطية نشطة." />}
      </section>

      <section className="panel fund-section-panel">
        <div className="panel-heading"><div><span className="section-kicker">مصروفات دورية أو طارئة</span><h2>الالتزامات المستقرة</h2><p>سجّلوا الاستحقاق وتابعوا إشعار السداد واعتماد المشرف.</p></div><button className="text-button" onClick={() => { setFormKind('obligation'); setFormTitle(''); setFormAmount(''); setFormDue('') }}><Plus size={15} /> إضافة التزام</button></div>
        <div className="obligation-list">
          {currentObligations.map((obligation) => (
            <div className="obligation-row" key={obligation.id}>
              <span className={`obligation-icon ${obligation.status === 'due' ? 'due' : ''}`}><ReceiptText size={17} /></span>
              <span className="obligation-name"><strong>{obligation.title}</strong><small>{obligation.cadence} · الاستحقاق {obligation.due}</small></span>
              <strong className="obligation-amount">{money(obligation.amount)} <small>ر.س</small></strong>
              <ObligationBadge status={obligation.status} />
              {obligation.status === 'paid' ? <span className="verified-mark"><CircleCheck size={15} /></span> : obligation.status === 'awaiting' ? <button className="button-outline row-action approve-action" onClick={() => onApproveObligationPayment(obligation.id)}><Check size={13} /> اعتماد السداد</button> : <button className="button-outline row-action" onClick={() => onReportObligationPayment(obligation.id)}>تسجيل السداد</button>}
            </div>
          ))}
          {currentObligations.length === 0 && <EmptyState message="لا توجد التزامات مسجلة." />}
        </div>
      </section>

      <section className="panel fund-section-panel">
        <div className="panel-heading"><div><span className="section-kicker">مصروفات دفعها عضو نيابة عن المجموعة</span><h2>طلبات التعويض والاسترداد</h2><p>راجعوا الإيصال، وسجّلوا الصرف، ثم انتظروا تأكيد المستفيد.</p></div><button className="text-button" onClick={() => { setFormKind('reimbursement'); setFormTitle(''); setFormAmount(''); setReceiptName('') }}><Plus size={15} /> طلب تعويض</button></div>
        {currentReimbursements.length ? <div className="reimbursement-list">
          {currentReimbursements.map((request) => (
            <div className="reimbursement-row" key={request.id}>
              <span className="expense-icon orange"><ReceiptText size={17} /></span>
              <span className="reimbursement-name"><strong>{request.title}</strong><small>طلبه {request.member} · الإيصال: {request.receipt}</small></span>
              <strong className="obligation-amount">{money(request.amount)} <small>ر.س</small></strong>
              <ReimbursementBadge status={request.status} />
              {request.status === 'review' && <span className="review-actions"><button className="button-outline row-action approve-action" onClick={() => onDecideReimbursement(request.id, 'awaiting-receipt')}><Check size={13} /> اعتماد وتسجيل الصرف</button><button className="reject-action" onClick={() => onDecideReimbursement(request.id, 'rejected')}>رفض</button></span>}
              {request.status === 'awaiting-receipt' && <span className="review-actions"><button className="button-outline row-action approve-action" onClick={() => onConfirmReimbursementReceipt(request.id, true)}>تأكيد الاستلام</button><button className="reject-action" onClick={() => onConfirmReimbursementReceipt(request.id, false)}>لم يصلني</button></span>}
            </div>
          ))}
        </div> : <EmptyState message="لا توجد طلبات تعويض." />}
      </section>

      <section className="panel fund-section-panel">
        <div className="panel-heading"><div><span className="section-kicker">سجل المجموعة</span><h2>المصروفات والسجلات</h2><p>العمليات المسجلة لهذه المجموعة فقط.</p></div>{!workspace && <button className="text-button" onClick={() => onNavigate('activity')}>السجل الكامل <ArrowUpLeft size={15} /></button>}</div>
        <FundHistoryRows history={currentHistory} />
      </section>

      {!workspace && <section className="section-block">
        <div className="panel-heading section-heading"><div><h2>كل الصناديق</h2><p>مساحات المصروفات المشتركة في حسابك</p></div><div className="filter-pills"><button className="selected">الكل <span>{currentFunds.length}</span></button><button>نشطة</button></div></div>
        <div className="fund-cards fund-cards-large">{currentFunds.map((fund) => <FundCard key={fund.id} fund={fund} onClick={() => onOpenWorkspace(fund.id)} />)}</div>
      </section>
      }
    </>
  )
}

function GatheringsView({
  language,
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
  const formatMoney = (value: number) => new Intl.NumberFormat(isEnglish ? 'en-SA' : 'ar-SA', { maximumFractionDigits: 2 }).format(value)

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
          const currentDecision = gathering.participants.find((person) => person.name === 'محمد السالم')?.decision
          const isOrganizer = gathering.createdById === currentUserId
          const displayDate = new Intl.DateTimeFormat(isEnglish ? 'en-US' : 'ar-SA', {
            weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
          }).format(gathering.eventAt)
          const deadlineLabel = new Intl.DateTimeFormat(isEnglish ? 'en-US' : 'ar-SA', {
            day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
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
              {closed && <div className="organizer-notice"><Bell size={14} /> {isEnglish ? `${joined.length} confirmed attendee${joined.length === 1 ? '' : 's'} — notify the organizer` : `تأكيد العدد النهائي: ${joined.length} مشارك · أبلغ المنشئ`}</div>}
              <div className="attendee-block">
                <div className="attendee-label"><span><UsersRound size={15} /> {isEnglish ? 'Confirmed' : 'تأكيدات الحضور'}</span><strong>{joined.length} <small>/ {gathering.participants.length}</small></strong></div>
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
            <div className="gathering-tasks-heading"><div><h3 id="gathering-tasks-heading">{isEnglish ? 'Tasks to organize' : 'مهام تحتاج تنظيم'}</h3><p>{isEnglish ? 'Claim a task to coordinate with the group.' : 'اختر مهمة لتسجيلها باسمك ومنع تكرار التكليف.'}</p></div><span>{selectedGathering.tasks.length}</span></div>
            {selectedGathering.createdById === currentUserId && <form className="task-entry-form" onSubmit={(event) => { event.preventDefault(); if (!taskTitle.trim()) return; onAddTask(selectedGathering.id, taskTitle); setTaskTitle('') }}><label className="modal-field"><span>{isEnglish ? 'New task' : 'مهمة جديدة'}</span><input required value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder={isEnglish ? 'e.g. Bring drinks' : 'مثال: شراء المشروبات'} /></label><button className="button-outline" type="submit"><Plus size={15} /> {isEnglish ? 'Add task' : 'إضافة مهمة'}</button></form>}
            <div className="gathering-task-list">{selectedGathering.tasks.map((task) => {
              const currentMemberJoined = selectedGathering.participants.some((person) => person.name === currentUserName && person.decision === 'joined')
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
        <ActivityRows compact />
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
          <div className="split-step-heading"><span className="step-number">١</span><div><h2>كم إجمالي المبلغ؟</h2><p>المبلغ اللي اندفع أو ودّكم تقسّمونه</p></div></div>
          <label className="amount-input-wrap"><input inputMode="decimal" type="number" min="0" step="0.01" value={amount} onChange={(event) => onAmountChange(event.target.value)} aria-label="إجمالي المبلغ" /><span>ر.س</span></label>
          <div className="split-divider" />
          <div className="split-step-heading"><span className="step-number">٢</span><div><h2>مين يشارك بالقسمة؟</h2><p>{people.length} أشخاص · اضغط على الاسم لتعديله</p></div></div>
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
            <div className="summary-row"><span>عدد المشاركين</span><strong>{people.length} أشخاص</strong></div>
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

function ActivityView({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <>
      <PageIntro eyebrow="كل شيء موثّق وواضح" title="سجل العمليات" description="تتبّعوا المصروفات والتعويضات وتأكيدات الاستلام في مكان واحد." action="قسمة جديدة" onAction={() => onNavigate('split')} />
      <section className="stats-grid activity-stats">
        <StatCard icon={ArrowUpLeft} color="green" label="إجمالي ما دُفع" amount="٥٬٢٨٠" suffix="ر.س" note="هذا الشهر" trend="مسجّل" />
        <StatCard icon={Clock3} color="peach" label="بانتظار التأكيد" amount="٦٧٨" suffix="ر.س" note="لا يعد تحويلًا مؤكدًا" trend="متابعة" />
        <StatCard icon={CircleCheck} color="lavender" label="عمليات مكتملة" amount="٢٤" suffix="عملية" note="خلال هذا الشهر" trend="مكتملة" />
        <StatCard icon={CircleAlert} color="blue" label="تحتاج مراجعة" amount="٢" suffix="طلبات" note="طلبات تعويض جديدة" trend="مراجعة" />
      </section>
      <section className="panel table-panel activity-table-panel">
        <div className="panel-heading"><div><h2>كل العمليات</h2><p>سجل المجموعة المالي · أكتوبر ٢٠٢٦</p></div><div className="filter-pills"><button className="selected">الكل <span>٢٤</span></button><button>مصروفات</button><button>تعويضات</button></div></div>
        <ActivityRows />
      </section>
      <div className="important-note"><ShieldCheck size={18} /><p><strong>عن التحويلات الخارجية</strong><span>تسجيل المحصّل للدفع لا يعني وصول التحويل. يكتمل السجل بعد تأكيد المستفيد استلامه، ويمكنه الاعتراض عند الحاجة.</span></p></div>
    </>
  )
}

function ActivityRows({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`activity-rows ${compact ? 'compact-rows' : ''}`}>
      {activityItems.map((item, index) => (
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
