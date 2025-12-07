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
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-3 bg-gradient-to-r from-white via-[#00f0ff] to-[#7000ff] bg-clip-text text-transparent">
            Welcome to JobZippy
          </h1>
          <p className="text-base text-slate-300 mb-4">
            Your personal AI assistant that applies to jobs while you sleep.
            <br />
            Start your <span className="text-[#00ff9d] font-semibold">3-day free trial</span> to get
            started.
          </p>

          <div className="flex flex-wrap justify-center gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-[#00ff9d]" />
              <span>Card required</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-[#00ff9d]" />
              <span>Cancel anytime</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-[#00ff9d]" />
              <span>300 apps/month</span>
            </div>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-2 gap-4">
          {/* Basic Plan */}
          <div className="relative group">
            {/* Glow Effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-[#00f0ff] to-[#7000ff] rounded-3xl blur opacity-25 group-hover:opacity-50 transition duration-500" />

            <div className="relative bg-white/5 backdrop-blur-lg border border-white/10 p-4 rounded-2xl h-full flex flex-col border-2 border-[#00f0ff]/30">
              {/* Header */}
              <div className="mb-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap className="w-4 h-4 text-[#00f0ff]" />
                  <h3 className="text-lg font-bold text-white">Basic</h3>
                </div>
                <p className="text-slate-400 text-xs">Perfect for getting started</p>
              </div>

              {/* Price */}
              <div className="mb-4">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold text-white">$9.99</span>
                  <span className="text-slate-400 text-xs">/mo</span>
                </div>
                <p className="text-[#00ff9d] text-xs mt-1.5 font-medium">
                  3-day trial • Then $9.99/mo
                </p>
              </div>

              {/* Features */}
              <ul className="space-y-2 mb-4 flex-grow">
                {[
                  'LinkedIn auto-apply',
                  '300 apps per month',
                  'Sheets tracking',
                  'App analytics',
                  'Email alerts',
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-slate-300">
                    <div className="w-4 h-4 rounded-full bg-[#00f0ff]/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-2.5 h-2.5 text-[#00f0ff]" />
                    </div>
                    <span className="text-xs">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA Button */}
              <Button
                onClick={onStartTrial}
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-[#00f0ff] to-[#7000ff] text-white font-bold hover:scale-105 hover:shadow-[0_0_30px_rgba(0,240,255,0.5)] transition-all duration-300 text-sm flex items-center justify-center gap-1.5"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Start Free Trial</span>
                  </>
                )}
              </Button>

              <p className="text-center text-[10px] text-slate-500 mt-2">
                Card required • Cancel anytime
              </p>
            </div>
          </div>

          {/* Premium Plan (Coming Soon) */}
          <div className="relative group opacity-60">
            {/* Glow Effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-[#7000ff] to-[#00ff9d] rounded-3xl blur opacity-10 transition duration-500" />

            <div className="relative bg-white/5 backdrop-blur-lg border border-white/10 p-4 rounded-2xl h-full flex flex-col">
              {/* Coming Soon Badge */}
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                <div className="px-3 py-0.5 rounded-full bg-gradient-to-r from-[#7000ff] to-[#00ff9d] text-[10px] font-bold text-black">
                  COMING SOON
                </div>
              </div>

              {/* Header */}
              <div className="mb-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-4 h-4 text-[#7000ff]" />
                  <h3 className="text-lg font-bold text-white">Premium</h3>
                </div>
                <p className="text-slate-400 text-xs">For serious job seekers</p>
              </div>

              {/* Price */}
              <div className="mb-4">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold text-white">$TBD</span>
                  <span className="text-slate-400 text-xs">/mo</span>
                </div>
                <p className="text-slate-500 text-xs mt-1.5 font-medium">Pricing TBA</p>
              </div>

              {/* Features */}
              <ul className="space-y-2 mb-4 flex-grow">
                {[
                  'Everything in Basic, plus:',
                  'AI cover letters',
                  'Indeed, Dice & Others',
                  'Unlimited apps',
                  'Priority support',
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-slate-400">
                    <div className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-2.5 h-2.5 text-slate-500" />
                    </div>
                    <span className="text-xs">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* Disabled Button */}
              <button
                disabled
                className="w-full py-2.5 rounded-lg bg-white/5 text-slate-500 font-bold flex items-center justify-center gap-1.5 cursor-not-allowed text-sm"
              >
                <Lock className="w-3.5 h-3.5" />
                Coming Soon
              </button>

              <p className="text-center text-[10px] text-slate-600 mt-2">
                Join waitlist for updates
              </p>
            </div>
          </div>
        </div>

        {/* Trust signals */}
        <div className="mt-6 text-center">
          <p className="text-slate-500 text-xs mb-3">Trusted by job seekers worldwide</p>
          <div className="flex justify-center gap-6 text-slate-600 text-[10px]">
            <div>
              <div className="text-lg font-bold text-[#00f0ff] mb-0.5">10K+</div>
              <div>Applications sent</div>
            </div>
            <div>
              <div className="text-lg font-bold text-[#00ff9d] mb-0.5">500+</div>
              <div>Users hired</div>
            </div>
            <div>
              <div className="text-lg font-bold text-[#7000ff] mb-0.5">4.8/5</div>
              <div>User rating</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
