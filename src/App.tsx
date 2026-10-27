import { useState } from 'react'
import type { FormEvent } from 'react'
import type { LucideIcon } from 'lucide-react'
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
  CreditCard,
  LayoutDashboard,
  MapPin,
  Menu,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRoundPlus,
  UsersRound,
  Wallet,
  X,
} from 'lucide-react'
import './App.css'

type View = 'overview' | 'funds' | 'gatherings' | 'split' | 'activity'
type CreateKind = 'fund' | 'gathering'
type Fund = { title: string; members: number; balance: number; icon: string; color: string; due: string }
type Gathering = { title: string; date: string; location: string; attendees: number; total: number; badge: string; badgeColor: string; icon: string }
type PaymentStatus = 'paid' | 'awaiting' | 'unpaid'
type Contribution = { name: string; amount: number; status: PaymentStatus }
type KattahRequest = { id: number; title: string; cadence: string; total: number; due: string; contributions: Contribution[] }
type Obligation = { id: number; title: string; amount: number; cadence: string; due: string; status: 'upcoming' | 'due' | 'awaiting' | 'paid' }
type Reimbursement = { id: number; title: string; member: string; amount: number; receipt: string; status: 'review' | 'awaiting-receipt' | 'received' | 'objection' | 'rejected' }
type FundActivity = { id: number; title: string; detail: string; amount: string; kind: 'pending' | 'success' | 'event'; time: string }

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
  { title: 'استراحة الشباب', members: 8, balance: 1260, icon: '🏡', color: 'mint', due: 'فاتورة الكهرباء · ٢٨ أكتوبر' },
  { title: 'سكن الروضة', members: 4, balance: 840, icon: '🏠', color: 'lavender', due: 'الإيجار الشهري · ١ نوفمبر' },
  { title: 'رحلة أبها', members: 6, balance: 2150, icon: '⛰️', color: 'peach', due: 'الحجز النهائي · ٥ نوفمبر' },
]

const initialKattahRequests: KattahRequest[] = [{
  id: 1,
  title: 'قطية مصروفات أكتوبر',
  cadence: 'شهرية',
  total: 2520,
  due: '٢٨ أكتوبر ٢٠٢٦',
  contributions: [
    { name: 'أحمد العتيبي', amount: 315, status: 'paid' },
    { name: 'سارة محمد', amount: 315, status: 'paid' },
    { name: 'خالد الحربي', amount: 315, status: 'paid' },
    { name: 'عبدالله فهد', amount: 315, status: 'paid' },
    { name: 'نورة سعد', amount: 315, status: 'awaiting' },
    { name: 'محمد السالم', amount: 315, status: 'unpaid' },
    { name: 'فهد علي', amount: 315, status: 'unpaid' },
    { name: 'ريم خالد', amount: 315, status: 'unpaid' },
  ],
}]

const initialObligations: Obligation[] = [
  { id: 1, title: 'فاتورة الكهرباء', amount: 380, cadence: 'شهري', due: '٢٨ أكتوبر ٢٠٢٦', status: 'due' },
  { id: 2, title: 'فاتورة الإنترنت', amount: 230, cadence: 'شهري', due: '١ نوفمبر ٢٠٢٦', status: 'upcoming' },
  { id: 3, title: 'الماء والصيانة', amount: 160, cadence: 'شهري', due: '٥ نوفمبر ٢٠٢٦', status: 'upcoming' },
]

const initialReimbursements: Reimbursement[] = [
  { id: 1, title: 'مقاضي ومستلزمات الاستراحة', member: 'أحمد العتيبي', amount: 248, receipt: 'فاتورة_المقاضي.jpg', status: 'review' },
]

const initialFundActivity: FundActivity[] = [
  { id: 1, title: 'اعتماد مساهمة شهر أكتوبر', detail: 'قطية مصروفات أكتوبر · أحمد العتيبي', amount: '+ ٣١٥ ر.س', kind: 'success', time: 'اليوم، ٩:١٥ ص' },
  { id: 2, title: 'إرسال طلب تعويض للمراجعة', detail: 'مقاضي ومستلزمات الاستراحة · أحمد العتيبي', amount: '٢٤٨ ر.س', kind: 'pending', time: 'أمس، ٦:٢٠ م' },
  { id: 3, title: 'إضافة التزام شهري', detail: 'فاتورة الكهرباء · استراحة الشباب', amount: '٣٨٠ ر.س', kind: 'event', time: '٢٥ أكتوبر، ١١:٤٠ ص' },
]

