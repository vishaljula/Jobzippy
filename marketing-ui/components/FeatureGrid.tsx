import {
    Zap,
    Target,
    Globe,
    FileSpreadsheet,
    Cpu,
    MessageCircle
} from 'lucide-react';

const features = [
    {
        icon: Zap,
        title: 'Auto-Apply Engine',
        desc: 'Applies to hundreds of jobs while you sleep. No more manual data entry.',
        color: 'text-yellow-400',
    },
    {
        icon: Target,
        title: 'Smart Job Matching',
        desc: 'AI analyzes job descriptions to ensure you only apply to relevant roles.',
        color: 'text-red-400',
    },
    {
        icon: Globe,
        title: 'H-1B Sponsorship Filter',
        desc: 'Automatically filters out companies that don’t sponsor visas.',
        color: 'text-blue-400',
    },
    {
        icon: FileSpreadsheet,
        title: 'Google Sheet Tracking',
        desc: 'Every application is logged to your personal Google Sheet in real-time.',
        color: 'text-green-400',
    },
    {
        icon: Cpu,
        title: 'ATS Compatibility',
        desc: 'Optimized for Greenhouse, Lever, Workday, and 50+ other ATS platforms.',
        color: 'text-purple-400',
    },
    {
        icon: MessageCircle,
        title: 'Daily WhatsApp Updates',
        desc: 'Get a daily summary of applications and interview requests on WhatsApp.',
        color: 'text-teal-400',
    },
];

export default function FeatureGrid() {
    return (
        <section id="features" className="py-24 relative">
            <div className="max-w-7xl mx-auto px-6">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold mb-6">
                        Everything you need to <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-purple">
                            dominate the job market
                        </span>
                    </h2>
                    <p className="text-slate-400 text-lg max-w-2xl mx-auto">
                        JobZippy isn't just an auto-filler. It's a comprehensive career automation platform designed for the modern job seeker.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {features.map((feature, i) => (
                        <div
                            key={i}
                            className="glass glass-hover p-8 rounded-2xl group relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <feature.icon className="w-24 h-24" />
                            </div>

                            <div className={`w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 ${feature.color}`}>
                                <feature.icon className="w-6 h-6" />
                            </div>

                            <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
                            <p className="text-slate-400 leading-relaxed">
                                {feature.desc}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
