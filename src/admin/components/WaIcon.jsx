import { waLink } from '../../lib/whatsapp'

/** Small WhatsApp icon-link to message a customer / lead with a ready-made text. */
export default function WaIcon({ number, text, label, className = '' }) {
  if (!number) return null
  return (
    <a
      href={waLink(number, text)}
      target="_blank"
      rel="noopener noreferrer"
      title={label || 'Message on WhatsApp'}
      className={`inline-flex items-center gap-1 text-[#128C7E] hover:text-[#075E54] font-medium ${className}`}
    >
      <i className="fa-brands fa-whatsapp text-base text-[#25D366]" />
      {label && <span>{label}</span>}
    </a>
  )
}
