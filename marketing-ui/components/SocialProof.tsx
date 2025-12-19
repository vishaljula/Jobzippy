import { Star } from 'lucide-react';

const testimonials = [
    {
        name: 'Sarah Chen',
        role: 'Software Engineer at Google',
        text: "I applied to 500+ jobs manually with no luck. JobZippy got me 12 interviews in one week. It's actually insane.",
        image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah',
    },
    {
        name: 'Michael Ross',
        role: 'Product Manager',
        text: "The auto-customization feature is a game changer. It tailored my resume for every single application perfectly.",
        image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Michael',
    },
    {
        name: 'David Kim',
        role: 'Data Scientist',
        text: "Worth every penny. I saved at least 40 hours of boring form filling. Got an offer from Amazon within a month.",
        image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=David',
    },
];

export default function SocialProof() {
    return (
        <section className="py-24 relative border-t border-white/5">
            <div className="max-w-7xl mx-auto px-6">
                <div className="text-center mb-16">
                    <p className="text-sm font-medium text-neon-blue mb-4 uppercase tracking-wider">Trusted by engineers from</p>
                    <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
                        {['Google', 'Amazon', 'Meta', 'Netflix', 'Microsoft', 'Uber'].map((company) => (
                            <span key={company} className="text-xl md:text-2xl font-bold text-white">{company}</span>
                        ))}
                    </div>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                    {testimonials.map((t, i) => (
                        <div key={i} className="glass p-8 rounded-2xl relative">
                            <div className="flex gap-1 mb-4 text-yellow-400">
                                {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-current" />)}
                            </div>
                            <p className="text-slate-300 mb-6 leading-relaxed">"{t.text}"</p>
                            <div className="flex items-center gap-4">
                                <img src={t.image} alt={t.name} className="w-10 h-10 rounded-full bg-white/10" />
                                <div>
                                    <div className="font-semibold text-white">{t.name}</div>
                                    <div className="text-xs text-slate-500">{t.role}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
