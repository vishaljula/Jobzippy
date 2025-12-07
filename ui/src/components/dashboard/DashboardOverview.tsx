import { Loader2, PenSquare, Briefcase, MapPin } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { UserInfo } from '@/lib/types';
import { useApplicationsData } from '@/lib/jobs/useApplicationsData';
import type { JobRecord } from '@/lib/jobs/store-types';

interface DashboardOverviewProps {
  user: UserInfo | null;
  onEditProfile: () => void;
}

interface DonutChartProps {
  stats: {
    completed: number;
    applying: number;
    ats_filling: number;
    queued: number;
    failed: number;
    skipped: number;
    total: number;
  };
}

function DonutChart({ stats }: DonutChartProps) {
  // Only show final states in donut chart - "where your apps stand" means final outcomes
  // Intermediate states (queued, applying, ats_filling) are transient and shown in table only
  const donutData = [
    { label: 'Applied', value: stats.completed, color: '#00f0ff' }, // Cyan (Neon)
    { label: 'Failed', value: stats.failed, color: '#ff0055' }, // Neon Pink/Red
    { label: 'Skipped', value: stats.skipped, color: '#64748b' }, // Slate
  ].filter((item) => item.value > 0);

  // Total for donut = only final states (completed, failed, skipped)
  const total = stats.completed + stats.failed + stats.skipped;

  // Calculate active/pending jobs (for display context)
  const activeJobs = stats.applying + stats.ats_filling;
  const pendingJobs = stats.queued;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-sm text-slate-500">No applications yet</p>
      </div>
    );
  }

  let accumulated = 0;
  const gradientStops = donutData
    .map((segment) => {
      const start = (accumulated / total) * 360;
      accumulated += segment.value;
      const end = (accumulated / total) * 360;
      return `${segment.color} ${start}deg ${end}deg`;
    })
    .join(', ');

  return (
    <div className="flex items-center gap-8">
      <div className="relative h-40 w-40">
        {/* Glow effect behind chart */}
        <div className="absolute inset-0 rounded-full bg-[#00f0ff]/10 blur-xl" />

        <div
          className="relative h-full w-full rounded-full shadow-[0_0_20px_rgba(0,0,0,0.5)]"
          style={{ background: `conic-gradient(${gradientStops})` }}
        >
          <div className="absolute inset-[15%] rounded-full bg-[#0f172a] flex flex-col items-center justify-center shadow-inner border border-white/5">
            <span className="text-4xl font-bold text-white tracking-tight">{total}</span>
            <span className="text-[10px] uppercase tracking-wider font-medium text-slate-400 mt-1">
              Total apps
            </span>
            {(activeJobs > 0 || pendingJobs > 0) && (
              <span className="text-[10px] text-[#00f0ff] mt-1 font-medium">
                {activeJobs + pendingJobs} active
              </span>
            )}
          </div>
        </div>
      </div>
      <ul className="space-y-4 text-sm flex-1">
        {donutData.map((segment) => (
          <li key={segment.label} className="flex items-center justify-between gap-4 group">
            <div className="flex items-center gap-3">
              <span
                className="h-3 w-3 rounded-full shadow-[0_0_8px_currentColor]"
                style={{ backgroundColor: segment.color, color: segment.color }}
              />
              <span className="text-slate-300 font-medium group-hover:text-white transition-colors">
                {segment.label}
              </span>
            </div>
            <span className="font-bold text-white font-mono">{segment.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function JobStatusBadge({ status }: { status: JobRecord['status'] }) {
  if (status === 'applying') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#00f0ff]/10 border border-[#00f0ff]/20 px-3 py-1 text-xs font-medium text-[#00f0ff] shadow-[0_0_10px_rgba(0,240,255,0.1)]">
        <Loader2 className="h-3 w-3 animate-spin" /> Applying
      </span>
    );
  }
  if (status === 'ats_filling') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#7000ff]/10 border border-[#7000ff]/20 px-3 py-1 text-xs font-medium text-[#a78bfa] shadow-[0_0_10px_rgba(112,0,255,0.1)]">
        <Loader2 className="h-3 w-3 animate-spin" /> Filling form
      </span>
    );
  }
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#00ff9d]/10 border border-[#00ff9d]/20 px-3 py-1 text-xs font-medium text-[#00ff9d] shadow-[0_0_10px_rgba(0,255,157,0.1)]">
        Applied
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ff0055]/10 border border-[#ff0055]/20 px-3 py-1 text-xs font-medium text-[#ff0055]">
        Failed
      </span>
    );
  }
  if (status === 'queued') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 border border-slate-700 px-3 py-1 text-xs font-medium text-slate-400">
        In queue
      </span>
    );
  }
  if (status === 'skipped') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 border border-slate-700 px-3 py-1 text-xs font-medium text-slate-500">
        Skipped
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 border border-slate-700 px-3 py-1 text-xs font-medium text-slate-500">
      {status}
    </span>
  );
}

