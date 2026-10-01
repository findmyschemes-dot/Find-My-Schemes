import { useState } from 'react'
import { adminApi, adminErr } from '../adminApi'
import { useAdmin } from '../AdminAuth'
import { useAsync } from '../../lib/useAsync'
import { fmtDate } from '../../lib/format'
import { normalizePhone, prettyPhone } from '../loginFlow'
import { PageHeader } from '../components/Toolbar'
import Spinner from '../../components/Spinner'
import Alert from '../../components/Alert'

const MODES = {
  admin_otp_mode: ['Admin login', { dummy: 'Test code 123456', sms: 'Real SMS OTP' }],
  payment_mode: ['Customer payments', { dummy: 'Test checkout', razorpay: 'Razorpay' }],
  generation_mode: ['Report generation', { manual: 'Team (manual)', ai: 'AI' }],
}

export default function Settings() {
  const { phone, refresh } = useAdmin()
  const { data, loading, error, reload } = useAsync(() => Promise.all([adminApi.settings(), adminApi.packs(), adminApi.admins()]))
  const [msg, setMsg] = useState({})
  const [newAdmin, setNewAdmin] = useState({ phone: '', name: '' })
  const [edits, setEdits] = useState({})

  if (loading) return <Spinner />
  if (error) return <Alert>{error}</Alert>
  const [settings, packs, admins] = data
  const get = (k) => settings.find((s) => s.key === k)?.value
  const myDigits = String(phone).replace(/\D/g, '')

  const act = async (fn, ok) => {
    setMsg({})
    try {
      await fn()
      await reload()
      await refresh()
      setMsg({ type: 'success', text: ok })
    } catch (e) {
      setMsg({ type: 'error', text: adminErr(e) })
    }
  }

  const val = (k, d) => (edits[k] !== undefined ? edits[k] : d)

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="Settings" />
      <Alert type={msg.type === 'success' ? 'success' : 'error'}>{msg.text}</Alert>

      <div className="card p-5 mb-4">
        <h3 className="font-semibold text-gray-800 mb-1">Pricing</h3>
        <p className="text-xs text-gray-500 mb-4">Changes apply to new requests immediately. Requests already submitted keep the price they paid.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[['report_price', 'Price per report (₹)'], ['delivery_sla_hours', 'Delivery promise (hours)']].map(([k, label]) => (
            <div key={k}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <div className="flex gap-2">
                <input type="number" min="1" value={val(k, get(k))} onChange={(e) => setEdits({ ...edits, [k]: e.target.value })} className="input" />
                <button
                  disabled={edits[k] === undefined || Number(edits[k]) <= 0}
                  onClick={() => act(() => adminApi.setSetting(k, Number(edits[k])), 'Saved.').then(() => setEdits({ ...edits, [k]: undefined }))}
                  className="btn-primary px-4 text-sm"
                >
                  Save
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5 mb-4">
        <h3 className="font-semibold text-gray-800 mb-4">Wallet recharge packs</h3>
        <div className="space-y-3">
          {packs.map((p) => {
            const e = edits['pack_' + p.id] || {}
            const v = (f) => (e[f] !== undefined ? e[f] : p[f])
            const set = (f, x) => setEdits({ ...edits, ['pack_' + p.id]: { ...e, [f]: x } })
            const dirty = Object.keys(e).length > 0
            return (
              <div key={p.id} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end">
                <div className="sm:col-span-2"><label className="text-xs text-gray-500">Name</label><input value={v('name')} onChange={(x) => set('name', x.target.value)} className="input py-1.5 text-sm" /></div>
                <div className="sm:col-span-2"><label className="text-xs text-gray-500">Price ₹</label><input type="number" min="1" value={v('amount')} onChange={(x) => set('amount', x.target.value)} className="input py-1.5 text-sm" /></div>
                <div className="sm:col-span-2"><label className="text-xs text-gray-500">Bonus ₹</label><input type="number" min="0" value={v('bonus')} onChange={(x) => set('bonus', x.target.value)} className="input py-1.5 text-sm" /></div>
                <div className="col-span-2 sm:col-span-3"><label className="text-xs text-gray-500">Description</label><input value={v('description') || ''} onChange={(x) => set('description', x.target.value)} className="input py-1.5 text-sm" /></div>
                <label className="flex items-center gap-1 text-sm sm:col-span-1 pb-2"><input type="checkbox" checked={!!v('active')} onChange={(x) => set('active', x.target.checked)} /> On</label>
                <button
                  disabled={!dirty}
                  onClick={() =>
                    act(() => adminApi.updatePack(p.id, { ...e, ...(e.amount !== undefined && { amount: Number(e.amount) }), ...(e.bonus !== undefined && { bonus: Number(e.bonus) }) }), 'Pack saved.').then(() =>
                      setEdits({ ...edits, ['pack_' + p.id]: undefined })
                    )
                  }
                  className="btn-primary py-2 text-sm sm:col-span-2 disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card p-5 mb-4">
        <h3 className="font-semibold text-gray-800 mb-1">Admin mobile numbers</h3>
        <p className="text-xs text-gray-500 mb-4">Only these numbers can log in to this panel.</p>
        <ul className="divide-y divide-gray-100 mb-4">
          {admins.map((a) => (
            <li key={a.phone} className="py-2.5 flex items-center justify-between gap-3 text-sm">
              <div>
                <span className={`font-medium ${a.active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{prettyPhone(a.phone)}</span>
                <span className="text-gray-500"> · {a.name || '—'} · added {fmtDate(a.created_at)}</span>
                {a.phone === myDigits && <span className="ml-2 text-[10px] font-bold uppercase bg-softGreen text-darkGreen px-1.5 py-0.5 rounded">You</span>}
              </div>
              {a.phone !== myDigits && (
                <button onClick={() => act(() => adminApi.setAdminActive(a.phone, !a.active), a.active ? 'Access removed.' : 'Access restored.')} className={`text-sm font-medium ${a.active ? 'text-red-600' : 'text-darkGreen'}`}>
                  {a.active ? 'Remove access' : 'Restore'}
                </button>
              )}
            </li>
          ))}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const d = normalizePhone(newAdmin.phone)
            if (d.length < 11) return setMsg({ type: 'error', text: 'Enter a valid mobile number.' })
            act(() => adminApi.addAdmin(d, newAdmin.name || null), 'Admin added.').then(() => setNewAdmin({ phone: '', name: '' }))
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <input required value={newAdmin.phone} onChange={(e) => setNewAdmin({ ...newAdmin, phone: e.target.value })} placeholder="Mobile (10 digits or with country code)" className="input text-sm" />
          <input value={newAdmin.name} onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })} placeholder="Name" className="input text-sm" />
          <button className="btn-primary px-4 py-2 text-sm whitespace-nowrap">Add admin</button>
        </form>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold text-gray-800 mb-1">Integrations</h3>
        <p className="text-xs text-gray-500 mb-3">Switched in Supabase SQL when the real service is connected — see INTEGRATION.md.</p>
        <dl className="divide-y divide-gray-100 text-sm">
          {Object.entries(MODES).map(([k, [label, names]]) => {
            const v = get(k)
            const test = v === 'dummy'
            return (
              <div key={k} className="py-2 flex justify-between">
                <dt className="text-gray-600">{label}</dt>
                <dd className={`font-medium ${test ? 'text-yellow-700' : 'text-gray-900'}`}>{names[v] || v}{test && ' (test)'}</dd>
              </div>
            )
          })}
        </dl>
      </div>
    </div>
  )
}
