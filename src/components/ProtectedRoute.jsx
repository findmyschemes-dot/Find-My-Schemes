import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Spinner from './Spinner'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner full />
  if (!user) {
    const redirect = location.pathname.replace('/dashboard', '').replace(/^\//, '')
    return <Navigate to={`/login${redirect ? `?redirect=${redirect}` : ''}`} replace />
  }
  return children
}
