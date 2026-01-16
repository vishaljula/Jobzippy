'use client';

import { CheckCircle2, FileText } from 'lucide-react';

export default function InteractiveDemo() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Text Content */}
          <div className="relative z-10">
            <h2 className="text-4xl font-bold mb-6">
              Your Personal <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-green to-neon-purple">
                Job Application Bot
              </span>
            </h2>
            <p className="text-slate-400 text-lg mb-8 leading-relaxed">
              Watch as JobZippy navigates LinkedIn, finds matching jobs, and submits applications
              automatically. Set it up once and let it run while you sleep.
            </p>

            <div className="space-y-6">
              {[
                {
                  title: 'LinkedIn Integration',
                  desc: 'Seamlessly applies to jobs on LinkedIn with your profile.',
                },
                {
                  title: 'Human-Like Behavior',
                  desc: 'Randomized delays and natural interactions to avoid detection.',
                },
                {
                  title: 'Real-Time Tracking',
                  desc: 'Every application logged to Google Sheets instantly.',
                },
              ].map((item, i) => (
                <div key={i} className="flex gap-4 items-start group">
                  <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 group-hover:bg-neon-green/10 group-hover:border-neon-green/30 transition-all duration-300">
                    <CheckCircle2 className="w-6 h-6 text-neon-green" />
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
                <div className="ml-4 text-xs text-slate-500 font-mono">JobZippy Agent</div>
              </div>

              {/* Window Content */}
              <div className="p-6 font-mono text-sm relative min-h-[400px]">
                {/* Scanning Animation */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-neon-green to-transparent animate-scan opacity-50" />

                {/* Job Cards */}
                <div className="space-y-3">
                  {[
                    {
                      role: 'Senior Frontend Engineer',
                      company: 'Tech Company',
                      location: 'Remote',
                      status: 'Applied',
                    },
                    {
                      role: 'Full Stack Developer',
                      company: 'Startup Inc',
                      location: 'San Francisco',
                      status: 'Applied',
                    },
                    {
                      role: 'Software Engineer',
                      company: 'Enterprise Co',
                      location: 'New York',
                      status: 'Processing...',
                    },
                    {
                      role: 'React Developer',
                      company: 'Digital Agency',
                      location: 'Remote',
                      status: 'Queued',
                    },
                  ].map((job, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors animate-fade-in-up"
                      style={{ animationDelay: `${i * 200}ms` }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-slate-400" />
                        </div>
                        <div>
                          <div className="text-white font-medium">{job.role}</div>
                          <div className="text-slate-500 text-xs">
                            {job.company} • {job.location}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div
                          className={`text-xs ${
                            job.status === 'Applied'
                              ? 'text-neon-green'
                              : job.status === 'Processing...'
                                ? 'text-neon-blue animate-pulse'
                                : 'text-slate-600'
                          }`}
                        >
                          {job.status === 'Applied' && '✓ '}
                          {job.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Console Output */}
                <div className="mt-6 pt-6 border-t border-white/5 text-xs space-y-2 font-mono">
                  <div className="text-slate-500">
                    <span className="text-neon-green">➜</span> Searching LinkedIn for matching jobs...
                  </div>
                  <div className="text-slate-500">
                    <span className="text-neon-green">➜</span> Found 47 new positions
                  </div>
                  <div className="text-slate-300">
                    <span className="text-neon-green">✔</span> Applied to Tech Company
                  </div>
                  <div className="text-slate-300">
                    <span className="text-neon-green">✔</span> Applied to Startup Inc
                  </div>
                  <div className="text-slate-300">
                    <span className="text-neon-green">✔</span> Logged to Google Sheets
                  </div>
                  <div className="flex items-center gap-2 text-neon-blue animate-pulse">
                    <span className="w-2 h-2 bg-neon-blue rounded-full" />
                    Processing next application...
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
