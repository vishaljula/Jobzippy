'use client';

import { TargetIcon, ChartIcon, PhoneIcon, GiftIcon } from './Icons';

const features = [
  {
    title: 'H-1B/OPT Sponsorship Filter',
    description:
      'Automatically filters jobs that sponsor visas, saving hours of manual searching.',
    Icon: TargetIcon,
  },
  {
    title: 'Auto Apply + Google Sheet Tracking',
    description:
      'Seamlessly applies to jobs and logs everything in your personal Google Sheet.',
    Icon: ChartIcon,
  },
  {
    title: 'Daily WhatsApp/SMS Summary',
    description:
      'Get daily updates on applications, replies, and interviews via WhatsApp or SMS.',
    Icon: PhoneIcon,
  },
  {
    title: 'Referral Rewards',
    description:
      'Earn credits and rewards by sharing JobZippy with friends and colleagues.',
    Icon: GiftIcon,
  },
];

export default function WhyDifferent() {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Why it's different
          </h2>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Built specifically for international job seekers and busy professionals.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {features.map((feature, index) => {
            const IconComponent = feature.Icon;
            return (
              <div
                key={index}
                className="bg-gradient-to-br from-white to-slate-50 rounded-2xl p-8 border border-slate-100 hover:shadow-xl transition-all duration-300 hover:scale-105 animate-slide-up"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="text-5xl mb-4">
                  <IconComponent className="w-12 h-12" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-3">
                  {feature.title}
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

