import { useEffect, useRef, useState } from 'react'
import Alert from './Alert'
import { OTP_LENGTH, OTP_RESEND_SECONDS, DUMMY_OTP } from '../config/app'

// 6-box OTP input with resend timer
export default function OtpStep({ sentTo, onVerify, onResend, onBack, error, busy, testMode = false }) {
  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''))
  const [timer, setTimer] = useState(OTP_RESEND_SECONDS)
  const refs = useRef([])

  useEffect(() => {
    refs.current[0]?.focus()
  }, [])
  useEffect(() => {
    if (timer <= 0) return
    const t = setTimeout(() => setTimer(timer - 1), 1000)
    return () => clearTimeout(t)
  }, [timer])

  const code = digits.join('')

  const setAt = (i, v) => {
    const clean = v.replace(/\D/g, '')
    if (clean.length > 1) {
      // pasted the whole code
      const next = clean.slice(0, OTP_LENGTH).split('')
      setDigits([...next, ...Array(OTP_LENGTH - next.length).fill('')])
      refs.current[Math.min(next.length, OTP_LENGTH - 1)]?.focus()
      return
    }
    const next = [...digits]
    next[i] = clean
    setDigits(next)
    if (clean && i < OTP_LENGTH - 1) refs.current[i + 1]?.focus()
  }

  const onKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus()
  }

  const submit = (e) => {
    e.preventDefault()
    if (code.length === OTP_LENGTH) onVerify(code)
  }

  const resend = async () => {
    await onResend()
    setDigits(Array(OTP_LENGTH).fill(''))
    setTimer(OTP_RESEND_SECONDS)
    refs.current[0]?.focus()
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <p className="text-sm text-gray-600 text-center">
        Enter the {OTP_LENGTH}-digit code sent to <span className="font-semibold text-gray-900">{sentTo}</span>
      </p>
      {testMode && (
        <div className="p-3 rounded text-xs bg-yellow-50 text-yellow-800 border border-yellow-200 text-center">
          Test mode: no SMS is sent. Use <b className="tracking-widest">{DUMMY_OTP}</b>
        </div>
      )}
      <Alert>{error}</Alert>
      <div className="flex justify-center gap-2">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => (refs.current[i] = el)}
            value={d}
            onChange={(e) => setAt(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={OTP_LENGTH}
            className="w-11 h-12 text-center text-xl font-semibold border border-gray-300 rounded focus:ring-2 focus:ring-darkGreen focus:border-darkGreen outline-none"
            aria-label={`Digit ${i + 1}`}
          />
        ))}
      </div>
      <button type="submit" disabled={busy || code.length !== OTP_LENGTH} className="btn-primary w-full py-3">
        {busy ? 'Verifying…' : 'Verify & Continue'}
      </button>
      <div className="flex justify-between text-sm">
        <button type="button" onClick={onBack} className="text-gray-500 hover:text-darkGreen">
          <i className="fa-solid fa-arrow-left mr-1" /> Change details
        </button>
        {timer > 0 ? (
          <span className="text-gray-400">Resend in {timer}s</span>
        ) : (
          <button type="button" onClick={resend} className="text-rust font-medium hover:underline">Resend code</button>
        )}
      </div>
    </form>
  )
}
