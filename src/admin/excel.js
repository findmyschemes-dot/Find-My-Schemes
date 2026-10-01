// Excel (.xlsx) download. exceljs is loaded only when someone clicks "Download",
// so it doesn't slow down the rest of the site.
//
// sheets: [{ name, columns: [{ header, key, width?, type?: 'money'|'date'|'datetime'|'number'|'text' }], rows }]
export async function downloadExcel(filename, sheets) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Find My Schemes Admin'
  wb.created = new Date()

  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] })
    ws.columns = sh.columns.map((c) => ({ header: c.header, key: c.key, width: c.width || Math.max(12, c.header.length + 4) }))

    for (const r of sh.rows) {
      const row = {}
      for (const c of sh.columns) {
        let v = typeof c.value === 'function' ? c.value(r) : r[c.key]
        if (v == null || v === '') { row[c.key] = null; continue }
        if (Array.isArray(v)) v = v.join(', ')
        else if (typeof v === 'object') v = JSON.stringify(v)
        if (c.type === 'money' || c.type === 'number') v = Number(v)
        if ((c.type === 'date' || c.type === 'datetime') && v) v = new Date(v)
        row[c.key] = v
      }
      ws.addRow(row)
    }

    sh.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1)
      if (c.type === 'money') col.numFmt = '"₹"#,##0.00'
      if (c.type === 'number') col.numFmt = '#,##0.##'
      if (c.type === 'date') col.numFmt = 'dd-mmm-yyyy'
      if (c.type === 'datetime') col.numFmt = 'dd-mmm-yyyy hh:mm'
    })

    const head = ws.getRow(1)
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16332C' } }
    head.alignment = { vertical: 'middle' }
    head.height = 20
    if (sh.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sh.columns.length } }
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  const stamp = new Date().toISOString().slice(0, 10)
  a.download = `${filename}-${stamp}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

// ---- column sets reused by list pages and the "export everything" button ----
const STATUS_LABEL = { submitted: 'Submitted', processing: 'In Review', ready: 'Ready', failed: 'Failed', refunded: 'Refunded' }
const inp = (k) => (r) => r.inputs?.[k]

export const COLUMNS = {
  customers: [
    { header: 'Name', key: 'full_name', width: 24 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Mobile', key: 'mobile', width: 16 },
    { header: 'Business', key: 'business_name', width: 26 },
    { header: 'Signed up', key: 'created_at', type: 'datetime', width: 18 },
    { header: 'Wallet balance', key: 'wallet_balance', type: 'money' },
    { header: 'Total paid', key: 'total_paid', type: 'money' },
    { header: 'Reports', key: 'reports_count', type: 'number', width: 10 },
    { header: 'Last activity', key: 'last_activity', type: 'datetime', width: 18 },
  ],
  reports: [
    { header: 'Request ID', key: 'report_code', width: 14 },
    { header: 'Submitted', key: 'created_at', type: 'datetime', width: 18 },
    { header: 'Status', key: 'status', value: (r) => STATUS_LABEL[r.status] || r.status, width: 12 },
    { header: 'Customer', key: 'customer_name', width: 22 },
    { header: 'Customer email', key: 'customer_email', width: 28 },
    { header: 'Customer mobile', key: 'customer_mobile', width: 16 },
    { header: 'Deliver to', key: 'delivery_email', width: 28 },
    { header: 'Business', key: 'business_name', width: 24 },
    { header: 'Type', key: 'entity_type', value: inp('entity_type'), width: 16 },
    { header: 'Industry', key: 'industry', width: 18 },
    { header: 'Sub-sector', key: 'sub_sector', value: inp('sub_sector'), width: 22 },
    { header: 'State', key: 'state', width: 16 },
    { header: 'City', key: 'city', value: inp('city'), width: 14 },
    { header: 'Year started', key: 'year_established', value: inp('year_established'), width: 12 },
    { header: 'Stage', key: 'business_stage', value: inp('business_stage'), width: 18 },
    { header: 'Turnover', key: 'annual_turnover', value: inp('annual_turnover'), width: 18 },
    { header: 'Employees', key: 'employees', value: inp('employees'), width: 11 },
    { header: 'Udyam', key: 'udyam_registered', value: inp('udyam_registered'), width: 10 },
    { header: 'GST', key: 'gst_registered', value: inp('gst_registered'), width: 10 },
    { header: 'DPIIT', key: 'dpiit_startup', value: inp('dpiit_startup'), width: 10 },
    { header: 'Exporter', key: 'exporter', value: inp('exporter'), width: 10 },
    { header: 'Promoter profile', key: 'owner_category', value: inp('owner_category'), width: 24 },
    { header: 'Purpose', key: 'purpose', value: inp('purpose'), width: 34 },
    { header: 'Planned investment', key: 'planned_investment', value: inp('planned_investment'), width: 18 },
    { header: 'Support preferred', key: 'support_type', value: inp('support_type'), width: 24 },
    { header: 'Description', key: 'description', value: inp('description'), width: 50 },
    { header: 'Price charged', key: 'price_charged', type: 'money' },
    { header: 'Delivered', key: 'delivered_at', type: 'datetime', width: 18 },
    { header: 'Turnaround (hrs)', key: 'tat', value: (r) => (r.delivered_at ? Number(r.age_hours).toFixed(1) : null), type: 'number' },
    { header: 'Schemes found', key: 'schemes_found', type: 'number' },
    { header: 'Potential benefit', key: 'potential_benefit', width: 18 },
    { header: 'Status note', key: 'status_note', width: 30 },
  ],
  payments: [
    { header: 'Payment ID', key: 'payment_code', width: 15 },
    { header: 'Created', key: 'created_at', type: 'datetime', width: 18 },
    { header: 'Paid at', key: 'paid_at', type: 'datetime', width: 18 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Customer', key: 'customer_name', width: 22 },
    { header: 'Email', key: 'customer_email', width: 28 },
    { header: 'Mobile', key: 'customer_mobile', width: 16 },
    { header: 'Pack', key: 'pack_id', width: 10 },
    { header: 'Amount', key: 'amount', type: 'money' },
    { header: 'Wallet credit', key: 'credit_amount', type: 'money' },
    { header: 'Gateway', key: 'gateway', width: 10 },
    { header: 'Gateway payment ID', key: 'gateway_payment_id', width: 26 },
  ],
  ledger: [
    { header: 'Transaction ID', key: 'txn_code', width: 16 },
    { header: 'Date', key: 'created_at', type: 'datetime', width: 18 },
    { header: 'Customer', key: 'customer_name', width: 22 },
    { header: 'Email', key: 'customer_email', width: 28 },
    { header: 'Type', key: 'direction', width: 8 },
    { header: 'Reason', key: 'reason', width: 12 },
    { header: 'Amount', key: 'amount', type: 'money' },
    { header: 'Balance after', key: 'balance_after', type: 'money' },
    { header: 'Details', key: 'note', width: 34 },
  ],
  queries: [
    { header: 'Date', key: 'created_at', type: 'datetime', width: 18 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Customer', key: 'customer_name', width: 22 },
    { header: 'Email', key: 'customer_email', width: 28 },
    { header: 'Mobile', key: 'customer_mobile', width: 16 },
    { header: 'Subject', key: 'subject', width: 30 },
    { header: 'Message', key: 'message', width: 50 },
    { header: 'Reply', key: 'admin_reply', width: 50 },
  ],
  applications: [
    { header: 'Application ID', key: 'app_code', width: 15 },
    { header: 'Date', key: 'created_at', type: 'datetime', width: 18 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Scheme', key: 'scheme_name', width: 36 },
    { header: 'From report', key: 'report_code', width: 14 },
    { header: 'Customer', key: 'customer_name', width: 22 },
    { header: 'Email', key: 'customer_email', width: 28 },
    { header: 'Mobile', key: 'customer_mobile', width: 16 },
  ],
}
