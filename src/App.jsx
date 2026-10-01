import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Spinner from './components/Spinner'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardLayout from './pages/dashboard/DashboardLayout'
import Overview from './pages/dashboard/Overview'
import Reports from './pages/dashboard/Reports'
import ReportDetail from './pages/dashboard/ReportDetail'
import RequestReport from './pages/dashboard/RequestReport'
import ReportSuccess from './pages/dashboard/ReportSuccess'
import Applications from './pages/dashboard/Applications'
import Queries from './pages/dashboard/Queries'
import Wallet from './pages/dashboard/Wallet'
import Profile from './pages/dashboard/Profile'

const AdminApp = lazy(() => import('./admin/AdminApp'))

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Overview />} />
        <Route path="reports" element={<Reports />} />
        <Route path="reports/:id" element={<ReportDetail />} />
        <Route path="request-report" element={<RequestReport />} />
        <Route path="report-success" element={<ReportSuccess />} />
        <Route path="applications" element={<Applications />} />
        <Route path="queries" element={<Queries />} />
        <Route path="wallet" element={<Wallet />} />
        <Route path="transactions" element={<Navigate to="/dashboard/wallet" replace />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route path="/admin/*" element={<Suspense fallback={<Spinner full />}><AdminApp /></Suspense>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