/**
 * Format error message as short enum-like code
 */
function formatReason(status: JobRecord['status'], errorMessage?: string): string | null {
  // Successfully applied jobs
  if (status === 'completed') {
    return 'SUBMITTED';
  }

  // No error message means no reason to show
  if (!errorMessage) {
    return null;
  }

  const errorLower = errorMessage.toLowerCase();

  // Map error messages to enum-like codes
  if (errorLower.includes('captcha') || errorLower.includes('verification required')) {
    return 'CAPTCHA_REQUIRED';
  }
  if (
    errorLower.includes('create account') ||
    errorLower.includes('account required') ||
    errorLower.includes('sign up')
  ) {
    return 'ACCOUNT_REQUIRED';
  }
  if (
    errorLower.includes('manual_input_required') ||
    errorLower.includes('required fields missing') ||
    errorLower.includes('invalid')
  ) {
    return 'MANUAL_INPUT_REQUIRED';
  }
  if (errorLower.includes('duplicate') || errorLower.includes('already')) {
    return 'DUPLICATE';
  }
  if (errorLower.includes('timeout')) {
    return 'TIMEOUT';
  }

  // Generic error fallback
  return 'ERROR';
}

function formatAppliedDate(timestamp: number | undefined): string {
  if (!timestamp) {
    return '—';
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function DashboardOverview({ user, onEditProfile }: DashboardOverviewProps) {
  const { inProgress, history, stats, isLoading, error, refresh } = useApplicationsData();
  const displayName = user?.given_name ?? user?.name?.split(' ')[0] ?? 'Job seeker';
  const profileSummary = [
    { label: 'Visa', value: 'H‑1B (needs sponsorship)' },
    { label: 'Locations', value: 'Remote • Austin, TX • NYC' },
    { label: 'Min salary', value: '$150k USD' },
  ];

  // Combine in-progress and recent history for the table (show latest 20)
  // Deduplicate by id to prevent duplicate rows
  const allJobs = [...inProgress, ...history];
  const uniqueJobsMap = new Map<string, JobRecord>();
  for (const job of allJobs) {
    // Keep the most recent version if duplicate
    const existing = uniqueJobsMap.get(job.id);
    if (!existing || job.updatedAt > existing.updatedAt) {
      uniqueJobsMap.set(job.id, job);
    }
  }
  const tableJobs = Array.from(uniqueJobsMap.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 20);

  // Use stats for donut chart, fallback to empty stats
  const donutStats = stats ?? {
    completed: 0,
    applying: 0,
    ats_filling: 0,
    queued: 0,
    failed: 0,
    skipped: 0,
    total: 0,
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Pipeline Card */}
        <div className="group relative overflow-hidden rounded-[32px] border border-white/10 bg-[#0f172a]/60 p-8 shadow-2xl backdrop-blur-xl transition-all hover:border-[#00f0ff]/30 hover:shadow-[0_0_30px_rgba(0,240,255,0.1)]">
          <div className="absolute inset-0 bg-gradient-to-br from-[#00f0ff]/5 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

          <div className="relative">
            <div className="flex items-center justify-between mb-8">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#00f0ff] mb-1">
                  Pipeline
                </p>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Where your apps stand
                </h2>
              </div>
            </div>

            <div className="flex justify-center py-2">
              {isLoading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="h-8 w-8 animate-spin text-[#00f0ff]" />
                </div>
              ) : (
                <DonutChart stats={donutStats} />
              )}
            </div>

            <p className="mt-8 text-xs text-slate-400 text-center font-medium">
              Updates automatically as new roles are queued.
            </p>
          </div>
        </div>

        {/* Profile Card */}
        <div className="group relative overflow-hidden rounded-[32px] border border-white/10 bg-[#0f172a]/60 p-8 shadow-2xl backdrop-blur-xl transition-all hover:border-[#7000ff]/30 hover:shadow-[0_0_30px_rgba(112,0,255,0.1)]">
          <div className="absolute inset-0 bg-gradient-to-br from-[#7000ff]/5 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

          <div className="relative h-full flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#7000ff] mb-1">
                  Profile
                </p>
                <h2 className="text-xl font-bold text-white tracking-tight">{displayName}</h2>
              </div>
              <Button
                variant="default"
                size="sm"
                className="gap-2 text-xs bg-[#7000ff] hover:bg-[#6000e0] text-white shadow-[0_0_15px_rgba(112,0,255,0.4)] border-0 px-4 h-8 rounded-full font-medium transition-all hover:scale-105"
                onClick={onEditProfile}
              >
                <PenSquare className="h-3.5 w-3.5" />
                Edit via chat agent
              </Button>
            </div>

            <div className="flex-1 space-y-4">
              {profileSummary.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.05] hover:border-white/10"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0f172a] border border-white/10 shadow-inner">
                    {item.label === 'Visa' ? (
                      <Briefcase className="h-5 w-5 text-[#00f0ff]" />
                    ) : (
                      <MapPin className="h-5 w-5 text-[#00f0ff]" />
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                      {item.label}
                    </p>
                    <p className="font-medium text-white text-sm">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-8 text-xs text-slate-500 leading-relaxed">
              All edits flow through the onboarding chat agent so everything stays in sync with your
              vault.
            </p>
          </div>
        </div>
      </div>

      {/* Live Matches Card */}
      <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#0f172a]/60 p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#00ff9d] mb-1">
              Live matches
            </p>
            <h2 className="text-xl font-bold text-white tracking-tight">Live job match status</h2>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white text-slate-900 px-4 py-1.5 text-xs font-bold shadow-[0_0_15px_rgba(255,255,255,0.2)]">
            <Loader2
              className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-[#7000ff]' : 'text-slate-400'}`}
            />
            {isLoading ? 'Loading…' : 'Auto-applying'}
          </span>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-[#ff0055]/30 bg-[#ff0055]/10 px-4 py-3 text-sm text-[#ff0055]">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">{error}</p>
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-[#ff0055]/30 text-[#ff0055] hover:bg-[#ff0055]/10 h-7"
                onClick={refresh}
              >
                Retry
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="pb-4 pl-4">Company / Organization</th>
                <th className="pb-4">Location</th>
                <th className="pb-4">Status</th>
                <th className="pb-4">Reason</th>
                <th className="pb-4 pr-4 text-right">Date applied</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading && tableJobs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    <Loader2 className="h-5 w-5 animate-spin inline-block mr-2 text-[#00f0ff]" />
                    Loading applications...
                  </td>
                </tr>
              ) : tableJobs.length > 0 ? (
                tableJobs.map((job) => {
                  const reason = formatReason(job.status, job.errorMessage);
                  return (
                    <tr key={job.id} className="group transition-colors hover:bg-white/[0.02]">
                      <td className="py-4 pl-4">
                        <p className="font-bold text-white group-hover:text-[#00f0ff] transition-colors">
                          {job.company}
                        </p>
                        <p className="text-xs font-medium text-slate-400 mt-0.5">{job.title}</p>
                      </td>
                      <td className="py-4 text-slate-300 font-medium">{job.location ?? '—'}</td>
                      <td className="py-4">
                        <JobStatusBadge status={job.status} />
                      </td>
                      <td className="py-4">
                        {reason ? (
                          <span
                            title={job.errorMessage || undefined}
                            className="inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-white/5 border border-white/5"
                          >
                            {reason}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-4 pr-4 text-right font-mono text-xs text-slate-400">
                        {formatAppliedDate(job.lastAppliedAt ?? job.updatedAt)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center">
                        <Briefcase className="h-6 w-6 text-slate-500" />
                      </div>
                      <p className="text-slate-400 font-medium">No applications yet</p>
                      <p className="text-xs text-slate-500">
                        Start the agent to begin applying to jobs
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