const gatherings: Gathering[] = [
  { title: 'عشاء نهاية الأسبوع', date: 'الجمعة، ٣٠ أكتوبر', location: 'اختروا المطعم', attendees: 7, total: 10, badge: 'التصويت مفتوح', badgeColor: 'green', icon: '🍽️' },
  { title: 'مباراة الهلال والنصر', date: 'السبت، ٣١ أكتوبر', location: 'استراحة الشباب', attendees: 8, total: 8, badge: 'اكتمل العدد', badgeColor: 'blue', icon: '⚽' },
]

const activityItems = [
  { title: 'أحمد أضاف مصروفًا جديدًا', detail: 'مقاضي الاستراحة · استراحة الشباب', amount: '+ ٢٤٨ ر.س', time: 'منذ ساعتين', kind: 'pending' },
  { title: 'تم تأكيد استلام التعويض', detail: 'فاتورة الإنترنت · سكن الروضة', amount: '٢٣٠ ر.س', time: 'أمس، ٨:٣٠ م', kind: 'success' },
  { title: 'تم إنشاء جمعة جديدة', detail: 'عشاء نهاية الأسبوع', amount: '٧ مشاركين', time: 'أمس، ٦:١٢ م', kind: 'event' },
]

const money = (value: number) =>
  new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 }).format(value)

