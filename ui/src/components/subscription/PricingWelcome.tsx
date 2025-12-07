import { Check, Sparkles, Zap, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PricingWelcomeProps {
  onStartTrial: () => void;
  loading?: boolean;
}

export function PricingWelcome({ onStartTrial, loading }: PricingWelcomeProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#020617]">
      <div className="max-w-5xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white via-[#00f0ff] to-[#7000ff] bg-clip-text text-transparent">
            Welcome to JobZippy
          </h1>
          <p className="text-xl text-slate-300 mb-6">
            Your personal AI assistant that applies to jobs while you sleep.
            <br />
            Start your <span className="text-[#00ff9d] font-semibold">3-day free trial</span> to get
            started.
          </p>

          <div className="flex flex-wrap justify-center gap-4 text-sm text-slate-400">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-[#00ff9d]" />
              <span>Card required</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-[#00ff9d]" />
              <span>Cancel anytime</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-[#00ff9d]" />
              <span>300 applications/month</span>
            </div>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Basic Plan */}
          <div className="relative group">
            {/* Glow Effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-[#00f0ff] to-[#7000ff] rounded-3xl blur opacity-25 group-hover:opacity-50 transition duration-500" />

            <div className="relative bg-white/5 backdrop-blur-lg border border-white/10 p-8 rounded-3xl h-full flex flex-col border-2 border-[#00f0ff]/30">
              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-5 h-5 text-[#00f0ff]" />
                  <h3 className="text-2xl font-bold text-white">Basic</h3>
                </div>
                <p className="text-slate-400 text-sm">Perfect for getting started</p>
              </div>

              {/* Price */}
              <div className="mb-6">
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-bold text-white">$9.99</span>
                  <span className="text-slate-400">/month</span>
                </div>
                <p className="text-[#00ff9d] text-sm mt-2 font-medium">
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
                    <div className="w-5 h-5 rounded-full bg-[#00f0ff]/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-[#00f0ff]" />
                    </div>
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA Button */}
              <Button
                onClick={onStartTrial}
                disabled={loading}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-[#00f0ff] to-[#7000ff] text-white font-bold hover:scale-105 hover:shadow-[0_0_30px_rgba(0,240,255,0.5)] transition-all duration-300"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Start Free Trial
                  </>
                )}
              </Button>

              <p className="text-center text-xs text-slate-500 mt-4">
                Card required • Cancel anytime
              </p>
            </div>
          </div>

          {/* Premium Plan (Coming Soon) */}
          <div className="relative group opacity-60">
            {/* Glow Effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-[#7000ff] to-[#00ff9d] rounded-3xl blur opacity-10 transition duration-500" />

            <div className="relative bg-white/5 backdrop-blur-lg border border-white/10 p-8 rounded-3xl h-full flex flex-col">
              {/* Coming Soon Badge */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <div className="px-4 py-1 rounded-full bg-gradient-to-r from-[#7000ff] to-[#00ff9d] text-xs font-bold text-black">
                  COMING SOON
                </div>
              </div>

              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-5 h-5 text-[#7000ff]" />
                  <h3 className="text-2xl font-bold text-white">Premium</h3>
                </div>
                <p className="text-slate-400 text-sm">For serious job seekers</p>
              </div>

              {/* Price */}
              <div className="mb-6">
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-bold text-white">$TBD</span>
                  <span className="text-slate-400">/month</span>
                </div>
                <p className="text-slate-500 text-sm mt-2 font-medium">Pricing to be announced</p>
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
                className="w-full py-4 rounded-xl bg-white/5 text-slate-500 font-bold flex items-center justify-center gap-2 cursor-not-allowed"
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

        {/* Trust signals */}
        <div className="mt-12 text-center">
          <p className="text-slate-500 text-sm mb-4">Trusted by job seekers worldwide</p>
          <div className="flex justify-center gap-8 text-slate-600 text-xs">
            <div>
              <div className="text-2xl font-bold text-[#00f0ff] mb-1">10K+</div>
              <div>Applications sent</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#00ff9d] mb-1">500+</div>
              <div>Users hired</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#7000ff] mb-1">4.8/5</div>
              <div>User rating</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
