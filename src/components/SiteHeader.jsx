import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { firstName, initial } from '../lib/format'

const SERVICES = ['Schemes', 'Subsidies', 'Grants', 'Incentives', 'Benefits']

export default function SiteHeader({ onReportClick }) {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const name = profile?.full_name || 'Customer'

  const logout = async (e) => {
    e.preventDefault()
    await signOut()
    navigate('/login')
  }

  return (
    <header className="bg-darkGreen text-white sticky top-0 z-50 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-center md:justify-between items-center relative">
        <Link to="/" className="flex items-center gap-2">
          <img src="/assets/Logo.png" alt="Find My Schemes Logo" className="h-14 sm:h-16 w-auto" />
        </Link>

        <div className="hidden md:flex items-center gap-6">
          <div className="relative group">
            <a href="#services" className="text-sm font-medium hover:text-gray-300 transition-colors flex items-center gap-1">
              Our Services <i className="fa-solid fa-chevron-down text-[10px]" />
            </a>
            <div className="absolute left-0 mt-2 w-40 bg-white rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 py-2 border border-gray-100">
              {SERVICES.map((s) => (
                <span key={s} className="block px-4 py-2 text-sm text-gray-700 cursor-default hover:bg-gray-50 transition-colors">{s}</span>
              ))}
            </div>
          </div>

          {user ? (
            <div className="relative group">
              <button className="flex items-center gap-2 text-sm font-medium hover:text-gray-300 transition-colors bg-darkerGreen px-3 py-2 rounded">
                <div className="w-6 h-6 rounded-full bg-rust flex items-center justify-center text-white text-xs">{initial(name)}</div>
                Hi, {firstName(name)} <i className="fa-solid fa-chevron-down text-[10px]" />
              </button>
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 py-2 border border-gray-100">
                {[
                  ['/dashboard', 'Dashboard'],
                  ['/dashboard/reports', 'My Reports'],
                  ['/dashboard/applications', 'My Applications'],
                  ['/dashboard/profile', 'Profile'],
                ].map(([to, label]) => (
                  <Link key={to} to={to} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">{label}</Link>
                ))}
                <hr className="my-1 border-gray-100" />
                <a href="#" onClick={logout} className="block px-4 py-2 text-sm text-rust hover:bg-gray-50 transition-colors">Logout</a>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Link to="/login" className="text-sm font-medium hover:text-gray-300 transition-colors">Login</Link>
              <Link to="/signup" className="text-sm font-medium hover:text-gray-300 transition-colors">Sign Up</Link>
              <button onClick={onReportClick} className="bg-rust hover:bg-rustHover text-white px-5 py-2.5 rounded text-sm font-semibold transition-colors duration-300 shadow-sm">
                Get My Scheme Report
              </button>
            </div>
          )}
        </div>

        <button className="md:hidden absolute right-4 sm:right-6 text-white text-2xl focus:outline-none" onClick={() => setOpen(!open)} aria-label="Menu">
          <i className="fa-solid fa-bars" />
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-darkerGreen border-t border-gray-700">
          <div className="px-4 pt-4 pb-6 space-y-4 shadow-inner">
            <div className="text-gray-200 font-medium text-lg border-b border-gray-600 pb-3">
              Our Services
              <div className="pl-2 mt-3 space-y-3 text-base text-gray-400 font-normal">
                {SERVICES.map((s) => <span key={s} className="block">{s}</span>)}
              </div>
            </div>
            {user ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-darkGreen rounded">
                  <div className="w-10 h-10 rounded-full bg-rust flex items-center justify-center text-white text-lg">{initial(name)}</div>
                  <div>
                    <div className="text-white font-medium">Hi, {name}</div>
                    <Link to="/dashboard" className="text-sm text-gray-400">Go to Dashboard &rarr;</Link>
                  </div>
                </div>
                <a href="#" onClick={logout} className="block w-full text-center border border-gray-600 text-gray-300 hover:text-white px-5 py-2 rounded text-base font-semibold transition-colors">Logout</a>
              </div>
            ) : (
              <div className="space-y-4">
                <Link to="/login" className="block w-full text-center text-gray-200 hover:text-white px-5 py-2 rounded text-base font-semibold">Login</Link>
                <Link to="/signup" className="block w-full text-center text-gray-200 hover:text-white px-5 py-2 rounded text-base font-semibold">Sign Up</Link>
                <button onClick={onReportClick} className="block w-full text-center bg-rust hover:bg-rustHover text-white px-5 py-3 rounded text-base font-semibold transition-colors shadow-sm">
                  Get My Scheme Report
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
