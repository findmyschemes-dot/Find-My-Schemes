import { Routes, Route, Navigate } from 'react-router-dom'
import { AdminAuthProvider, AdminGuard } from './AdminAuth'
import AdminLayout from './components/AdminLayout'
import AdminLogin from './pages/AdminLogin'
import Analytics from './pages/Analytics'
import Requests from './pages/Requests'
import RequestDetail from './pages/RequestDetail'
import Customers from './pages/Customers'
import CustomerDetail from './pages/CustomerDetail'
import Payments from './pages/Payments'
import Queries from './pages/Queries'
import Applications from './pages/Applications'
import Settings from './pages/Settings'

export default function AdminApp() {
  return (
    <AdminAuthProvider>
      <Routes>
        <Route path="login" element={<AdminLogin />} />
        <Route element={<AdminGuard><AdminLayout /></AdminGuard>}>
          <Route index element={<Analytics />} />
          <Route path="requests" element={<Requests />} />
          <Route path="requests/:id" element={<RequestDetail />} />
          <Route path="customers" element={<Customers />} />
          <Route path="customers/:id" element={<CustomerDetail />} />
          <Route path="payments" element={<Payments />} />
          <Route path="queries" element={<Queries />} />
          <Route path="applications" element={<Applications />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </AdminAuthProvider>
  )
}
