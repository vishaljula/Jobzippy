import { Loader2, MapPin, Briefcase, PenSquare, Globe } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { UserInfo } from '@/lib/types';
import type { JobMatch } from '@/lib/jobs/types';

interface DashboardOverviewProps {
  user: UserInfo | null;
  onEditProfile: () => void;
  jobs: JobMatch[];
  jobStatus: 'idle' | 'loading' | 'success' | 'error';
  onRetry?: () => void;
  jobError?: string | null;
}

const donutData = [
  { label: 'Applied', value: 28, color: '#4f46e5' },
  { label: 'Under review', value: 11, color: '#a855f7' },
  { label: 'Interviews', value: 3, color: '#f97316' },
  { label: 'Offers', value: 1, color: '#0ea5e9' },
  { label: 'Rejected', value: 4, color: '#94a3b8' },
];

const fallbackJobs: JobMatch[] = [
  {
    id: 'demo-1',
    company: 'Fjord Analytics',
    title: 'Senior Product Manager',
    location: 'Remote (US)',
    status: 'applying',
    remote: true,
    tags: [],
    jobTypes: [],
    publishedAt: new Date().toISOString(),
    snippet: 'Working with product squads to ship delightful user experiences.',
    url: '#',
    source: 'arbeitnow',
  },
  {
    id: 'demo-2',
    company: 'Northwind Labs',
    title: 'Growth Marketing Lead',
    location: 'New York, NY',
    status: 'in-progress',
    remote: false,
    tags: [],
    jobTypes: [],
    publishedAt: new Date().toISOString(),
    snippet: 'Partner with product to launch multi-channel growth experiments.',
    url: '#',
    source: 'arbeitnow',
  },
];

function DonutChart() {
  const total = donutData.reduce((sum, item) => sum + item.value, 0);
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
          <span className="text-3xl font-semibold text-slate-900">41</span>
          <span className="text-xs uppercase tracking-wide text-slate-400">Total apps</span>
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

function JobStatusBadge({ status }: { status: string }) {
  if (status === 'applying') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
        <Loader2 className="h-3 w-3 animate-spin" /> Applying
      </span>
    );
  }
  if (status === 'in-progress') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-600">
        <Loader2 className="h-3 w-3 animate-spin" /> In progress
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
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600">
        Rejected
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
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
      {status}
    </span>
  );
}

function formatAppliedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function DashboardOverview({
  user,
  onEditProfile,
  jobs,
  jobStatus,
  onRetry,
  jobError,
}: DashboardOverviewProps) {
  const displayName = user?.given_name ?? user?.name?.split(' ')[0] ?? 'Job seeker';
  const profileSummary = [
    { label: 'Visa', value: 'H‑1B (needs sponsorship)' },
    { label: 'Locations', value: 'Remote • Austin, TX • NYC' },
    { label: 'Min salary', value: '$150k USD' },
  ];
  const tableJobs = jobs.length ? jobs : fallbackJobs;
  const isLoading = jobStatus === 'loading';

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Pipeline</p>
              <h2 className="text-lg font-semibold text-slate-900">Where your apps stand</h2>
            </div>
          </div>
          <div className="mt-6">
            <DonutChart />
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Updates automatically as new roles are queued.
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Profile</p>
              <h2 className="text-lg font-semibold text-slate-900">{displayName}</h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-slate-200 text-xs text-slate-600 hover:border-indigo-200 hover:bg-indigo-50"
              onClick={onEditProfile}
            >
              <PenSquare className="h-3.5 w-3.5" />
              Edit via chat agent
            </Button>
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            {profileSummary.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-2"
              >
                {item.label === 'Visa' ? (
                  <Briefcase className="h-4 w-4 text-indigo-500" />
                ) : (
                  <MapPin className="h-4 w-4 text-indigo-500" />
                )}
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">{item.label}</p>
                  <p className="font-medium text-slate-700">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            All edits flow through the onboarding chat agent so everything stays in sync with your
            vault.
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Live matches</p>
            <h2 className="text-lg font-semibold text-slate-900">Live job match status</h2>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
            <Loader2
              className={`h-3 w-3 ${isLoading ? 'animate-spin text-indigo-500' : 'text-slate-400'}`}
            />
            {isLoading ? 'Searching live roles…' : 'Auto-applying'}
          </span>
        </div>
        {jobError && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <div className="flex items-center justify-between gap-3">
              <p>{jobError}</p>
              {onRetry && (
                <Button size="sm" variant="outline" className="text-xs" onClick={onRetry}>
                  Retry
                </Button>
              )}
            </div>
          </div>
        )}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="pb-3">Company / Organization</th>
                <th className="pb-3">Location</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Date applied</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tableJobs.map((job) => (
                <tr key={job.id}>
                  <td className="py-3">
                    <p className="font-semibold text-slate-900">{job.company}</p>
                    <p className="text-xs text-slate-500">{job.title}</p>
                    {job.remote && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        <Globe className="h-3 w-3" /> Remote-friendly
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-slate-600">{job.location}</td>
                  <td className="py-3">
                    <JobStatusBadge status={job.status} />
                  </td>
                  <td className="py-3 text-slate-500">{formatAppliedDate(job.publishedAt)}</td>
                </tr>
              ))}
              {!tableJobs.length && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-500">
                    No matches yet. Update your profile to start the search.
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
