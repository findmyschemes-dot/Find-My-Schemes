// Mobile number box with a fixed +91 prefix (another country: type the full number with its code)
export default function PhoneInput({ value, onChange, autoFocus, required = true }) {
  return (
    <div className="flex">
      <span className="px-3 flex items-center bg-gray-50 border border-r-0 border-gray-300 rounded-l text-sm text-gray-600 select-none">+91</span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        autoFocus={autoFocus}
        required={required}
        maxLength={16}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d+\s-]/g, ''))}
        placeholder="98765 43210"
        className="input rounded-l-none"
        aria-label="Mobile number"
      />
    </div>
  )
}
