import { Check } from 'lucide-react';
import Link from 'next/link';

export default function Pricing() {
  return (
    <section id="pricing" className="py-24 relative">
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-lg mx-auto">
          <div className="relative group">
            {/* Glow Effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-neon-blue to-neon-purple rounded-3xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200" />

            <div className="relative glass p-8 md:p-12 rounded-3xl">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold mb-2">Simple Pricing</h2>
                <p className="text-slate-400">Everything you need to get hired.</p>
              </div>

              <div className="flex justify-center items-baseline mb-8">
                <span className="text-5xl font-bold text-white">$24.99</span>
                <span className="text-slate-400 ml-2">/month</span>
              </div>

              <ul className="space-y-4 mb-8">
                {[
                  'Unlimited Auto-Applications',
                  'AI Resume Customization',
                  'Priority Support',
                  'H-1B Sponsorship Filtering',
                  'Daily WhatsApp Updates',
                  'Cancel Anytime',
                ].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-300">
                    <div className="w-5 h-5 rounded-full bg-neon-green/20 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-neon-green" />
                    </div>
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                href="/signup"
                className="block w-full py-4 rounded-xl bg-white text-black font-bold text-center hover:scale-105 transition-transform duration-300"
              >
                Start Free Trial
              </Link>

              <p className="text-center text-xs text-slate-500 mt-4">
                7-day money-back guarantee. No questions asked.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
