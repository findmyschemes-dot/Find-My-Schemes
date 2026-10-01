import { useState } from 'react'

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
      <div>
        <h1 className="text-2xl font-bold text-darkGreen">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-2 items-center">{children}</div>
    </div>
  )
}

export function DownloadButton({ onClick, label = 'Download Excel', count }) {
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    try {
      await onClick()
    } finally {
      setBusy(false)
    }
  }
  return (
    <button onClick={go} disabled={busy || count === 0} className="btn-outline px-3 py-2 text-sm flex items-center gap-2 disabled:opacity-50">
      <i className={`fa-solid ${busy ? 'fa-circle-notch fa-spin' : 'fa-file-excel'} text-green-700`} />
      {busy ? 'Preparing…' : label}
      {count != null && <span className="text-gray-400 font-normal">({count})</span>}
    </button>
  )
}

export function SearchBox({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className="relative">
      <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input pl-8 py-2 text-sm w-64" />
    </div>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1 bg-white border border-gray-200 rounded-lg p-1 mb-4 w-fit">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${value === t.value ? 'bg-darkGreen text-white' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          {t.label}
          {t.count != null && <span className={`ml-1.5 text-xs ${value === t.value ? 'text-gray-300' : 'text-gray-400'}`}>{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export const matches = (q, ...fields) => {
  if (!q) return true
  const s = q.toLowerCase()
  return fields.some((f) => String(f ?? '').toLowerCase().includes(s))
}

export function Th({ children, right }) {
  return <th className={`th whitespace-nowrap ${right ? 'text-right' : ''}`}>{children}</th>
}
