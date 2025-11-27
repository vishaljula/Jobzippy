'use client';

import { PlugIcon, GearIcon, RocketIcon } from './Icons';

const steps = [
  {
    number: '01',
    title: 'Install & Connect',
    description:
      'Install the browser extension and connect your Google account for seamless integration.',
    Icon: PlugIcon,
  },
  {
    number: '02',
    title: 'Set Your Profile',
    description:
      'Configure your profile, skills, and job filters. JobZippy learns your preferences.',
    Icon: GearIcon,
  },
  {
    number: '03',
    title: 'Auto-Apply & Track',
    description:
      'JobZippy searches, applies, and automatically updates your Google Sheet with all activity.',
    Icon: RocketIcon,
  },
];

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-50"
    >
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            How JobZippy Works
          </h2>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Get started in minutes. Let AI handle the rest.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, index) => {
            const IconComponent = step.Icon;
            return (
              <div
                key={index}
                className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow duration-300 animate-slide-up"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="text-5xl">
                    <IconComponent className="w-12 h-12" />
                  </div>
                  <div className="text-6xl font-bold text-slate-200">
                    {step.number}
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-3">
                  {step.title}
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

