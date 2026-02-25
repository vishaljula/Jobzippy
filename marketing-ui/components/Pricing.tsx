import { Check, Zap, Sparkles, Lock } from 'lucide-react';
import Link from 'next/link';

// TODO: Replace with actual Chrome Web Store URL once published
const CHROME_STORE_URL = 'https://chromewebstore.google.com/detail/jobzippy';

export default function Pricing() {
  return (
    <section id="pricing" className="py-24 relative">
      <div className="max-w-6xl mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            Simple,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-green to-neon-purple">
              Transparent Pricing
            </span>
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Start with a 3-day free trial. No commitments, cancel anytime.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Beta Free Plan */}
          <div className="relative group">
            {/* Glow Effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-neon-green to-neon-blue rounded-3xl blur opacity-25 group-hover:opacity-50 transition duration-500" />

            <div className="relative glass p-8 rounded-3xl h-full flex flex-col border-2 border-neon-green/30">
              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-5 h-5 text-neon-green" />
                  <h3 className="text-2xl font-bold">Basic</h3>
                </div>
                <p className="text-slate-400 text-sm">Perfect for getting started</p>
              </div>

              {/* Price */}
              <div className="mb-6">
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-bold text-white">$9.99</span>
                  <span className="text-slate-400">/month</span>
                </div>
                <p className="text-neon-green text-sm mt-2 font-medium">
                  3-day free trial &bull; Then $9.99/month
                </p>
              </div>

              {/* Features */}
              <ul className="space-y-4 mb-8 flex-grow">
                {[
                  'One-click form filling on any job board',
                  'AI-powered field detection & auto-fill',
                  'Works on LinkedIn, Greenhouse, Lever, Ashby & more',
                  'Application tracking dashboard',
                  'Resume & profile storage',
                ].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-300">
                    <div className="w-5 h-5 rounded-full bg-neon-green/20 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-neon-green" />
                    </div>
                    {feature}
                  </li>
                ))}
              </ul>

              {/* CTA Button */}
              <Link
                href={CHROME_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-4 rounded-xl bg-gradient-to-r from-neon-green to-neon-blue text-black font-bold text-center hover:scale-105 hover:shadow-[0_0_30px_rgba(52,255,217,0.4)] transition-all duration-300"
              >
                Start Free Trial
              </Link>

              <p className="text-center text-xs text-slate-500 mt-4">Card required &bull; Cancel anytime</p>
            </div>
          </div>

          {/* Pro Plan (Coming Soon) */}
          <div className="relative group opacity-60">
            {/* Glow Effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-neon-purple to-neon-blue rounded-3xl blur opacity-10 transition duration-500" />

            <div className="relative glass p-8 rounded-3xl h-full flex flex-col border-2 border-white/10">
              {/* Coming Soon Badge */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <div className="px-4 py-1 rounded-full bg-gradient-to-r from-neon-purple to-neon-green text-xs font-bold text-black">
                  COMING SOON
                </div>
              </div>

              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-5 h-5 text-neon-purple" />
                  <h3 className="text-2xl font-bold">Pro</h3>
                </div>
                <p className="text-slate-400 text-sm">For serious job seekers</p>
              </div>

              {/* Price */}
              <div className="mb-6">
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-bold text-white">$TBD</span>
                </div>
                <p className="text-slate-500 text-sm mt-2 font-medium">Pricing to be announced</p>
              </div>

              {/* Features */}
              <ul className="space-y-4 mb-8 flex-grow">
                <li className="text-slate-400 text-sm font-medium mb-2">Everything in Beta, plus:</li>
                {[
                  'Unlimited AI-assisted form fills',
                  'Smart cover letter generation',
                  'Priority queue & faster LLM responses',
                  'Advanced application analytics',
                  'Priority support',
                ].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-400">
                    <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-slate-500" />
                    </div>
                    {feature}
                  </li>
                ))}
              </ul>

              {/* Disabled Button */}
              <button
                disabled
                className="w-full py-4 rounded-xl bg-white/5 text-slate-500 font-bold text-center cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" />
                Coming Soon
              </button>

              <p className="text-center text-xs text-slate-600 mt-4">Join waitlist to be notified</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
