export default function Spinner({ full = false }) {
  return (
    <div className={`flex items-center justify-center ${full ? 'min-h-screen bg-beige' : 'py-16'}`}>
      <i className="fa-solid fa-circle-notch fa-spin text-3xl text-darkGreen" />
    </div>
  )
}
