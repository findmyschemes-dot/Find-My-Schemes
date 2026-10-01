export default function Alert({ type = 'error', children }) {
  if (!children) return null
  const styles =
    type === 'success'
      ? 'bg-green-50 text-green-700 border border-green-200'
      : type === 'info'
      ? 'bg-blue-50 text-blue-700 border border-blue-200'
      : 'bg-red-50 text-red-600'
  return <div className={`mb-4 p-3 rounded text-sm text-center ${styles}`}>{children}</div>
}
