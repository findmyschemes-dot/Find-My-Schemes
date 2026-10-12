import { createContext, useContext, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { MSG, supportLink } from '../lib/whatsapp'

// Pages can set a more specific message (e.g. the request page adds the Request ID)
const Ctx = createContext({ message: null, setMessage: () => {} })

export function WhatsAppProvider({ children }) {
  const [message, setMessage] = useState(null)
  return (
    <Ctx.Provider value={{ message, setMessage }}>
      {children}
      <FloatingWhatsApp />
    </Ctx.Provider>
  )
}

/** Use on a page: the floating button will send this message while the page is open. */
export function useWhatsAppMessage(text) {
  const { setMessage } = useContext(Ctx)
  useEffect(() => {
    if (!text) return undefined
    setMessage(text)
    return () => setMessage(null)
  }, [text, setMessage])
}

const HIDDEN = [/^\/admin/, /^\/auth\//]

function FloatingWhatsApp() {
  const { message } = useContext(Ctx)
  const { pathname } = useLocation()
  if (HIDDEN.some((re) => re.test(pathname))) return null
  const text = message || (pathname.startsWith('/dashboard') ? MSG.dashboard : MSG.general)
  return (
    <a
      href={supportLink(text)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="group fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 flex items-center gap-2 rounded-full bg-[#25D366] text-white shadow-lg hover:shadow-xl hover:bg-[#1ebe5b] transition-all h-14 w-14 sm:w-auto sm:px-5 justify-center"
    >
      <i className="fa-brands fa-whatsapp text-3xl sm:text-2xl" />
      <span className="hidden sm:inline font-semibold text-sm">Chat with us</span>
    </a>
  )
}

/** Inline button: "Chat on WhatsApp" with a given message. */
export function WhatsAppInline({ text, label = 'Chat on WhatsApp', className = '' }) {
  return (
    <a
      href={supportLink(text)}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2 rounded font-semibold border border-[#25D366] text-[#128C7E] bg-white hover:bg-[#25D366]/10 transition-colors ${className}`}
    >
      <i className="fa-brands fa-whatsapp text-lg text-[#25D366]" /> {label}
    </a>
  )
}