function App() {
  const [activeView, setActiveView] = useState<View>('overview')
  const [menuOpen, setMenuOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [amount, setAmount] = useState('240')
  const [people, setPeople] = useState(['أنت', 'سارة', 'خالد', 'نورة'])
  const [customShares, setCustomShares] = useState(false)
  const [shares, setShares] = useState(['60', '60', '60', '60'])
  const [splitSaved, setSplitSaved] = useState(false)
  const [createKind, setCreateKind] = useState<CreateKind | null>(null)
  const [createdFunds, setCreatedFunds] = useState<Fund[]>([])
  const [createdGatherings, setCreatedGatherings] = useState<Gathering[]>([])
  const [createName, setCreateName] = useState('')
  const [createDetail, setCreateDetail] = useState('')
  const [createdMessage, setCreatedMessage] = useState('')
  const [fundBalances, setFundBalances] = useState<Record<string, number>>({})
  const [kattahRequests, setKattahRequests] = useState(initialKattahRequests)
  const [obligations, setObligations] = useState(initialObligations)
  const [reimbursements, setReimbursements] = useState(initialReimbursements)
  const [fundHistory, setFundHistory] = useState(initialFundActivity)
  const allFunds = [...funds, ...createdFunds].map((fund) => ({ ...fund, balance: fundBalances[fund.title] ?? fund.balance }))
  const allGatherings = [...gatherings, ...createdGatherings]

  const total = Number(amount) || 0
  const evenShare = people.length ? total / people.length : 0
  const pageTitle = navigation.find((item) => item.id === activeView)?.label ?? 'نظرة عامة'

  const openView = (view: View) => {
    setActiveView(view)
    setMenuOpen(false)
    setSidebarOpen(false)
    setSplitSaved(false)
  }

  const startCreate = (kind: CreateKind) => {
    setCreateKind(kind)
    setCreateName('')
    setCreateDetail('')
    setCreatedMessage('')
    setMenuOpen(false)
  }

  const saveNewItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = createName.trim()
    if (!name || !createKind) return

    if (createKind === 'fund') {
      setCreatedFunds((current) => [...current, {
        title: name,
        members: 1,
        balance: 0,
        icon: '✨',
        color: 'mint',
        due: createDetail.trim() || 'لا توجد التزامات قادمة',
      }])
    } else {
      setCreatedGatherings((current) => [...current, {
        title: name,
        date: createDetail.trim() || 'حدّدوا الموعد',
        location: 'بانتظار اختيار المكان',
        attendees: 0,
        total: 1,
        badge: 'التأكيد مفتوح',
        badgeColor: 'green',
        icon: '🎉',
      }])
    }

    setCreateKind(null)
    setCreatedMessage(`تمت إضافة ${createKind === 'fund' ? 'الصندوق' : 'الجمعة'} «${name}» إلى مساحة عملك.`)
    window.setTimeout(() => setCreatedMessage(''), 3500)
  }

  const showFundMessage = (message: string) => {
    setCreatedMessage(message)
    window.setTimeout(() => setCreatedMessage(''), 3500)
  }

  const addFundActivity = (title: string, detail: string, amount: string, kind: FundActivity['kind'] = 'event') => {
    setFundHistory((current) => [{ id: Date.now(), title, detail, amount, kind, time: 'الآن' }, ...current])
  }

  const updateContribution = (requestId: number, memberName: string, status: PaymentStatus) => {
    setKattahRequests((current) => current.map((request) => request.id === requestId
      ? { ...request, contributions: request.contributions.map((contribution) => contribution.name === memberName ? { ...contribution, status } : contribution) }
      : request))
  }

  const confirmContribution = (requestId: number, memberName: string) => {
    updateContribution(requestId, memberName, 'awaiting')
    const request = kattahRequests.find((item) => item.id === requestId)
    const contribution = request?.contributions.find((item) => item.name === memberName)
    addFundActivity('إشعار دفع بانتظار اعتماد المشرف', `${request?.title ?? 'قطية'} · ${memberName}`, `${money(contribution?.amount ?? 0)} ر.س`, 'pending')
    showFundMessage('تم تسجيل إشعار الدفع. سيظهر المبلغ في رصيد الصندوق بعد اعتماد المشرف.')
  }

  const approveContribution = (requestId: number, memberName: string) => {
    const request = kattahRequests.find((item) => item.id === requestId)
    const contribution = request?.contributions.find((item) => item.name === memberName)
    if (!request || !contribution || contribution.status !== 'awaiting') return
    updateContribution(requestId, memberName, 'paid')
    setFundBalances((current) => ({ ...current, [funds[0].title]: (current[funds[0].title] ?? funds[0].balance) + contribution.amount }))
    addFundActivity('اعتماد مساهمة عضو', `${request.title} · ${memberName}`, `+ ${money(contribution.amount)} ر.س`, 'success')
    showFundMessage(`اعتمدت دفعة ${memberName} محاسبيًا. يبقى تأكيد التحويل الخارجي مسؤولية المجموعة.`)
  }

  const approveAllContributions = (requestId: number) => {
    const request = kattahRequests.find((item) => item.id === requestId)
    if (!request) return
    const pending = request.contributions.filter((contribution) => contribution.status === 'awaiting')
    if (!pending.length) return
    const totalApproved = pending.reduce((sum, contribution) => sum + contribution.amount, 0)
    setKattahRequests((current) => current.map((item) => item.id === requestId
      ? { ...item, contributions: item.contributions.map((contribution) => contribution.status === 'awaiting' ? { ...contribution, status: 'paid' } : contribution) }
      : item))
    setFundBalances((current) => ({ ...current, [funds[0].title]: (current[funds[0].title] ?? funds[0].balance) + totalApproved }))
    addFundActivity('اعتماد جماعي للمساهمات', `${request.title} · ${pending.length} أعضاء`, `+ ${money(totalApproved)} ر.س`, 'success')
    showFundMessage(`تم اعتماد ${pending.length} دفعة محاسبيًا. لا يعني ذلك التحقق من التحويل البنكي نفسه.`)
  }

  const reportObligationPayment = (obligationId: number) => {
    const obligation = obligations.find((item) => item.id === obligationId)
    setObligations((current) => current.map((item) => item.id === obligationId ? { ...item, status: 'awaiting' } : item))
    if (obligation) addFundActivity('إشعار سداد بانتظار الاعتماد', obligation.title, `${money(obligation.amount)} ر.س`, 'pending')
    showFundMessage('سُجل إشعار السداد وبانتظار اعتماد المشرف.')
  }

  const approveObligationPayment = (obligationId: number) => {
    const obligation = obligations.find((item) => item.id === obligationId)
    if (!obligation || obligation.status !== 'awaiting') return
    setObligations((current) => current.map((item) => item.id === obligationId ? { ...item, status: 'paid' } : item))
    setFundBalances((current) => ({ ...current, [funds[0].title]: (current[funds[0].title] ?? funds[0].balance) - obligation.amount }))
    addFundActivity('اعتماد سداد التزام', obligation.title, `− ${money(obligation.amount)} ر.س`, 'success')
    showFundMessage('تم اعتماد المصروف وتسجيله في السجل المحاسبي للصندوق.')
  }

  const createReimbursement = (title: string, amount: number, receipt: string) => {
    setReimbursements((current) => [{ id: Date.now(), title, member: 'محمد السالم', amount, receipt, status: 'review' }, ...current])
    addFundActivity('طلب تعويض جديد', `${title} · محمد السالم`, `${money(amount)} ر.س`, 'pending')
    showFundMessage('أُرسل طلب التعويض للمراجعة. لن يُسجل الصرف قبل اعتماد المشرف.')
  }

  const createKattahRequest = (title: string, total: number, cadence: string, due: string) => {
    const members = ['أحمد العتيبي', 'سارة محمد', 'خالد الحربي', 'عبدالله فهد', 'نورة سعد', 'محمد السالم', 'فهد علي', 'ريم خالد']
    const share = Math.floor((total / members.length) * 100) / 100
    const contributions = members.map((name, index) => ({
      name,
      amount: index === members.length - 1 ? Math.round((total - share * (members.length - 1)) * 100) / 100 : share,
      status: 'unpaid' as const,
    }))
    setKattahRequests((current) => [{ id: Date.now(), title, cadence, total, due, contributions }, ...current])
    addFundActivity('إنشاء طلب قطية', `${title} · ${cadence} · ${due}`, `${money(total)} ر.س`)
    showFundMessage('تم إنشاء طلب القطية وتوزيع الحصص على أعضاء الصندوق.')
  }

  const createObligation = (title: string, amount: number, cadence: string, due: string) => {
    setObligations((current) => [{ id: Date.now(), title, amount, cadence, due, status: 'upcoming' }, ...current])
    addFundActivity('إضافة التزام للصندوق', `${title} · ${cadence} · ${due}`, `${money(amount)} ر.س`)
    showFundMessage('تمت إضافة الالتزام إلى سجل الصندوق.')
  }

  const decideReimbursement = (reimbursementId: number, status: Reimbursement['status']) => {
    const reimbursement = reimbursements.find((item) => item.id === reimbursementId)
    if (!reimbursement || reimbursement.status !== 'review') return
    setReimbursements((current) => current.map((item) => item.id === reimbursementId ? { ...item, status } : item))
    if (status === 'awaiting-receipt') {
      setFundBalances((current) => ({ ...current, [funds[0].title]: (current[funds[0].title] ?? funds[0].balance) - reimbursement.amount }))
      addFundActivity('اعتماد التعويض وتسجيل الصرف', `${reimbursement.title} · ${reimbursement.member}`, `− ${money(reimbursement.amount)} ر.س`, 'success')
      showFundMessage('سُجل صرف التعويض محاسبيًا. ينتظر تأكيد المستفيد لوصول التحويل الخارجي.')
    } else if (status === 'rejected') {
      addFundActivity('رفض طلب التعويض', `${reimbursement.title} · ${reimbursement.member}`, `${money(reimbursement.amount)} ر.س`, 'pending')
      showFundMessage('تم رفض طلب التعويض وتسجيل القرار في السجل.')
    }
  }

  const confirmReimbursementReceipt = (reimbursementId: number, received: boolean) => {
    setReimbursements((current) => current.map((item) => item.id === reimbursementId
      ? { ...item, status: received ? 'received' : 'objection' }
      : item))
    const reimbursement = reimbursements.find((item) => item.id === reimbursementId)
    if (reimbursement) addFundActivity(received ? 'تأكيد استلام التعويض' : 'اعتراض: لم يصل التعويض', `${reimbursement.title} · ${reimbursement.member}`, `${money(reimbursement.amount)} ر.س`, received ? 'success' : 'pending')
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
        {allFunds.slice(0, 2).map((fund) => (
          <button key={fund.title} className="side-fund" onClick={() => openView('funds')}>
            <span className={`side-fund-icon ${fund.color}`}>{fund.icon}</span>
            <span>{fund.title}</span>
            <span className="side-fund-dot" />
          </button>
        ))}

        <div className="sidebar-bottom">
          <div className="trust-card">
            <span className="trust-icon"><ShieldCheck size={18} /></span>
            <strong>أموالك تبقى لك</strong>
            <p>نسق ينظم حساباتكم، ولا يحتفظ بأموالكم.</p>
          </div>
          <button className="profile-button">
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
          {createdMessage && <div className="toast-message"><CircleCheck size={17} />{createdMessage}</div>}
          {activeView === 'overview' && <Overview onNavigate={openView} funds={allFunds} gatherings={allGatherings} />}
          {activeView === 'funds' && <FundsView
            onNavigate={openView}
            onCreate={() => startCreate('fund')}
            funds={allFunds}
            requests={kattahRequests}
            obligations={obligations}
            reimbursements={reimbursements}
            history={fundHistory}
            onConfirmContribution={confirmContribution}
            onApproveContribution={approveContribution}
            onApproveAllContributions={approveAllContributions}
            onReportObligationPayment={reportObligationPayment}
            onApproveObligationPayment={approveObligationPayment}
            onCreateReimbursement={createReimbursement}
            onCreateKattahRequest={createKattahRequest}
            onCreateObligation={createObligation}
            onDecideReimbursement={decideReimbursement}
            onConfirmReimbursementReceipt={confirmReimbursementReceipt}
          />}
          {activeView === 'gatherings' && <GatheringsView onNavigate={openView} onCreate={() => startCreate('gathering')} gatherings={allGatherings} />}
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
          <form className="create-modal" onSubmit={saveNewItem}>
            <button type="button" className="icon-button modal-close" aria-label="إغلاق" onClick={() => setCreateKind(null)}><X size={18} /></button>
            <span className="modal-icon">{createKind === 'fund' ? <Wallet size={21} /> : <UsersRound size={21} />}</span>
            <span className="date-line">{createKind === 'fund' ? 'مصروفاتكم المستمرة' : 'خططوا لها سوا'}</span>
            <h2>{createKind === 'fund' ? 'أنشئ صندوقًا جديدًا' : 'رتّبوا جمعتكم الجاية'}</h2>
            <p>{createKind === 'fund' ? 'اجمع التزامات ومصروفات مجموعتك في مكان واحد.' : 'ابدأوا بتسمية المناسبة وحددوا موعدًا مبدئيًا.'}</p>
            <label className="modal-field"><span>{createKind === 'fund' ? 'اسم الصندوق' : 'اسم المناسبة'}</span><input autoFocus required value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder={createKind === 'fund' ? 'مثال: سكن الأصدقاء' : 'مثال: عشاء نهاية الأسبوع'} /></label>
            <label className="modal-field"><span>{createKind === 'fund' ? 'أقرب التزام (اختياري)' : 'الموعد المبدئي (اختياري)'}</span><input value={createDetail} onChange={(event) => setCreateDetail(event.target.value)} placeholder={createKind === 'fund' ? 'مثال: فاتورة الإنترنت · ١ نوفمبر' : 'مثال: الجمعة، ٣٠ أكتوبر'} /></label>
            <div className="modal-actions"><button type="button" className="button-outline" onClick={() => setCreateKind(null)}>إلغاء</button><button type="submit" className="button-primary"><Plus size={16} /> {createKind === 'fund' ? 'إنشاء الصندوق' : 'إنشاء الجمعة'}</button></div>
            <small className="modal-prototype-note">نموذج أولي · تُحفظ الإضافة لهذه الجلسة فقط</small>
          </form>
        </div>
      )}
    </div>
  )
}

