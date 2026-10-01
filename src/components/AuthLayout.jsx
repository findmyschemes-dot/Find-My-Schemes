import { Link } from 'react-router-dom'
import { isSupabaseConfigured } from '../lib/supabase'

export default function AuthLayout({ title, subtitle, wide = false, children }) {
  return (
    <div className="font-sans bg-beige text-gray-800 min-h-screen flex flex-col">
      <header className="bg-darkGreen py-4 px-6 flex justify-center shadow-sm">
        <Link to="/">
          <img src="/assets/Logo.png" alt="Find My Schemes" className="h-12 w-auto" />
        </Link>
      </header>
      <main className="flex-grow flex items-center justify-center p-4 py-10">
        <div className={`bg-white rounded-xl shadow-xl p-8 w-full ${wide ? 'max-w-lg' : 'max-w-md'} border border-gray-100`}>
          {!isSupabaseConfigured && (
            <div className="mb-4 p-3 rounded text-xs bg-yellow-50 text-yellow-800 border border-yellow-200">
              Supabase is not connected yet. Add <code>VITE_SUPABASE_URL</code> and{' '}
              <code>VITE_SUPABASE_ANON_KEY</code> to the <code>.env</code> file and restart <code>npm run dev</code>.
            </div>
          )}
          <div className="text-center mb-8">
            <h1 className="font-serif text-3xl font-bold text-darkGreen mb-2">{title}</h1>
            <p className="text-gray-500">{subtitle}</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}
