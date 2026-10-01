import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SiteHeader from '../components/SiteHeader'
import { useAuth } from '../context/AuthContext'

const SLIDES = [
  { src: '/assets/image_1.jpg', alt: 'Business owner' },
  { src: '/assets/image_2.jpg', alt: 'Business planning' },
  { src: '/assets/image_3.jpg', alt: 'Meeting' },
  { src: '/assets/image_4.jpg', alt: 'Teamwork' },
]

const TAGS = ['Schemes', 'Subsidies', 'Grants', 'Incentives', 'Benefits']

const REPORT_FEATURES = [
  { icon: 'fa-solid fa-magnifying-glass', title: 'What', text: 'Relevant schemes for your business.' },
  { icon: 'fa-regular fa-lightbulb', title: 'Why', text: 'Why you may qualify.' },
  { icon: 'fa-solid fa-hand-holding-dollar', title: 'What You Get', text: 'Potential benefits and support.' },
  { icon: 'fa-regular fa-file-alt', title: 'What You Need', text: 'Eligibility and documents.' },
  { icon: 'fa-solid fa-arrow-right', title: "What's Next", text: 'Application steps and action points.' },
]

const STEPS = [
  { icon: 'fa-solid fa-user-check', title: 'Sign Up with OTP', text: 'Create an account in a minute — no password needed.' },
  { icon: 'fa-solid fa-wallet', title: 'Recharge Wallet', text: <>₹499 per report.<br />No subscription.</> },
  { icon: 'fa-regular fa-file-lines', title: <>Tell Us About<br />Your Business</>, text: 'Fill in your business and project details.' },
  { icon: 'fa-regular fa-envelope', title: 'Get Your Report', text: 'Your custom-curated report arrives in your email within 24 hours.' },
]

const AUDIENCE = ['Startups', 'MSMEs', 'Manufacturers', 'Exporters', 'Service Businesses']

function HeroSlideshow() {
  const [active, setActive] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setActive((i) => (i + 1) % SLIDES.length), 4000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="relative w-full h-full rounded-xl shadow-2xl overflow-hidden z-10 bg-darkGreen">
      {SLIDES.map((s, i) => (
        <img
          key={s.src}
          src={s.src}
          alt={s.alt}
          className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-1000 ${
            i === active ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ))}
    </div>
  )
}

