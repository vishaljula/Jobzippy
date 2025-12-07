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
    { label: 'Applied', value: stats.completed, color: '#4f46e5' }, // Indigo
    { label: 'Failed', value: stats.failed, color: '#ef4444' }, // Red
    { label: 'Skipped', value: stats.skipped, color: '#94a3b8' }, // Grey
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
    <div className="flex items-center gap-6">
      <div
        className="relative h-40 w-40 rounded-full shadow-inner"
        style={{ background: `conic-gradient(${gradientStops})` }}
      >
        <div className="absolute inset-5 rounded-full bg-white shadow-inner flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold text-slate-900">{total}</span>
          <span className="text-xs uppercase tracking-wide text-slate-400">Total apps</span>
          {(activeJobs > 0 || pendingJobs > 0) && (
            <span className="text-[10px] text-slate-500 mt-0.5">
              {activeJobs + pendingJobs} in progress
            </span>
          )}
        </div>
      </div>
      <ul className="space-y-3 text-sm">
        {donutData.map((segment) => (
          <li key={segment.label} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: segment.color }}
              />
              <span className="text-slate-600">{segment.label}</span>
            </div>
            <span className="font-semibold text-slate-900">{segment.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function JobStatusBadge({ status }: { status: JobRecord['status'] }) {
  if (status === 'applying') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
        <Loader2 className="h-3 w-3 animate-spin" /> Applying
      </span>
    );
  }
  if (status === 'ats_filling') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-600">
        <Loader2 className="h-3 w-3 animate-spin" /> Filling form
      </span>
    );
  }
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
        Applied
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600">
        Failed
      </span>
    );
  }
  if (status === 'queued') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
        In queue
      </span>
    );
  }
  if (status === 'skipped') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
        Skipped
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
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
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-white/15 bg-gradient-to-r from-[#0c3b4f] via-[#1d2f60] to-[#2b1454] p-6 shadow-[0_20px_40px_rgba(0,0,0,0.35)] backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Pipeline</p>
              <h2 className="text-lg font-semibold text-white">Where your apps stand</h2>
            </div>
          </div>
          <div className="mt-6">
            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-6 w-6 animate-spin text-[#00f0ff]" />
              </div>
            ) : (
              <DonutChart stats={donutStats} />
            )}
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Updates automatically as new roles are queued.
          </p>
        </div>
        <div className="rounded-3xl border border-white/15 bg-gradient-to-r from-[#0c3b4f] via-[#1d2f60] to-[#2b1454] p-6 shadow-[0_20px_40px_rgba(0,0,0,0.35)] backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Profile</p>
              <h2 className="text-lg font-semibold text-white">{displayName}</h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-white/20 text-xs text-white hover:border-[#00f0ff]/40 hover:bg-[#00f0ff]/10"
              onClick={onEditProfile}
            >
              <PenSquare className="h-3.5 w-3.5" />
              Edit via chat agent
            </Button>
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-200">
            {profileSummary.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2"
              >
                {item.label === 'Visa' ? (
                  <Briefcase className="h-4 w-4 text-[#00f0ff]" />
                ) : (
                  <MapPin className="h-4 w-4 text-[#00f0ff]" />
                )}
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">{item.label}</p>
                  <p className="font-medium text-white">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-400">
            All edits flow through the onboarding chat agent so everything stays in sync with your
            vault.
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-white/15 bg-gradient-to-r from-[#0c3b4f] via-[#1d2f60] to-[#2b1454] p-6 shadow-[0_20px_40px_rgba(0,0,0,0.35)] backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Live matches</p>
            <h2 className="text-lg font-semibold text-white">Live job match status</h2>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
            <Loader2
              className={`h-3 w-3 ${isLoading ? 'animate-spin text-[#00f0ff]' : 'text-slate-400'}`}
            />
            {isLoading ? 'Loading…' : 'Auto-applying'}
          </span>
        </div>
        {error && (
          <div className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            <div className="flex items-center justify-between gap-3">
              <p>{error}</p>
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-white/30 text-white"
                onClick={refresh}
              >
                Retry
              </Button>
            </div>
          </div>
        )}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="pb-3 text-slate-300">Company / Organization</th>
                <th className="pb-3 text-slate-300">Location</th>
                <th className="pb-3 text-slate-300">Status</th>
                <th className="pb-3 text-slate-300">Reason</th>
                <th className="pb-3 text-slate-300">Date applied</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading && tableJobs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
                    Loading applications...
                  </td>
                </tr>
              ) : tableJobs.length > 0 ? (
                tableJobs.map((job) => {
                  const reason = formatReason(job.status, job.errorMessage);
                  return (
                    <tr key={job.id} className="text-slate-100">
                      <td className="py-3">
                        <p className="font-semibold text-white">{job.company}</p>
                        <p className="text-xs text-slate-400">{job.title}</p>
                      </td>
                      <td className="py-3 text-slate-300">{job.location ?? '—'}</td>
                      <td className="py-3">
                        <JobStatusBadge status={job.status} />
                      </td>
                      <td className="py-3">
                        {reason ? (
                          <span
                            title={job.errorMessage || undefined}
                            className="text-xs font-mono text-slate-300"
                          >
                            {reason}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-3 text-slate-400">
                        {formatAppliedDate(job.lastAppliedAt ?? job.updatedAt)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    No applications yet. Start the agent to begin applying to jobs.
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
