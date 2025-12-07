import { Check, Sparkles, Zap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface PricingWelcomeProps {
  onStartTrial: () => void;
  loading?: boolean;
}

export function PricingWelcome({ onStartTrial, loading }: PricingWelcomeProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Welcome to JobZippy
          </h1>
          <p className="text-slate-400">Your AI assistant that applies to jobs while you sleep</p>
        </div>

        {/* Pricing Card */}
        <Card className="relative border-2 border-blue-500/30 bg-slate-900/50 backdrop-blur shadow-2xl">
          {/* Glow effect */}
          <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg blur opacity-20" />

          <div className="relative">
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-blue-400" />
                <CardTitle className="text-xl">Basic Plan</CardTitle>
              </div>
              <CardDescription>Perfect for getting started</CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Price */}
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-white">$9.99</span>
                  <span className="text-slate-400">/month</span>
                </div>
                <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                  <span className="text-green-400 text-sm font-medium">3-day free trial</span>
                </div>
              </div>

              {/* Features */}
              <ul className="space-y-3">
                {[
                  'LinkedIn auto-apply',
                  '300 applications per month',
                  'AI-powered cover letters',
                  'Google Sheets tracking',
                  'Application analytics',
                  'Email notifications',
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
                    <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-blue-400" />
                    </div>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA Button */}
              <Button
                onClick={onStartTrial}
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold shadow-lg hover:shadow-xl transition-all"
                size="lg"
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

              <p className="text-center text-xs text-slate-500">
                Card required • Cancel anytime • No questions asked
              </p>
            </CardContent>
          </div>
        </Card>

        {/* Trust signals */}
        <div className="mt-6 text-center space-y-2">
          <div className="flex justify-center gap-6 text-xs text-slate-600">
            <div>
              <div className="text-lg font-bold text-blue-400">10K+</div>
              <div>Applications</div>
            </div>
            <div>
              <div className="text-lg font-bold text-green-400">500+</div>
              <div>Users Hired</div>
            </div>
            <div>
              <div className="text-lg font-bold text-purple-400">4.8/5</div>
              <div>Rating</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
