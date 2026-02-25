'use client';

import { CheckCircle2, MousePointerClick, ClipboardCheck } from 'lucide-react';

export default function InteractiveDemo() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Text Content */}
          <div className="relative z-10">
            <h2 className="text-4xl font-bold mb-6">
              One Click. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-green to-neon-purple">
                Entire Form Filled.
              </span>
            </h2>
            <p className="text-slate-400 text-lg mb-8 leading-relaxed">
              JobZippy reads the job application, detects every field, and fills them all
              with your profile — instantly. You review, you submit. It&apos;s that simple.
            </p>

            <div className="space-y-6">
              {[
                {
                  icon: MousePointerClick,
                  title: 'Click "Fill Form"',
                  desc: 'One click activates JobZippy on any job application page.',
                },
                {
                  icon: CheckCircle2,
                  title: 'AI Fills Every Field',
                  desc: 'Name, experience, skills, custom questions — all handled intelligently.',
                },
                {
                  icon: ClipboardCheck,
                  title: 'You Review & Submit',
                  desc: 'Stay in full control. Tweak anything, then hit submit.',
                },
              ].map((item, i) => (
                <div key={i} className="flex gap-4 items-start group">
                  <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 group-hover:bg-neon-green/10 group-hover:border-neon-green/30 transition-all duration-300">
                    <item.icon className="w-6 h-6 text-neon-green" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white mb-1">{item.title}</h3>
                    <p className="text-slate-400 text-sm">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Interactive Visual */}
          <div className="relative">
            {/* Glow Effect */}
            <div className="absolute inset-0 bg-neon-green/20 blur-[100px] rounded-full pointer-events-none" />

            {/* Fake Window */}
            <div className="relative bg-[#0a0a12] border border-white/10 rounded-2xl overflow-hidden shadow-2xl shadow-black/50 backdrop-blur-xl">
              {/* Window Header */}
              <div className="h-10 border-b border-white/5 flex items-center px-4 gap-2 bg-white/5">
                <div className="w-3 h-3 rounded-full bg-red-500/50" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                <div className="w-3 h-3 rounded-full bg-green-500/50" />
                <div className="ml-4 text-xs text-slate-500 font-mono">JobZippy — Form Filler</div>
              </div>

              {/* Window Content */}
              <div className="p-6 font-mono text-sm relative min-h-[400px]">
                {/* Scanning Animation */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-neon-green to-transparent animate-scan opacity-50" />

                {/* Form Fields being filled */}
                <div className="space-y-3">
                  {[
                    {
                      label: 'Full Name',
                      value: 'John Wick',
                      status: 'Filled',
                    },
                    {
                      label: 'Email',
                      value: 'johnwick@example.com',
                      status: 'Filled',
                    },
                    {
                      label: 'Years of Experience',
                      value: '5',
                      status: 'Filled',
                    },
                    {
                      label: 'Why do you want to join?',
                      value: 'Generating answer...',
                      status: 'Processing...',
                    },
                    {
                      label: 'Work Authorization',
                      value: 'US Citizen',
                      status: 'Queued',
                    },
                  ].map((field, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors animate-fade-in-up"
                      style={{ animationDelay: `${i * 150}ms` }}
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="text-slate-500 text-xs">{field.label}</div>
                        <div className="text-white font-medium text-sm truncate max-w-[200px]">{field.value}</div>
                      </div>
                      <div
                        className={`text-xs shrink-0 ${field.status === 'Filled'
                          ? 'text-neon-green'
                          : field.status === 'Processing...'
                            ? 'text-neon-blue animate-pulse'
                            : 'text-slate-600'
                          }`}
                      >
                        {field.status === 'Filled' && '✓ '}
                        {field.status}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Console Output */}
                <div className="mt-6 pt-6 border-t border-white/5 text-xs space-y-2 font-mono">
                  <div className="text-slate-500">
                    <span className="text-neon-green">➜</span> Detected 5 fields on this page
                  </div>
                  <div className="text-slate-300">
                    <span className="text-neon-green">✔</span> Filled standard fields from profile
                  </div>
                  <div className="text-slate-300">
                    <span className="text-neon-green">✔</span> Sending custom question to AI...
                  </div>
                  <div className="flex items-center gap-2 text-neon-blue animate-pulse">
                    <span className="w-2 h-2 bg-neon-blue rounded-full" />
                    Filling remaining fields...
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
