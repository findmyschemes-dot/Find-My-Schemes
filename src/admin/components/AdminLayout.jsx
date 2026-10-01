import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAdmin } from '../AdminAuth'
import { prettyPhone } from '../loginFlow'

const NAV = [
  { to: '/admin', label: 'Analytics', icon: 'fa-chart-line', end: true },
  { to: '/admin/requests', label: 'Report Requests', icon: 'fa-inbox' },
  { to: '/admin/customers', label: 'Customers', icon: 'fa-users' },
  { to: '/admin/payments', label: 'Payments & Wallet', icon: 'fa-indian-rupee-sign' },
  { to: '/admin/queries', label: 'Queries', icon: 'fa-headset' },
  { to: '/admin/applications', label: 'Applications', icon: 'fa-clipboard-list' },
  { to: '/admin/settings', label: 'Settings', icon: 'fa-gear' },
]

export default function AdminLayout() {
  const { phone, signOut, settings } = useAdmin()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const main = useRef(null)
  useEffect(() => {
    main.current?.scrollTo(0, 0)
  }, [pathname])
  const dummy = (settings.admin_otp_mode ?? 'dummy') === 'dummy' || (settings.payment_mode ?? 'dummy') === 'dummy'

  const logout = async () => {
    await signOut()
    navigate('/admin/login')
  }

  return (
    <div className="font-sans bg-[#f6f5f1] text-gray-800 flex fixed inset-0 overflow-hidden">
      {open && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`bg-darkerGreen text-gray-300 w-60 flex-shrink-0 h-full flex flex-col transition-transform ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:relative z-50`}>
        <div className="h-16 flex items-center gap-2 px-5 border-b border-white/10">
          <img src="/assets/Logo.png" alt="Find My Schemes" className="h-7 w-auto" />
          <span className="text-[10px] font-bold uppercase tracking-widest bg-rust text-white px-1.5 py-0.5 rounded">Admin</span>
        </div>
        <nav className="flex-grow overflow-y-auto py-4 space-y-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) => `sidebar-link flex items-center px-5 py-2.5 text-sm font-medium hover:bg-white/5 hover:text-white ${isActive ? 'active' : ''}`}
            >
              <i className={`fa-solid ${n.icon} w-5 mr-3 text-center`} /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10 text-xs">
          <div className="text-gray-400 mb-2"><i className="fa-solid fa-mobile-screen mr-1" /> {phone ? prettyPhone(phone.replace(/\D/g, '')) : 'Admin'}</div>
          <button onClick={logout} className="text-gray-300 hover:text-white"><i className="fa-solid fa-sign-out-alt mr-2" />Logout</button>
        </div>
      </aside>

      <div className="flex-grow flex flex-col h-full overflow-hidden">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-gray-500" onClick={() => setOpen(true)} aria-label="Menu"><i className="fa-solid fa-bars text-lg" /></button>
            <span className="font-serif font-bold text-darkGreen">Find My Schemes · Admin</span>
          </div>
          <div className="flex items-center gap-3">
            {dummy && (
              <span className="hidden sm:inline text-[11px] font-semibold bg-yellow-100 text-yellow-800 px-2 py-1 rounded" title="Admin OTP and/or payments are in test mode">
                TEST MODE
              </span>
            )}
            <Link to="/" className="text-xs text-gray-500 hover:text-darkGreen">View website <i className="fa-solid fa-arrow-up-right-from-square ml-1" /></Link>
          </div>
        </header>
        <main ref={main} className="flex-grow overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