export default function Landing() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // All "Get my report" buttons go to the in-app request flow (login first if needed)
  const goToReport = (e) => {
    e?.preventDefault()
    navigate(user ? '/dashboard/request-report' : '/login?redirect=request-report')
  }

  return (
    <div className="font-sans bg-beige text-gray-800 antialiased">
      <SiteHeader onReportClick={goToReport} />

      {/* Hero */}
      <section className="bg-beige pt-16 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-8 lg:gap-20">
          <div className="contents lg:flex lg:w-1/2 lg:flex-col lg:gap-6 relative z-10">
            <div className="flex flex-col gap-1 md:gap-6 order-1 lg:order-none w-full">
              <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-darkGreen font-bold leading-none md:leading-tight tracking-tight">
                Your Business May Be Eligible for <span className="italic text-[#c28c31] font-medium">More.</span>
              </h1>
              <h2 className="text-xl sm:text-2xl font-bold text-darkGreen mt-4 md:mt-0 leading-tight md:leading-normal">
                Schemes. Subsidies. Grants. Incentives.
              </h2>
              <p className="text-lg text-gray-700 max-w-lg leading-tight md:leading-normal">
                Find the government support that may fit your business.
              </p>
            </div>

            <div className="flex flex-col gap-3 order-3 lg:order-none mt-6 lg:mt-0 w-full">
              <button
                onClick={goToReport}
                className="bg-rust hover:bg-rustHover text-white px-8 py-4 rounded w-fit flex items-center justify-center gap-3 text-lg font-semibold transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 mx-auto lg:mx-0 text-center"
              >
                Get My Scheme Eligibility Report <i className="fa-solid fa-arrow-right" />
              </button>
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 sm:gap-4 w-full text-center">
                <span className="text-gray-800 font-medium text-sm">₹499 | Delivered within 24 hours</span>
                <a
                  href="/assets/Demo.pdf"
                  download
                  className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-rust px-4 py-2 rounded-md shadow-sm flex items-center justify-center gap-2 text-sm font-semibold transition-all duration-200"
                >
                  <i className="fa-solid fa-download" /> Demo report
                </a>
              </div>
              <hr className="border-gray-300 w-full max-w-md my-4" />
              <p className="text-gray-600 text-base md:text-lg leading-relaxed max-w-md">
                You tell us about your business. We find what may be available.
              </p>
            </div>
          </div>

          <div className="w-full lg:w-1/2 relative h-[300px] sm:h-[400px] lg:h-[500px] order-2 lg:order-none mt-4 lg:mt-0">
            <div className="absolute -inset-4 bg-gradient-to-tr from-cardBeige to-transparent rounded-2xl transform rotate-3 -z-10" />
            <HeroSlideshow />
          </div>
        </div>
      </section>

      {/* What are you missing */}
      <section className="bg-darkGreen text-white py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row justify-between items-center gap-12 lg:gap-24">
          <div className="w-full lg:w-1/2">
            <span className="text-yellow-500 uppercase tracking-widest text-sm sm:text-base font-bold">Opportunities Await</span>
            <h2 className="font-serif text-4xl sm:text-5xl font-bold mt-4 leading-tight">What Are You Missing?</h2>
            <p className="mt-6 text-gray-300 text-lg sm:text-xl leading-relaxed font-light">
              Government support exists.
              <br />
              But finding what applies to your business isn't always easy.
            </p>
          </div>
          <div className="w-full lg:w-1/2 bg-white/5 rounded-2xl p-8 sm:p-12 backdrop-blur-sm border border-white/10">
            <ul className="flex flex-col gap-10">
              {[
                ['fa-solid fa-building-columns', 'Your Business.'],
                ['fa-regular fa-file-lines', 'Your Eligibility.'],
                ['fa-solid fa-users', 'Your Schemes.'],
              ].map(([icon, label]) => (
                <li key={label} className="flex items-center gap-6">
                  <div className="bg-softGreen text-darkGreen w-14 h-14 rounded-full flex items-center justify-center shrink-0 shadow-inner">
                    <i className={`${icon} text-xl`} />
                  </div>
                  <span className="text-2xl font-serif font-medium">{label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="bg-beige py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-rust uppercase tracking-widest text-sm sm:text-base font-bold">Our Services</span>
            <h2 className="font-serif text-4xl sm:text-5xl font-bold text-darkGreen mt-4">Simple Solutions for Your Business</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            <div className="bg-cardBeige rounded-2xl p-8 sm:p-10 relative overflow-hidden border border-[#e2dccf] flex flex-col justify-between">
              <i className="fa-regular fa-file-alt absolute right-8 top-8 text-8xl text-darkGreen opacity-5" />
              <div>
                <div className="flex items-center gap-4 mb-6">
                  <span className="text-5xl font-serif text-darkGreen opacity-40 font-bold tracking-tighter">01</span>
                  <i className="fa-regular fa-file-lines text-3xl text-darkGreen" />
                </div>
                <h3 className="text-sm font-bold tracking-widest uppercase text-darkGreen mb-2">Scheme Eligibility Report</h3>
                <h4 className="font-serif text-2xl font-bold text-darkGreen mb-6">Know What You May Be Eligible For.</h4>
                <div className="flex flex-wrap gap-2 mb-8">
                  {TAGS.map((t) => (
                    <span key={t} className="bg-beige border border-gray-300 text-gray-700 text-xs font-medium px-3 py-1 rounded-sm shadow-sm">{t}</span>
                  ))}
                </div>
                <div className="text-gray-700 mb-6">
                  <p>Mapped to your business:</p>
                  <p className="font-bold text-darkGreen mt-1 text-lg flex items-center gap-2">
                    <span className="w-8 h-[2px] bg-rust inline-block" /> ₹499 | One-time
                  </p>
                </div>
              </div>
              <button onClick={goToReport} className="bg-rust hover:bg-rustHover text-white px-6 py-3.5 rounded w-full flex justify-center items-center gap-2 font-semibold transition-colors mt-auto">
                GET MY REPORT <i className="fa-solid fa-arrow-right" />
              </button>
            </div>

            <div className="bg-cardBeige rounded-2xl p-8 sm:p-10 relative overflow-hidden border border-[#e2dccf] flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-4 mb-6">
                  <span className="text-5xl font-serif text-darkGreen opacity-40 font-bold tracking-tighter">02</span>
                  <i className="fa-solid fa-users text-3xl text-darkGreen" />
                </div>
                <h3 className="text-sm font-bold tracking-widest uppercase text-darkGreen mb-2">Application Support</h3>
                <h4 className="font-serif text-2xl font-bold text-darkGreen mb-4">Found a Scheme? Let's Take It Forward.</h4>
                <p className="text-gray-700 mb-4 leading-relaxed">We can support you with the application process</p>
                <p className="text-rust font-serif italic text-lg font-medium mb-8">Understand. Prepare. Apply.</p>
              </div>
              <button
                onClick={() => navigate(user ? '/dashboard/applications' : '/login?redirect=applications')}
                className="bg-rust hover:bg-rustHover text-white px-6 py-3.5 rounded w-full flex justify-center items-center gap-2 font-semibold transition-colors mt-auto"
              >
                EXPLORE APPLICATION SUPPORT <i className="fa-solid fa-arrow-right" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* What's in the report */}
      <section className="bg-darkGreen text-white py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto text-center">
          <span className="text-yellow-500 uppercase tracking-widest text-sm sm:text-base font-bold">What's In Your Report?</span>
          <h2 className="font-serif text-4xl sm:text-5xl font-bold text-white mt-4 mb-2">More Than a Scheme List.</h2>
          <p className="text-gray-300 mb-16 text-lg">Your report tells you:</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8 lg:gap-4 mb-16">
            {REPORT_FEATURES.map((f, i) => (
              <div
                key={f.title}
                className={`flex flex-col items-center text-center ${
                  i === 4 ? 'col-span-2 md:col-span-1 md:col-start-2 lg:col-span-1 lg:col-start-auto' : ''
                }`}
              >
                <div className="w-16 h-16 rounded-full border border-white/20 flex items-center justify-center mb-4 text-yellow-500">
                  <i className={`${f.icon} text-2xl`} />
                </div>
                <h4 className="font-bold text-white mb-2 uppercase text-sm tracking-wide">{f.title}</h4>
                <p className="text-gray-300 text-sm leading-relaxed max-w-[150px]">{f.text}</p>
              </div>
            ))}
          </div>
          <div className="bg-softGreen py-4 px-8 rounded inline-block w-full max-w-4xl border border-[#d1d9cf]">
            <span className="font-serif italic font-semibold text-darkGreen text-xl">Clarity before you apply.</span>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-beige py-24 px-4 sm:px-6 lg:px-8 border-t border-gray-200">
        <div className="max-w-6xl mx-auto text-center">
          <span className="text-rust uppercase tracking-widest text-sm sm:text-base font-bold block mb-3">How It Works</span>
          <hr className="w-16 mx-auto border-t-2 border-rust mb-4" />
          <h2 className="font-serif text-4xl sm:text-5xl font-bold text-darkGreen mt-2 mb-16 relative inline-block">
            Four Steps. That's It.
            <span className="absolute bottom-0 left-1/4 w-1/2 h-[2px] bg-yellow-500/50" />
          </h2>
          <div className="relative">
            <div className="hidden lg:block absolute top-10 left-[12.5%] right-[12.5%] h-[1px] bg-gray-300 z-0" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-4 relative z-10">
              {STEPS.map((s, i) => (
                <div key={i} className="flex flex-col items-center text-center px-4 bg-beige relative">
                  <div className="w-20 h-20 bg-beige rounded-full border-2 border-gray-200 flex items-center justify-center mb-6 relative z-10">
                    <i className={`${s.icon} text-2xl text-rust`} />
                  </div>
                  <span className="text-yellow-600 font-bold text-xl mb-2">0{i + 1}</span>
                  <div className="h-12 flex items-center justify-center mb-3">
                    <h4 className="font-bold text-darkGreen text-base uppercase tracking-wide">{s.title}</h4>
                  </div>
                  <p className="text-gray-600 text-base leading-relaxed">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-20 bg-softGreen py-6 px-8 rounded border border-[#d1d9cf] w-full max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-6 shadow-sm">
            <i className="fa-solid fa-paper-plane text-3xl text-darkGreen transform -rotate-12" />
            <div className="h-12 w-[1px] bg-gray-400 hidden sm:block" />
            <span className="font-serif italic font-semibold text-darkGreen text-xl sm:text-2xl text-center sm:text-left">
              You share the details.
              <br />
              We do the digging.
            </span>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-darkGreen py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden text-center z-10">
        <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none transform translate-x-1/4 translate-y-1/4 z-0 text-white">
          <i className="fa-solid fa-building-columns text-[300px]" />
        </div>
        <div className="max-w-3xl mx-auto relative z-10 flex flex-col items-center">
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-white font-bold mb-10 leading-snug">
            Ready to discover what your business may be eligible for?
          </h2>
          <button
            onClick={goToReport}
            className="bg-rust hover:bg-rustHover text-white px-8 py-4 rounded-md flex items-center justify-center gap-3 text-lg font-semibold transition-transform duration-300 hover:scale-105 shadow-xl w-fit mx-auto"
          >
            Get My Scheme Eligibility Report <i className="fa-solid fa-arrow-right" />
          </button>
          <div className="flex items-center justify-center gap-4 mt-4">
            <p className="text-gray-300 font-medium text-sm">₹499 | Delivered within 24 hours</p>
            <a
              href="/assets/Demo.pdf"
              download
              className="bg-white/10 border border-white/20 text-white hover:bg-white/20 px-4 py-2 rounded-md shadow-sm flex items-center gap-2 text-sm font-semibold transition-all duration-200"
            >
              <i className="fa-solid fa-download" /> Demo report
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-darkerGreen text-gray-400 py-16 px-4 sm:px-6 lg:px-8 border-t border-gray-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between gap-6 md:gap-12">
          <div className="w-full md:w-1/2 lg:w-5/12">
            <div className="flex items-center gap-2 mb-6">
              <img src="/assets/Logo.png" alt="Find My Schemes Logo" className="h-[70px] sm:h-[80px] w-auto opacity-90" />
            </div>
            <p className="text-sm leading-relaxed mb-4 md:mb-10 max-w-sm">
              We research Central and State government schemes and organize relevant opportunities into solid, actionable
              business reports for Indian businesses.
            </p>
            <p className="text-xs text-gray-500 hidden md:block">&copy; 2026 Find My Schemes. All rights reserved.</p>
          </div>
          <div className="w-full md:w-1/2 lg:w-1/3">
            <h4 className="text-yellow-600 font-semibold text-sm tracking-wider uppercase mb-6">Who Is It For?</h4>
            <ul className="flex flex-col gap-3 text-sm text-gray-300">
              {AUDIENCE.map((a) => (
                <li key={a}><a href="#" className="hover:text-white transition-colors">{a}</a></li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-12 md:hidden">
          <p className="text-xs text-gray-500">&copy; 2026 Find My Schemes. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
