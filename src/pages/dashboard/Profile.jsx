import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import { prettyPhone } from '../../lib/phone'
import Alert from '../../components/Alert'

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [msg, setMsg] = useState({})
  const [busy, setBusy] = useState(false)

  const startEdit = () => {
    setForm({ full_name: profile?.full_name || '', email: profile?.email || '', business_name: profile?.business_name || '' })
    setMsg({})
    setEditing(true)
  }

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.updateProfile(user.id, { ...form, email: form.email.trim().toLowerCase() })
      await refreshProfile()
      setMsg({ type: 'success', text: 'Profile updated.' })
      setEditing(false)
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    }
    setBusy(false)
  }

  const Field = ({ label, value, hint }) => (
    <div>
      <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</label>
      <div className="font-medium text-gray-900">{value || '—'}</div>
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )

  const mobile = profile?.mobile ? prettyPhone(profile.mobile) : user?.phone ? prettyPhone(user.phone) : ''

  return (
    <div className="max-w-3xl mx-auto card p-8">
      <h2 className="text-xl font-bold text-darkGreen mb-6 border-b pb-2">Personal Information</h2>
      <Alert type={msg.type === 'success' ? 'success' : 'error'}>{msg.text}</Alert>

      {editing ? (
        <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email (reports are sent here)</label>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Business / Company Name</label>
            <input required value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} className="input" />
          </div>
          <div className="md:col-span-2 flex gap-3 justify-end">
            <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 text-gray-600">Cancel</button>
            <button disabled={busy} className="btn-primary px-6 py-2 text-sm">Save</button>
          </div>
        </form>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Field label="Full Name" value={profile?.full_name} />
            <Field label="Mobile (login)" value={mobile} hint="Used to log in with OTP. Contact support to change it." />
            <Field label="Email (reports)" value={profile?.email} />
            <Field label="Business" value={profile?.business_name} />
          </div>
          <div className="pt-6 border-t border-gray-100">
            <button onClick={startEdit} className="btn-outline px-4 py-2 text-sm">Edit Profile</button>
          </div>
        </>
      )}
    </div>
  )
}
