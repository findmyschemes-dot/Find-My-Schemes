import { Link } from 'react-router-dom'

export default function EmptyState({ title, desc, icon, ctaText, ctaLink, onCta }) {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="text-center max-w-md p-8 card">
        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-5 text-gray-400 text-4xl">
          <i className={`fa-solid ${icon}`} />
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">{title}</h2>
        <p className="text-gray-500 mb-6">{desc}</p>
        {ctaText && onCta && (
          <button onClick={onCta} className="btn-primary px-6 py-2.5 inline-block">{ctaText}</button>
        )}
        {ctaText && ctaLink && !onCta && (
          <Link to={ctaLink} className="btn-primary px-6 py-2.5 inline-block">{ctaText}</Link>
        )}
      </div>
    </div>
  )
}
