import { Users, Rocket, Clock } from 'lucide-react';

export default function SocialProof() {
    return (
        <section className="py-24 relative border-t border-white/5">
            <div className="max-w-7xl mx-auto px-6">
        {/* Stats Section */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <div className="glass p-8 rounded-2xl text-center group hover:bg-white/10 transition-colors">
            <div className="w-16 h-16 rounded-2xl bg-neon-green/10 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <Rocket className="w-8 h-8 text-neon-green" />
                    </div>
            <div className="text-4xl font-bold text-white mb-2">10×</div>
            <p className="text-slate-400">Faster than manual applications</p>
                </div>

          <div className="glass p-8 rounded-2xl text-center group hover:bg-white/10 transition-colors">
            <div className="w-16 h-16 rounded-2xl bg-neon-blue/10 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <Clock className="w-8 h-8 text-neon-blue" />
            </div>
            <div className="text-4xl font-bold text-white mb-2">40+</div>
            <p className="text-slate-400">Hours saved per month</p>
                            </div>

          <div className="glass p-8 rounded-2xl text-center group hover:bg-white/10 transition-colors">
            <div className="w-16 h-16 rounded-2xl bg-neon-purple/10 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <Users className="w-8 h-8 text-neon-purple" />
                                </div>
            <div className="text-4xl font-bold text-white mb-2">300</div>
            <p className="text-slate-400">Applications per month</p>
                            </div>
                        </div>

        {/* Quote Section */}
        <div className="max-w-3xl mx-auto text-center">
          <blockquote className="text-2xl md:text-3xl font-medium text-white leading-relaxed mb-6">
            &ldquo;Stop spending hours filling out the same forms. Let JobZippy handle the tedious
            work while you focus on interview prep.&rdquo;
          </blockquote>
          <p className="text-slate-500">Built by job seekers, for job seekers</p>
                </div>
            </div>
        </section>
    );
}
