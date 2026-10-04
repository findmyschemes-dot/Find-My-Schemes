import { useEffect, useRef } from 'react'
import { PHONE_EMAIL_CLIENT_ID, PHONE_EMAIL_SCRIPT } from '../config/app'

/**
 * Phone.Email "Sign in with Phone" button.
 * Phone.Email verifies the number (sends + checks the OTP) and then calls
 * window.phoneEmailListener({ user_json_url }). We pass that URL to onVerified;
 * the server (Edge Function) reads the verified number from it.
 */
export default function PhoneEmailButton({ onVerified, disabled = false }) {
  const box = useRef(null)
  const cb = useRef(onVerified)
  cb.current = onVerified
  const lastUrl = useRef({ url: '', at: 0 })

  useEffect(() => {
    if (disabled || !box.current) return

    // One callback per verification: Phone.Email can fire it more than once
    window.phoneEmailListener = (userObj) => {
      const url = userObj?.user_json_url
      if (!url) return
      const now = Date.now()
      if (lastUrl.current.url === url && now - lastUrl.current.at < 10000) return
      lastUrl.current = { url, at: now }
      cb.current?.(url)
    }

    // Load the provider script once for this button. (React dev mode runs effects twice;
    // the flag on the element stops a second copy of the script drawing into it.)
    if (box.current.dataset.peLoaded) return
    box.current.dataset.peLoaded = '1'
    document.querySelectorAll('script[data-pe-signin]').forEach((el) => el.remove())
    const s = document.createElement('script')
    s.src = PHONE_EMAIL_SCRIPT
    s.async = true
    s.dataset.peSignin = '1'
    document.body.appendChild(s)
  }, [disabled])

  // Remove the global callback only when the button really leaves the page
  useEffect(() => () => {
    delete window.phoneEmailListener
  }, [])

  if (disabled) return null
  return (
    <div className="flex justify-center min-h-[48px]">
      <div ref={box} className="pe_signin_button" data-client-id={PHONE_EMAIL_CLIENT_ID} />
    </div>
  )
}
