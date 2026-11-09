import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Copy, Crown, Link, Shield, Trash2, UserRoundMinus, UsersRound, Wallet, X } from 'lucide-react'
import type { GroupRole, UserGroup } from '../lib/groups'
import {
  deleteGroup,
  enableGroupFund,
  getGroupInviteCode,
  leaveGroup,
  removeGroupMember,
  transferGroupOwnership,
  updateGroupDetails,
  updateMemberRole,
} from '../lib/groups'

type Props = {
  group: UserGroup
  currentUserId: string
  onClose: () => void
  onChanged: () => Promise<void>
}

const roleLabel: Record<GroupRole, string> = {
  owner: 'المالك',
  admin: 'مشرف',
  member: 'عضو',
}

export function GroupSettingsModal({ group, currentUserId, onClose, onChanged }: Props) {
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description)
  const [inviteCode, setInviteCode] = useState('')
  const [newOwnerUid, setNewOwnerUid] = useState('')
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const isManager = group.role === 'owner' || group.role === 'admin'
  const isOwner = group.role === 'owner'
  const currentMember = group.members.find((member) => member.uid === currentUserId)

  useEffect(() => {
    let cancelled = false
    void getGroupInviteCode(group.id).then((code) => {
      if (!cancelled) setInviteCode(code)
    }).catch((loadError: unknown) => {
      if (!cancelled) {
        console.error('Loading the group invite code failed:', loadError)
        setError(loadError instanceof Error ? loadError.message : String(loadError))
      }
    })
    return () => { cancelled = true }
  }, [group.id])

  const runAction = async (action: () => Promise<void>, close = false) => {
    setError('')
    setBusy(true)
    try {
      await action()
      await onChanged()
      if (close) onClose()
    } catch (actionError) {
      console.error('Group settings action failed:', actionError)
      setError(actionError instanceof Error ? actionError.message : String(actionError))
    } finally {
      setBusy(false)
    }
  }

  const saveDetails = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void runAction(() => updateGroupDetails(group.id, name, description))
  }

  const copyInvite = async () => {
    setError('')
    try {
      await navigator.clipboard.writeText(inviteCode)
    } catch (copyError) {
      console.error('Copying the group invite code failed:', copyError)
      setError('تعذر نسخ الرمز. يمكنك تحديده ونسخه يدويًا.')
    }
  }

  const shareInvite = async () => {
    const url = `${window.location.origin}/?invite=${encodeURIComponent(inviteCode)}`
    try {
      if (navigator.share) {
        await navigator.share({ title: `دعوة إلى ${group.name}`, text: `انضم إلى مجموعة ${group.name} في نسق باستخدام الرمز ${inviteCode}`, url })
      } else {
        await navigator.clipboard.writeText(`${url}\nرمز الدعوة: ${inviteCode}`)
      }
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return
      console.error('Sharing the group invite failed:', shareError)
      setError('تعذرت مشاركة الدعوة. انسخ الرمز يدويًا.')
    }
  }

  const confirmDelete = () => {
    if (deleteConfirmation !== group.name) {
      setError('اكتب اسم المجموعة كما يظهر تمامًا لتأكيد الحذف.')
      return
    }
    void runAction(() => deleteGroup(group.id, currentUserId), true)
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <section className="create-modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="group-settings-title">
        <button type="button" className="icon-button modal-close" aria-label="إغلاق" onClick={onClose} disabled={busy}><X size={18} /></button>
        <span className="modal-icon"><UsersRound size={21} /></span>
        <span className="date-line">إدارة مساحة العمل</span>
        <h2 id="group-settings-title">إعدادات المجموعة</h2>
        <p>عدّل التفاصيل، وأدر الأعضاء والدعوات. تتحقق قواعد Firestore من الصلاحيات عند كل تغيير.</p>

        <form className="settings-section" onSubmit={saveDetails}>
          <h3>تفاصيل المجموعة</h3>
          <label className="modal-field"><span>اسم المجموعة</span><input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} disabled={!isManager || busy} /></label>
          <label className="modal-field"><span>الوصف</span><textarea maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} disabled={!isManager || busy} rows={3} /></label>
          {isManager && <button className="button-primary" type="submit" disabled={busy || (name.trim() === group.name && description.trim() === group.description)}><Check size={15} /> حفظ التفاصيل</button>}
        </form>

        {!group.hasFund && isManager && <div className="settings-section">
          <h3>الصندوق</h3>
          <p>فعّل صندوقًا ماليًا لهذه المجموعة مع الإبقاء على جمعاتها وأعضائها.</p>
          <button type="button" className="button-primary" disabled={busy} onClick={() => void runAction(() => enableGroupFund(group.id))}><Wallet size={15} /> تفعيل الصندوق لهذه المجموعة</button>
        </div>}

        <div className="settings-section">
          <h3>رمز الدعوة</h3>
          <p>شارك الرمز أو الرابط لدعوة أعضاء جدد.</p>
          <div className="invite-code-row"><code dir="ltr">{inviteCode || 'جارٍ التحميل...'}</code><button type="button" className="button-outline" onClick={() => void copyInvite()} disabled={!inviteCode}><Copy size={15} /> نسخ</button><button type="button" className="button-outline" onClick={() => void shareInvite()} disabled={!inviteCode}><Link size={15} /> مشاركة</button></div>
        </div>

        <div className="settings-section">
          <h3>الأعضاء <span className="settings-count">{group.members.length}</span></h3>
          <div className="settings-member-list">
            {group.members.map((member) => (
              <div className="settings-member" key={member.uid}>
                <span className="profile-avatar settings-member-avatar">{member.displayName.trim().slice(0, 1) || '؟'}</span>
                <span className="settings-member-name">{member.displayName}{member.uid === currentUserId && <small>أنت</small>}</span>
                <span className={`settings-role role-${member.role}`}>{member.role === 'owner' && <Crown size={13} />}{member.role === 'admin' && <Shield size={13} />}{roleLabel[member.role]}</span>
                {isManager && member.uid !== currentUserId && member.role !== 'owner' && (
                  <div className="settings-member-actions">
                    <label className="visually-hidden" htmlFor={`role-${member.uid}`}>دور {member.displayName}</label>
                    <select id={`role-${member.uid}`} value={member.role} disabled={busy} onChange={(event) => void runAction(() => updateMemberRole(group.id, member.uid, event.target.value as 'admin' | 'member'))}>
                      <option value="member">عضو</option>
                      <option value="admin">مشرف</option>
                    </select>
                    <button type="button" className="icon-button mini danger-button" aria-label={`إزالة ${member.displayName}`} disabled={busy} onClick={() => {
                      if (window.confirm(`إزالة ${member.displayName} من المجموعة؟`)) void runAction(() => removeGroupMember(group.id, member.uid))
                    }}><UserRoundMinus size={15} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {!isManager && <small className="settings-note">إدارة الأدوار والأعضاء متاحة للمالك والمشرفين.</small>}
        </div>

        {isOwner && (
          <div className="settings-section">
            <h3>نقل الملكية</h3>
            <p>سيصبح المالك الحالي مشرفًا بعد النقل.</p>
            <div className="settings-transfer-row">
              <select aria-label="المالك الجديد" value={newOwnerUid} onChange={(event) => setNewOwnerUid(event.target.value)} disabled={busy}>
                <option value="">اختر عضوًا</option>
                {group.members.filter((member) => member.uid !== currentUserId).map((member) => <option key={member.uid} value={member.uid}>{member.displayName} · {roleLabel[member.role]}</option>)}
              </select>
              <button type="button" className="button-outline" disabled={busy || !newOwnerUid} onClick={() => {
                const newOwner = group.members.find((member) => member.uid === newOwnerUid)
                if (newOwner && window.confirm(`نقل ملكية «${group.name}» إلى ${newOwner.displayName}؟`)) {
                  void runAction(() => transferGroupOwnership(group.id, currentUserId, newOwnerUid), true)
                }
              }}>نقل الملكية</button>
            </div>
          </div>
        )}

        <div className="settings-section settings-danger-zone">
          <h3>مغادرة أو حذف المجموعة</h3>
          {isOwner
            ? <p>المالك لا يستطيع المغادرة قبل نقل الملكية. يمكنك حذف المجموعة نهائيًا بدلًا من ذلك.</p>
            : <button type="button" className="button-outline danger-outline" disabled={busy || !currentMember} onClick={() => {
              if (window.confirm(`مغادرة مجموعة «${group.name}»؟`)) void runAction(() => leaveGroup(group.id, currentUserId), true)
            }}><UserRoundMinus size={15} /> مغادرة المجموعة</button>}
          {isOwner && (
            <div className="settings-delete-group">
              <label className="modal-field"><span>اكتب «{group.name}» لتأكيد الحذف النهائي</span><input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} disabled={busy} /></label>
              <button type="button" className="button-danger" disabled={busy || deleteConfirmation !== group.name} onClick={confirmDelete}><Trash2 size={15} /> حذف المجموعة نهائيًا</button>
            </div>
          )}
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="button-outline" onClick={onClose} disabled={busy}>إغلاق</button></div>
      </section>
    </div>
  )
}
