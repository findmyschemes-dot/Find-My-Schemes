import { useEffect, useRef, useState } from 'react'

// Single-series charts in the brand green. One measure per chart (no dual axes).
const INK = '#16332c'
const INK_HOVER = '#b85441'
const GRID = '#ebe7de'

function useWidth() {
  const ref = useRef(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.floor(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

const niceMax = (v) => {
  if (v <= 0) return 4
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return step * p
}

export const compactINR = (n) => {
  n = Number(n || 0)
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(n >= 1e8 ? 0 : 1).replace(/\.0$/, '') + ' Cr'
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(n >= 1e6 ? 0 : 1).replace(/\.0$/, '') + ' L'
  if (n >= 1e3) return '₹' + (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K'
  return '₹' + Math.round(n)
}

const shortDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })

// Rounded-top bar path anchored to the baseline
const barPath = (x, y, w, h, r = 4) => {
  if (h <= 0) return ''
  r = Math.min(r, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

/** Daily column chart with hover tooltip and a table view. data: [{date, value}] */
export function ColumnChart({ title, subtitle, data, format = (v) => v, axisFormat, total, integer = false }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  const [asTable, setAsTable] = useState(false)
  const H = 200, padL = 48, padR = 8, padT = 12, padB = 26
  const innerW = width - padL - padR, innerH = H - padT - padB
  let max = niceMax(Math.max(0, ...data.map((d) => d.value)))
  if (integer) max = Math.max(2, Math.ceil(max / 2) * 2) // whole-number axis
  const n = data.length || 1
  const slot = innerW / n
  const gap = slot > 6 ? 2 : 0
  const bw = Math.max(1, slot - gap)
  const y = (v) => padT + innerH - (v / max) * innerH
  const ticks = [0, max / 2, max]
  const fmtAxis = axisFormat || format
  const labelIdx = n <= 8 ? data.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1]

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <p className="text-xs text-gray-500">
            {subtitle}
            {total != null && <> · Total <b className="text-gray-800">{format(total)}</b></>}
          </p>
        </div>
        <button onClick={() => setAsTable(!asTable)} className="text-xs text-gray-500 hover:text-darkGreen border border-gray-200 rounded px-2 py-1">
          <i className={`fa-solid ${asTable ? 'fa-chart-column' : 'fa-table'} mr-1`} />
          {asTable ? 'Chart' : 'Table'}
        </button>
      </div>

      {asTable ? (
        <div className="max-h-[200px] overflow-y-auto text-sm">
          <table className="w-full">
            <tbody className="divide-y divide-gray-100">
              {[...data].reverse().map((d) => (
                <tr key={d.date}>
                  <td className="py-1.5 text-gray-600">{shortDate(d.date)}</td>
                  <td className="py-1.5 text-right font-medium text-gray-900">{format(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
          <svg width={width} height={H} role="img" aria-label={title}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" />
                <text x={padL - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-gray-500" fontSize="11">
                  {fmtAxis(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const x = padL + i * slot + gap / 2
              const h = (d.value / max) * innerH
              return (
                <g key={d.date}>
                  <path d={barPath(x, y(d.value), bw, h, bw > 8 ? 4 : 1)} fill={hover === i ? INK_HOVER : INK} />
                  <rect x={padL + i * slot} y={padT} width={slot} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} />
                </g>
              )
            })}
            {labelIdx.map((i) => (
              <text
                key={i}
                x={padL + i * slot + slot / 2}
                y={H - 8}
                textAnchor={n > 8 ? (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle') : 'middle'}
                className="fill-gray-500"
                fontSize="11"
              >
                {data[i] && shortDate(data[i].date)}
              </text>
            ))}
          </svg>
          {hover != null && data[hover] && (
            <div
              className="absolute pointer-events-none bg-white border border-gray-200 shadow-lg rounded px-3 py-2 text-xs z-10"
              style={{
                left: Math.min(Math.max(padL + hover * slot + slot / 2 - 60, 0), width - 120),
                top: Math.max(0, y(data[hover].value) - 52),
                width: 120,
              }}
            >
              <div className="text-gray-500">{shortDate(data[hover].date)}</div>
              <div className="font-semibold text-gray-900 text-sm">{format(data[hover].value)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Ranked horizontal bars with the value written at the end. items: [{label, value, sub?}] */
export function BarList({ title, subtitle, items, format = (v) => v, empty = 'No data in this period.' }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <div className="card p-5">
      <h3 className="font-semibold text-gray-800">{title}</h3>
      {subtitle && <p className="text-xs text-gray-500 mb-3">{subtitle}</p>}
      {!items.length ? (
        <p className="text-sm text-gray-400 py-6 text-center">{empty}</p>
      ) : (
        <ul className="space-y-2.5 mt-3">
          {items.map((it) => (
            <li key={it.label} className="group" title={`${it.label}: ${format(it.value)}${it.sub ? ' · ' + it.sub : ''}`}>
              <div className="flex justify-between text-sm mb-1 gap-3">
                <span className="text-gray-700 truncate">{it.label}</span>
                <span className="text-gray-900 font-medium whitespace-nowrap">
                  {format(it.value)}
                  {it.sub && <span className="text-gray-400 font-normal"> · {it.sub}</span>}
                </span>
              </div>
              <div className="h-2 rounded-full bg-[#f1eee7]">
                <div
                  className="h-2 rounded-full bg-darkGreen group-hover:bg-rust transition-colors"
                  style={{ width: `${Math.max(2, (it.value / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function Kpi({ label, value, hint, icon, tone = 'default', onClick }) {
  const tones = {
    default: 'bg-softGreen text-darkGreen',
    warn: 'bg-yellow-50 text-yellow-700',
    bad: 'bg-red-50 text-red-600',
  }
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={`card p-5 text-left w-full ${onClick ? 'hover:shadow-md transition-shadow' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-darkGreen mt-1 truncate">{value}</p>
          {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
        </div>
        {icon && (
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${tones[tone]}`}>
            <i className={`fa-solid ${icon}`} />
          </div>
        )}
      </div>
    </Tag>
  )
}
