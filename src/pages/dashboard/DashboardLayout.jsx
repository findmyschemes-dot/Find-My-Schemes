import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { firstName, initial, fmtINR } from '../../lib/format'
import { useAdminAccess } from '../../lib/useAdminAccess'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: 'fa-chart-pie', end: true },
  { to: '/dashboard/reports', label: 'My Scheme Reports', icon: 'fa-file-invoice' },
  { to: '/dashboard/applications', label: 'My Applications', icon: 'fa-clipboard-list' },
  { to: '/dashboard/queries', label: 'My Queries', icon: 'fa-headset' },
  { to: '/dashboard/wallet', label: 'My Wallet', icon: 'fa-wallet' },
  { to: '/dashboard/profile', label: 'Profile', icon: 'fa-user' },
]

const TITLES = {
  '/dashboard': 'Dashboard',
  '/dashboard/reports': 'My Scheme Reports',
  '/dashboard/request-report': 'Request Report',
  '/dashboard/report-success': 'Request Received',
  '/dashboard/applications': 'My Applications',
  '/dashboard/queries': 'My Queries',
  '/dashboard/wallet': 'My Wallet',
  '/dashboard/profile': 'Profile',
}

export default function DashboardLayout() {
  const { profile, user, wallet, signOut } = useAuth()
  const admin = useAdminAccess(profile?.mobile)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const name = profile?.full_name || user?.email
  const mainRef = useRef(null)
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0) // start each page at the top
  }, [pathname])
  const title = TITLES[pathname] || (pathname.startsWith('/dashboard/reports/') ? 'Report Details' : 'Dashboard')

  const logout = async (e) => {
    e.preventDefault()
    await signOut()
    navigate('/login')
  }

  return (
    <div className="font-sans bg-beige text-gray-800 flex fixed inset-0 overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`bg-darkGreen text-gray-300 w-64 flex-shrink-0 h-full flex flex-col transition-transform transform ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 fixed lg:relative z-50`}
      >
        <div className="h-16 flex items-center justify-between px-4 sm:px-6 bg-darkerGreen border-b border-gray-800">
          <Link to="/">
            <img src="/assets/Logo.png" alt="Find My Schemes" className="h-8 w-auto" />
          </Link>
          <button className="lg:hidden text-white" onClick={() => setSidebarOpen(false)}>
            <i className="fa-solid fa-times" />
          </button>
        </div>
        <nav className="flex-grow overflow-y-auto py-4 space-y-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `sidebar-link flex items-center px-6 py-3 text-sm font-medium hover:bg-gray-800 hover:text-white transition-colors ${
                  isActive ? 'active' : ''
                }`
              }
            >
              <i className={`fa-solid ${n.icon} w-5 mr-3 text-center`} /> {n.label}
            </NavLink>
          ))}
        </nav>
        {admin.show && (
          <div className="px-4 pb-3">
            <Link
              to={admin.loggedIn ? '/admin' : `/admin/login?phone=${admin.phone}`}
              onClick={() => setSidebarOpen(false)}
              className="flex items-center justify-between px-3 py-2.5 rounded-md bg-rust/90 hover:bg-rust text-white text-sm font-semibold transition-colors"
            >
              <span><i className="fa-solid fa-user-shield w-5 mr-2 text-center" />Admin Panel</span>
              <i className="fa-solid fa-arrow-right text-xs" />
            </Link>
          </div>
        )}
        <div className="p-4 border-t border-gray-800">
          <a href="#" onClick={logout} className="flex items-center px-2 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors">
            <i className="fa-solid fa-sign-out-alt w-5 mr-3 text-center" /> Logout
          </a>
        </div>
      </aside>

      <div className="flex-grow flex flex-col h-full overflow-hidden relative">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 shadow-sm z-30">
          <div className="flex items-center">
            <button className="lg:hidden text-gray-500 mr-4 focus:outline-none" onClick={() => setSidebarOpen(true)}>
              <i className="fa-solid fa-bars text-xl" />
            </button>
            <h1 className="font-serif text-xl font-bold text-darkGreen">{title}</h1>
          </div>
          <div className="flex items-center space-x-4">
            <Link
              to="/dashboard/wallet"
              className="flex items-center gap-2 bg-softGreen text-darkGreen px-3 py-1.5 rounded-full text-sm font-semibold hover:bg-[#d6ddd3] transition-colors"
              title="Wallet balance — click to recharge"
            >
              <i className="fa-solid fa-wallet" /> {fmtINR(wallet?.balance)}
              <span className="hidden sm:inline text-rust text-xs font-bold">+ Add</span>
            </Link>
            <div className="relative group cursor-pointer">
              <div className="text-gray-500 hover:text-darkGreen transition-colors relative">
                <i className="fa-regular fa-bell text-xl" />
                <span className="absolute -top-1 -right-1 bg-rust text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">1</span>
              </div>
              <div className="absolute right-0 mt-3 w-64 bg-white rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 border border-gray-100">
                <div className="px-4 py-2 border-b border-gray-100 font-semibold text-sm">Notifications</div>
                <div className="p-4 text-sm text-gray-600">Welcome to FindMySchemes! Recharge the wallet and request the first report to get started.</div>
              </div>
            </div>
            <div className="relative group cursor-pointer pl-4 border-l border-gray-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-darkGreen text-white flex items-center justify-center font-semibold text-sm">{initial(name)}</div>
                <span className="text-sm font-medium text-gray-700 hidden sm:block">{firstName(name)}</span>
                <i className="fa-solid fa-chevron-down text-[10px] text-gray-400 hidden sm:block" />
              </div>
              <div className="absolute right-0 mt-3 w-48 bg-white rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 py-2 border border-gray-100">
                <Link to="/dashboard/profile" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Profile</Link>
                <a href="#" onClick={logout} className="block px-4 py-2 text-sm text-rust hover:bg-gray-50">Logout</a>
              </div>
            </div>
          </div>
        </header>

        <main ref={mainRef} className="flex-grow overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
