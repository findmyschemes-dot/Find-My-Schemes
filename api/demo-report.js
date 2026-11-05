// POST /api/demo-report — saves the lead in Supabase, then returns the demo PDF.
// The PDF lives in /private (not public), so it can only be downloaded through this form.
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const isEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)
const normalizePhone = (raw) => {
  let d = String(raw || '').replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  if (d.length === 10) d = '91' + d
  return d
}
const isValidPhone = (d) =>
  d.startsWith('91') ? d.length === 12 && /^91[6-9]/.test(d) : d.length >= 11 && d.length <= 15

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  const name = String(body.name || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
  const phone = normalizePhone(body.phone)
  const source = String(body.source || 'landing').slice(0, 40)

  if (name.length < 2 || name.length > 100 || !isEmail(email) || email.length > 200 || !isValidPhone(phone)) {
    return res.status(400).json({ error: 'Please check the name, email and mobile number.' })
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return res.status(500).json({ error: 'Server not configured.' })

  const save = await fetch(`${url}/rest/v1/free_report_leads`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ name, email, phone, source }),
  })
  if (!save.ok) return res.status(502).json({ error: 'Could not save the details.' })

  const pdf = await readFile(path.join(process.cwd(), 'private', 'Demo.pdf'))
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', 'attachment; filename="Find-My-Schemes-Demo-Report.pdf"')
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).send(pdf)
}
