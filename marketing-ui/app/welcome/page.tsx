'use client';

import { Check, Sparkles, Zap, Lock } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import Logo from '@/components/Logo';

// TODO: Replace with actual Chrome Web Store URL once published
const CHROME_STORE_URL = 'https://chromewebstore.google.com/detail/jobzippy';

function WelcomeContent() {
  const searchParams = useSearchParams();
  const isInstalled = searchParams.get('installed') === 'true';
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (isInstalled) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    }
  }, [isInstalled]);

  return (
    <div className="min-h-screen bg-background text-white">
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size="md" />
            <span className="text-xl font-bold">JobZippy</span>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          {isInstalled && (
            <div className="mb-6 inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-neon-green/30 animate-fade-in-up">
              <Sparkles className="w-4 h-4 text-neon-green" />
              <span className="text-sm text-neon-green font-medium">
                Extension installed successfully!
              </span>
            </div>
          )}

          <h1 className="text-4xl md:text-5xl font-bold mb-2 bg-gradient-to-r from-white via-neon-green to-neon-purple bg-clip-text text-transparent">
            Job application fatigue is real.
          </h1>
          <p className="text-3xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-neon-green to-neon-purple">
            It ends here.
          </p>

          <p className="text-xl text-slate-300 mb-6 max-w-2xl mx-auto">
            Open any job posting, click <span className="text-neon-green font-semibold">Fill Form</span>, and let JobZippy
            instantly fill out the application with your profile — no copy-pasting, no repetitive typing.
          </p>

          <div className="flex flex-wrap justify-center gap-4 text-sm text-slate-400">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-neon-green" />
              <span>3-day free trial</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-neon-green" />
              <span>Cancel anytime</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-neon-green" />
              <span>Works across 100s of job boards</span>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="pb-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {/* Beta Free Plan */}
            <div className="relative group">
              {/* Glow Effect */}
              <div className="absolute -inset-1 bg-gradient-to-r from-neon-green to-neon-blue rounded-3xl blur opacity-25 group-hover:opacity-50 transition duration-500" />

              <div className="relative glass p-8 rounded-3xl h-full flex flex-col border-2 border-neon-green/30">
                {/* Beta Badge */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <div className="px-4 py-1 rounded-full bg-gradient-to-r from-neon-green to-neon-blue text-xs font-bold text-black">
                    CURRENT PLAN
                  </div>
                </div>

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
                <ul className="space-y-3 mb-8 flex-grow">
                  {[
                    'One-click form filling on any job board',
                    'AI-powered field detection & auto-fill',
                    'Works on LinkedIn, Greenhouse, Lever, Ashby & more',
                    'Application tracking dashboard',
                    'Resume & profile storage',
                  ].map((feature, i) => (
                    <li key={i} className="flex items-start gap-3 text-slate-300">
                      <div className="w-5 h-5 rounded-full bg-neon-green/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-neon-green" />
                      </div>
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <a
                  href={CHROME_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-neon-green to-neon-blue text-black font-bold text-center hover:scale-105 hover:shadow-[0_0_30px_rgba(52,255,217,0.4)] transition-all duration-300 block"
                >
                  Start Free Trial
                </a>

                <p className="text-center text-xs text-slate-500 mt-4">
                  Card required • Cancel anytime
                </p>
              </div>
            </div>

            {/* Pro Plan (Coming Soon) */}
            <div className="relative group opacity-60">
              {/* Glow Effect */}
              <div className="absolute -inset-1 bg-gradient-to-r from-neon-purple to-neon-green rounded-3xl blur opacity-10 transition duration-500" />

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
                <ul className="space-y-3 mb-8 flex-grow">
                  <li className="text-slate-400 text-sm font-medium mb-2">
                    Everything in Beta, plus:
                  </li>
                  {[
                    'Unlimited AI-assisted form fills',
                    'Smart cover letter generation',
                    'Priority queue & faster LLM responses',
                    'Advanced application analytics',
                    'Priority support',
                  ].map((feature, i) => (
                    <li key={i} className="flex items-start gap-3 text-slate-400">
                      <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-slate-500" />
                      </div>
                      <span className="text-sm">{feature}</span>
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

                <p className="text-center text-xs text-slate-600 mt-4">
                  Join the waitlist to be notified
                </p>
              </div>
            </div>
          </div>

          {/* How It Works */}
          <div className="mt-16 text-center">
            <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-8">How It Works</p>
            <div className="flex flex-col md:flex-row items-start w-full text-sm">
              <div className="flex-1 flex flex-col items-center gap-2 px-4">
                <div className="w-10 h-10 rounded-full bg-neon-green/20 flex items-center justify-center text-neon-green font-bold text-lg">1</div>
                <p className="text-slate-300 font-medium text-center">Open a job posting</p>
                <p className="text-slate-500 text-xs text-center">On LinkedIn, Greenhouse, Lever, or any ATS</p>
              </div>
              <div className="hidden md:flex items-start pt-3 shrink-0 text-slate-700 text-2xl">→</div>
              <div className="flex-1 flex flex-col items-center gap-2 px-4">
                <div className="w-10 h-10 rounded-full bg-neon-green/20 flex items-center justify-center text-neon-green font-bold text-lg">2</div>
                <p className="text-slate-300 font-medium text-center">Click &quot;Fill Form&quot;</p>
                <p className="text-slate-500 text-xs text-center">JobZippy detects all fields instantly</p>
              </div>
              <div className="hidden md:flex items-start pt-3 shrink-0 text-slate-700 text-2xl">→</div>
              <div className="flex-1 flex flex-col items-center gap-2 px-4">
                <div className="w-10 h-10 rounded-full bg-neon-green/20 flex items-center justify-center text-neon-green font-bold text-lg">3</div>
                <p className="text-slate-300 font-medium text-center">Review &amp; Submit</p>
                <p className="text-slate-500 text-xs text-center">You stay in control — always</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8">
        <div className="max-w-7xl mx-auto px-6 text-center text-slate-500 text-sm">
          <p>© 2026 JobZippy. All rights reserved.</p>
          <div className="flex justify-center gap-6 mt-4">
            <a href="/privacy" className="hover:text-white transition">
              Privacy
            </a>
            <a href="/terms" className="hover:text-white transition">
              Terms
            </a>
            <a href="mailto:support@jobzippy.ai" className="hover:text-white transition">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <WelcomeContent />
    </Suspense>
  );
}
