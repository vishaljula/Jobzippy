'use client';

import { Check, Sparkles, Zap, Lock } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function WelcomePage() {
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
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-neon-blue to-neon-purple rounded-lg" />
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

          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white via-neon-blue to-neon-purple bg-clip-text text-transparent">
            Welcome to JobZippy
          </h1>
          
          <p className="text-xl text-slate-300 mb-6 max-w-2xl mx-auto">
            Your personal AI assistant that applies to jobs while you sleep.
            <br />
            Start your <span className="text-neon-green font-semibold">3-day free trial</span> to get started.
          </p>

          <div className="flex flex-wrap justify-center gap-4 text-sm text-slate-400">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-neon-green" />
              <span>No credit card required for trial</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-neon-green" />
              <span>Cancel anytime</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-neon-green" />
              <span>300 applications/month</span>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="pb-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            
            {/* Basic Plan */}
            <div className="relative group">
              {/* Glow Effect */}
              <div className="absolute -inset-1 bg-gradient-to-r from-neon-blue to-neon-purple rounded-3xl blur opacity-25 group-hover:opacity-50 transition duration-500" />
              
              <div className="relative glass p-8 rounded-3xl h-full flex flex-col border-2 border-neon-blue/30">
                {/* Header */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-5 h-5 text-neon-blue" />
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
                    3-day free trial • Then $9.99/month
                  </p>
                </div>

                {/* Features */}
                <ul className="space-y-3 mb-8 flex-grow">
                  {[
                    'LinkedIn auto-apply',
                    '300 applications per month',
                    'AI-powered cover letters',
                    'Google Sheets tracking',
                    'Application analytics',
                    'Email notifications',
                  ].map((feature, i) => (
                    <li key={i} className="flex items-start gap-3 text-slate-300">
                      <div className="w-5 h-5 rounded-full bg-neon-blue/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-neon-blue" />
                      </div>
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <button
                  onClick={() => {
                    // TODO: Implement sign in + checkout flow
                    alert('Starting checkout flow...');
                  }}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-neon-blue to-neon-purple text-white font-bold text-center hover:scale-105 hover:shadow-[0_0_30px_rgba(0,240,255,0.5)] transition-all duration-300"
                >
                  Start Free Trial
                </button>

                <p className="text-center text-xs text-slate-500 mt-4">
                  Card required • Cancel anytime
                </p>
              </div>
            </div>

            {/* Premium Plan (Coming Soon) */}
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
                    <h3 className="text-2xl font-bold">Premium</h3>
                  </div>
                  <p className="text-slate-400 text-sm">For serious job seekers</p>
                </div>

                {/* Price */}
                <div className="mb-6">
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-bold text-white">$TBD</span>
                    <span className="text-slate-400">/month</span>
                  </div>
                  <p className="text-slate-500 text-sm mt-2 font-medium">
                    Pricing to be announced
                  </p>
                </div>

                {/* Features */}
                <ul className="space-y-3 mb-8 flex-grow">
                  <li className="text-slate-400 text-sm font-medium mb-2">
                    Everything in Basic, plus:
                  </li>
                  {[
                    'Indeed auto-apply',
                    'Glassdoor auto-apply',
                    'Dice auto-apply',
                    'ZipRecruiter auto-apply',
                    'Unlimited applications',
                    'Priority support',
                    'Advanced analytics',
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
                  Join waitlist to be notified
                </p>
              </div>
            </div>

          </div>

          {/* Trust Signals */}
          <div className="mt-12 text-center">
            <p className="text-slate-500 text-sm mb-4">Trusted by job seekers worldwide</p>
            <div className="flex justify-center gap-8 text-slate-600 text-xs">
              <div>
                <div className="text-2xl font-bold text-neon-blue mb-1">10K+</div>
                <div>Applications sent</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-neon-green mb-1">500+</div>
                <div>Users hired</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-neon-purple mb-1">4.8/5</div>
                <div>User rating</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8">
        <div className="max-w-7xl mx-auto px-6 text-center text-slate-500 text-sm">
          <p>© 2025 JobZippy. All rights reserved.</p>
          <div className="flex justify-center gap-6 mt-4">
            <a href="/privacy" className="hover:text-white transition">Privacy</a>
            <a href="/terms" className="hover:text-white transition">Terms</a>
            <a href="mailto:support@jobzippy.ai" className="hover:text-white transition">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

