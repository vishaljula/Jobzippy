import { Zap, FileSpreadsheet, Cpu, BarChart3, Bell, Shield } from 'lucide-react';

const features = [
  {
    icon: Zap,
    title: 'Auto-Apply Engine',
    desc: 'Applies to hundreds of LinkedIn jobs while you sleep. No more manual data entry.',
    color: 'text-neon-green',
  },
  {
    icon: FileSpreadsheet,
    title: 'Google Sheet Tracking',
    desc: 'Every application is logged to your personal Google Sheet in real-time.',
    color: 'text-neon-blue',
  },
  {
    icon: Cpu,
    title: 'ATS Compatible',
    desc: 'Works seamlessly with Greenhouse, Lever, Workday, and more ATS platforms.',
    color: 'text-neon-purple',
  },
  {
    icon: BarChart3,
    title: 'Application Analytics',
    desc: 'Track your application progress with detailed analytics and insights.',
    color: 'text-neon-green',
  },
  {
    icon: Bell,
    title: 'Email Notifications',
    desc: 'Get notified when applications are submitted and track your progress.',
    color: 'text-neon-blue',
  },
  {
    icon: Shield,
    title: 'Privacy First',
    desc: 'Your data stays on your device. We never store your resume or personal info.',
    color: 'text-neon-purple',
  },
];

export default function FeatureGrid() {
  return (
    <section id="features" className="py-24 relative">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            Everything you need to <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-green to-neon-purple">
              land your dream job
            </span>
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            JobZippy automates the tedious parts of job hunting so you can focus on what matters —
            preparing for interviews.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <div key={i} className="glass glass-hover p-8 rounded-2xl group relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <feature.icon className="w-24 h-24" />
              </div>

              <div
                className={`w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 ${feature.color}`}
              >
                <feature.icon className="w-6 h-6" />
              </div>

              <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
              <p className="text-slate-400 leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