function Overview({ onNavigate, funds: currentFunds, gatherings: currentGatherings }: { onNavigate: (view: View) => void; funds: Fund[]; gatherings: Gathering[] }) {
  return (
    <>
      <section className="welcome-row">
        <div>
          <div className="date-line"><CalendarDays size={15} /> الثلاثاء، ٢٧ أكتوبر ٢٠٢٦</div>
          <h1>هلا محمد <span>👋</span></h1>
          <p>هذي لمحة سريعة عن مصروفاتكم والتزامات المجموعة.</p>
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
            <div><h2>آخر العمليات</h2><p>تابع مصروفات مجموعتك أولًا بأول</p></div>
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
            <div><h2>القادم عليكم</h2><p>لا تفوتوا موعد أي التزام</p></div>
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
          <div><h2>مساحاتكم</h2><p>صناديق وجمعات تجمعكم على الواضح</p></div>
          <button className="text-button" onClick={() => onNavigate('funds')}>عرض الكل <ArrowUpLeft size={15} /></button>
        </div>
        <div className="fund-cards">
          {currentFunds.map((fund) => <FundCard key={fund.title} fund={fund} onClick={() => onNavigate('funds')} />)}
        </div>
      </section>

      <section className="bottom-grid">
        <div className="panel gatherings-panel">
          <div className="panel-heading">
            <div><h2>جمعاتكم الجاية</h2><p>خططوا لها من بدري</p></div>
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
          <p>سجّلوا المصروف وقتها، وخلو كل عضو يعرف حصته بكل سهولة.</p>
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
  const label = status === 'paid' ? 'تم الاعتماد' : status === 'awaiting' ? 'بانتظار اعتماد المشرف' : 'بانتظار الدفع'
  return <span className={`fund-status-badge payment-${status}`}><i />{label}</span>
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
  onCreate,
  funds: currentFunds,
  requests,
  obligations: currentObligations,
  reimbursements: currentReimbursements,
  history,
  onConfirmContribution,
  onApproveContribution,
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
  onCreate: () => void
  funds: Fund[]
  requests: KattahRequest[]
  obligations: Obligation[]
  reimbursements: Reimbursement[]
  history: FundActivity[]
  onConfirmContribution: (requestId: number, memberName: string) => void
  onApproveContribution: (requestId: number, memberName: string) => void
  onApproveAllContributions: (requestId: number) => void
  onReportObligationPayment: (obligationId: number) => void
  onApproveObligationPayment: (obligationId: number) => void
  onCreateReimbursement: (title: string, amount: number, receipt: string) => void
  onCreateKattahRequest: (title: string, total: number, cadence: string, due: string) => void
  onCreateObligation: (title: string, amount: number, cadence: string, due: string) => void
  onDecideReimbursement: (reimbursementId: number, status: Reimbursement['status']) => void
  onConfirmReimbursementReceipt: (reimbursementId: number, received: boolean) => void
}) {
  const [formKind, setFormKind] = useState<FundFormKind | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formCadence, setFormCadence] = useState('شهري')
  const [formDue, setFormDue] = useState('')
  const [receiptName, setReceiptName] = useState('')

  const selectedFund = currentFunds[0]
  const currentRequest = requests[0]
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

    if (formKind === 'kattah') onCreateKattahRequest(title, amount, formCadence, formDue.trim() || 'يُحدّد لاحقًا')
    if (formKind === 'obligation') onCreateObligation(title, amount, formCadence, formDue.trim() || 'يُحدّد لاحقًا')
    if (formKind === 'reimbursement') onCreateReimbursement(title, amount, receiptName || 'لم يُرفق إيصال')
    setFormKind(null)
    setFormTitle('')
    setFormAmount('')
    setFormDue('')
    setReceiptName('')
  }

  return (
    <>
      <PageIntro eyebrow="إدارة المصروفات المستمرة" title="الصندوق" description="التزاماتكم وقطياتكم وتعويضاتكم في سجل واضح، من الطلب إلى التسوية." action="إنشاء صندوق" onAction={onCreate} />

      <section className="balance-banner">
        <div className="balance-main">
          <div className="balance-title"><span className="balance-wallet"><Wallet size={19} /></span><span><small>الصندوق المحدد</small><strong>{selectedFund?.title ?? 'صندوق المجموعة'}</strong></span></div>
          <span className="balance-caption">الرصيد التراكمي المسجّل</span>
          <strong className="balance-amount">{money(selectedFund?.balance ?? 0)} <small>ر.س</small></strong>
          <span className="balance-disclaimer"><ShieldCheck size={13} /> رصيد محاسبي فقط · لا يحتفظ نسق بأموالكم</span>
        </div>
        <div className="goal-progress">
          <div className="goal-heading"><span><strong>هدف التحصيل الشهري</strong><small>قطية أكتوبر · {currentRequest?.title ?? 'لا توجد قطية نشطة'}</small></span><strong>{Math.round(Math.min(collectedAmount / goal, 1) * 100)}<small>%</small></strong></div>
          <div className="goal-track"><span style={{ width: `${Math.min(collectedAmount / goal, 1) * 100}%` }} /></div>
          <div className="goal-amounts"><span>تم تحصيل <strong>{money(collectedAmount)} ر.س</strong></span><span>الهدف <strong>{money(goal)} ر.س</strong></span></div>
          <div className="balance-mini-stats"><span><Check size={14} /> {paidContributions.length} دفعوا</span><span><Clock3 size={14} /> {awaitingContributions.length} بانتظار الاعتماد</span><span><CalendarDays size={14} /> {money(totalDue)} ر.س التزامات قادمة</span></div>
        </div>
      </section>

      <section className="fund-workspace-actions" aria-label="إدارة الصندوق">
        <button onClick={() => { setFormKind('kattah'); setFormTitle(''); setFormAmount(''); setFormDue('') }}><span className="action-symbol green"><UsersRound size={17} /></span><span><strong>طلب قطية</strong><small>توزيع مساهمات الأعضاء</small></span><Plus size={16} /></button>
        <button onClick={() => { setFormKind('obligation'); setFormTitle(''); setFormAmount(''); setFormDue('') }}><span className="action-symbol purple"><CalendarDays size={17} /></span><span><strong>إضافة التزام</strong><small>شهري أو سنوي أو فوري</small></span><Plus size={16} /></button>
        <button onClick={() => { setFormKind('reimbursement'); setFormTitle(''); setFormAmount(''); setReceiptName('') }}><span className="action-symbol orange"><ReceiptText size={17} /></span><span><strong>طلب تعويض</strong><small>أرفق الإيصال للمراجعة</small></span><Plus size={16} /></button>
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
        <div className="panel-heading"><div><span className="section-kicker">الاشتراكات والمساهمات</span><h2>القطية وتأكيد المدفوعات</h2><p>إشعار العضو بالدفع لا يضيف المبلغ للرصيد حتى يعتمد المشرف.</p></div><div className="kattah-header-actions"><span className="pill green-pill">{currentRequest?.cadence ?? 'شهري'}</span>{awaitingContributions.length > 0 && <button className="button-primary batch-approve" onClick={() => currentRequest && onApproveAllContributions(currentRequest.id)}><Check size={14} /> اعتماد المنتظرين ({awaitingContributions.length})</button>}</div></div>
        {currentRequest ? (
          <>
            <div className="request-summary">
              <span><strong>{currentRequest.title}</strong><small>الاستحقاق {currentRequest.due}</small></span>
              <span><strong>{money(currentRequest.total)} ر.س</strong><small>الحصة المتوقعة لكل عضو</small></span>
              <span><strong>{paidContributions.length} من {currentRequest.contributions.length}</strong><small>تأكيدات معتمدة</small></span>
            </div>
            <div className="contribution-list">
              {currentRequest.contributions.map((contribution) => (
                <div className="contribution-row" key={`${currentRequest.id}-${contribution.name}`}>
                  <span className={`person-avatar person-${contribution.name.length % 4}`}>{contribution.name.slice(0, 1)}</span>
                  <span className="contribution-name"><strong>{contribution.name}</strong><small>{money(contribution.amount)} ر.س</small></span>
                  <PaymentBadge status={contribution.status} />
                  {contribution.status === 'unpaid' && contribution.name === 'محمد السالم' && <button className="button-outline row-action" onClick={() => onConfirmContribution(currentRequest.id, contribution.name)}>تأكيد الدفع</button>}
                  {contribution.status === 'unpaid' && contribution.name !== 'محمد السالم' && <span className="member-waiting">بانتظار العضو</span>}
                  {contribution.status === 'awaiting' && <button className="button-outline row-action approve-action" onClick={() => onApproveContribution(currentRequest.id, contribution.name)}><Check size={13} /> اعتماد</button>}
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
        <div className="panel-heading"><div><span className="section-kicker">سجل محاسبي شفاف</span><h2>آخر العمليات</h2><p>التسجيل والاعتماد وتأكيد الاستلام حالات منفصلة.</p></div><button className="text-button" onClick={() => onNavigate('activity')}>السجل الكامل <ArrowUpLeft size={15} /></button></div>
        <FundHistoryRows history={history} />
      </section>

      <section className="section-block">
        <div className="panel-heading section-heading"><div><h2>كل الصناديق</h2><p>مساحات المصروفات المشتركة في حسابك</p></div><div className="filter-pills"><button className="selected">الكل <span>{currentFunds.length}</span></button><button>نشطة</button></div></div>
        <div className="fund-cards fund-cards-large">{currentFunds.map((fund) => <FundCard key={fund.title} fund={fund} onClick={() => onNavigate('activity')} />)}</div>
      </section>

      <div className="important-note fund-important-note"><ShieldCheck size={18} /><p><strong>الرصيد المحاسبي ليس محفظة</strong><span>اعتماد المشرف يوثّق العملية في سجل المجموعة، ولا يؤكد وصول التحويل الخارجي. يتأكد الاستلام من المستفيد، ويمكنه الاعتراض.</span></p></div>
    </>
  )
}

function GatheringsView({ onNavigate, onCreate, gatherings: currentGatherings }: { onNavigate: (view: View) => void; onCreate: () => void; gatherings: Gathering[] }) {
  return (
    <>
      <PageIntro eyebrow="خططوا لها سوا" title="الجمعات" description="رتّبوا الطلعة، صوّتوا على الخيارات، واعرفوا مين أكّد حضوره." action="إنشاء جمعة" onAction={onCreate} />
      <div className="gathering-note"><span className="tip-icon"><Sparkles size={17} /></span><span><strong>تأكيد الحضور مو التزام دفع</strong><small>تقدرون تحدّثون الحضور والتكلفة حتى بعد التصويت، قبل ما تثبتون التسوية.</small></span><Check size={18} /></div>
      <section className="gathering-cards">
        {currentGatherings.map((gathering) => (
          <article className="panel gathering-card" key={gathering.title}>
            <div className="gathering-card-top"><span className="gathering-emoji large-emoji">{gathering.icon}</span><span className={`pill ${gathering.badgeColor}-pill`}>{gathering.badge}</span></div>
            <h2>{gathering.title}</h2>
            <div className="gathering-meta"><span><CalendarDays size={15} /> {gathering.date}</span><span><MapPin size={15} /> {gathering.location}</span></div>
            <div className="attendee-block"><div className="attendee-label"><span><UsersRound size={15} /> تأكيدات الحضور</span><strong>{gathering.attendees} <small>/ {gathering.total}</small></strong></div><div className="progress-track"><span style={{ width: `${(gathering.attendees / gathering.total) * 100}%` }} /></div></div>
            <div className="gathering-card-footer"><span>التكلفة للفرد <strong>تُحدّد بعد التأكيد</strong></span><button className="button-outline" onClick={() => onNavigate('split')}>عرض التفاصيل <ArrowUpLeft size={15} /></button></div>
          </article>
        ))}
        <button className="new-gathering-card" onClick={() => onNavigate('split')}><span><Plus size={21} /></span><strong>رتّبوا جمعتكم الجاية</strong><small>ادعُ أصحابك واتفقوا على الوقت والمكان</small></button>
      </section>
      <section className="panel table-panel"><div className="panel-heading"><div><h2>آخر الجمعات</h2><p>المناسبات السابقة والتسويات المرتبطة بها</p></div></div><ActivityRows compact /></section>
    </>
  )
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
