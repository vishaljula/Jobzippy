import { Loader2, PenSquare, Briefcase, MapPin, Check, X, AlertCircle, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import type { UserInfo } from '@/lib/types';
import { useApplicationsData } from '@/lib/jobs/useApplicationsData';
import type { JobRecord } from '@/lib/jobs/store-types';
import { AutofillCard } from './AutofillCard';
import { updateJobMetadata } from '@/lib/jobs/store';
import { MetadataConfirmationModal } from './MetadataConfirmationModal';

interface DashboardOverviewProps {
  user: UserInfo | null;
  onEditProfile: () => void;
  engineState: 'IDLE' | 'RUNNING' | 'PAUSED';
  engineStatus?: string;
  onStartAgent: () => void;
  onStopAgent: () => void;
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
  // Only show final states in donut chart
  const donutData = [
    { label: 'Applied', value: stats.completed, color: 'url(#gradient-applied)' },
    { label: 'Failed', value: stats.failed, color: 'url(#gradient-failed)' },
    { label: 'Skipped', value: stats.skipped, color: 'url(#gradient-skipped)' },
  ].filter((item) => item.value > 0);

  const total = stats.completed + stats.failed + stats.skipped;
  const activeJobs = stats.applying + stats.ats_filling;
  const pendingJobs = stats.queued;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-sm text-slate-500">No applications yet</p>
      </div>
    );
  }

  // Calculate segments for SVG
  let accumulatedAngle = 0;
  const radius = 70; // Radius of the circle
  const circumference = 2 * Math.PI * radius;
  const center = 80; // Center of the SVG (80x80 viewbox would be tight, let's say 160x160)

  const segments = donutData.map((segment) => {
    const percentage = segment.value / total;
    const strokeDasharray = `${percentage * circumference} ${circumference}`;
    const rotate = accumulatedAngle;
    accumulatedAngle += percentage * 360;

    return {
      ...segment,
      strokeDasharray,
      rotate,
    };
  });

  return (
    <div className="flex items-center gap-8">
      <div className="relative h-40 w-40">
        {/* Glow effect behind chart */}
        <div className="absolute inset-0 rounded-full bg-[#00f0ff]/10 blur-xl" />

        <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90 transform drop-shadow-2xl">
          <defs>
            <linearGradient id="gradient-applied" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00f0ff" />
              <stop offset="100%" stopColor="#00ff9d" />
            </linearGradient>
            <linearGradient id="gradient-failed" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#7000ff" />
              <stop offset="100%" stopColor="#ff0055" />
            </linearGradient>
            <linearGradient id="gradient-skipped" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#94a3b8" />
              <stop offset="100%" stopColor="#64748b" />
            </linearGradient>
          </defs>

          {/* Background Circle */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#1e293b"
            strokeWidth="12"
          />

          {/* Segments */}
          {segments.map((segment, i) => (
            <circle
              key={i}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth="12"
              strokeDasharray={segment.strokeDasharray}
              strokeDashoffset={0}
              strokeLinecap="round"
              transform={`rotate(${segment.rotate} ${center} ${center})`}
            />
          ))}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold text-white tracking-tight drop-shadow-lg">
            {total}
          </span>
          <span className="text-[10px] uppercase tracking-wider font-medium text-slate-400 mt-1">
            Total apps
          </span>
          {(activeJobs > 0 || pendingJobs > 0) && (
            <span className="text-[10px] text-[#00f0ff] mt-1 font-medium drop-shadow-[0_0_8px_rgba(0,240,255,0.5)]">
              {activeJobs + pendingJobs} active
            </span>
          )}
        </div>
      </div>

      <ul className="space-y-4 text-sm flex-1">
        {donutData.map((segment) => (
          <li key={segment.label} className="flex items-center justify-between gap-4 group">
            <div className="flex items-center gap-3">
              <span
                className="h-3 w-3 rounded-full shadow-[0_0_8px_currentColor]"
                style={{
                  background:
                    segment.label === 'Applied'
                      ? 'linear-gradient(135deg, #00f0ff, #00ff9d)'
                      : segment.label === 'Failed'
                        ? 'linear-gradient(135deg, #7000ff, #ff0055)'
                        : '#64748b',
                }}
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

/*
function ControlCard({
  engineState,
  engineStatus,
  onStart,
  onStop,
}: {
  engineState: 'IDLE' | 'RUNNING' | 'PAUSED';
  engineStatus?: string;
  onStart: () => void;
  onStop: () => void;
}) {
  const isRunning = engineState === 'RUNNING';
  const isStopping = engineState === 'PAUSED';

  return (
    <div className="relative group w-full">
      {/* Glow Effect *\/}
      <div className="absolute -inset-1 bg-gradient-to-r from-[#00f0ff] to-[#7000ff] rounded-3xl blur opacity-[0.0625] group-hover:opacity-[0.125] transition duration-500" />

      <div className="relative bg-white/5 backdrop-blur-lg border border-white/10 p-6 rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            className={`h-12 w-12 rounded-full flex items-center justify-center ${isRunning ? 'bg-[#00ff9d]/20 text-[#00ff9d] shadow-[0_0_15px_rgba(0,255,157,0.3)]' : 'bg-slate-800 text-slate-400'}`}
          >
            {isRunning ? <CheckCircle2 className="h-6 w-6" /> : <AlertCircle className="h-6 w-6" />}
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">
              Agent Status:{' '}
              <span className={isRunning ? 'text-[#00ff9d]' : 'text-slate-400'}>
                {isRunning ? 'Running' : isStopping ? 'Stopping...' : 'Stopped'}
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {isRunning
                ? engineStatus || 'Jobzippy is actively searching and applying to jobs.'
                : 'Start the agent to begin your job search automation.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!isRunning && !isStopping && (
            <Button
              onClick={onStart}
              className="bg-gradient-to-r from-[#00f0ff] to-[#7000ff] hover:opacity-90 text-white shadow-[0_0_20px_rgba(0,240,255,0.3)] border-0 h-10 px-6 rounded-xl font-bold transition-all hover:scale-105"
            >
              <Play className="h-4 w-4 mr-2 fill-current" />
              Start Agent
            </Button>
          )}

          {(isRunning || isStopping) && (
            <Button
              onClick={onStop}
              disabled={isStopping}
              className="bg-gradient-to-r from-[#00f0ff] to-[#7000ff] hover:opacity-90 text-white shadow-[0_0_20px_rgba(0,240,255,0.3)] border-0 h-10 px-6 rounded-xl font-bold transition-all hover:scale-105"
            >
              {isStopping ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Stopping...
                </>
              ) : (
                <>
                  <Square className="h-4 w-4 mr-2 fill-current" />
                  Stop Agent
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
*/

export function DashboardOverview({ user, onEditProfile }: DashboardOverviewProps) {
  const { inProgress, history, stats, isLoading, error, refresh } = useApplicationsData();
  const displayName = user?.given_name ?? user?.name?.split(' ')[0] ?? 'Job seeker';

  // Autofill mode state
  const [isAutofilling, setIsAutofilling] = useState(false);

  // Removed modal state - autofill now adds job directly to table in editable state

  // Modal state for post-submit confirmation
  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [extractedMetadata, setExtractedMetadata] = useState<{
    title: string;
    company: string;
    location: string;
    jobUrl: string;
  } | null>(null);

  // Editing state
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedCompany, setEditedCompany] = useState('');
  const [editedLocation, setEditedLocation] = useState('');

  // Listen for OPEN_JOB_IN_EDIT_MODE message from background (now shows modal instead)
  useEffect(() => {
    console.log('[Dashboard] Setting up OPEN_JOB_IN_EDIT_MODE listener');
    const handler = (message: any) => {
      console.log('[Dashboard] Received message:', message.type, message);
      if (message.type === 'OPEN_JOB_IN_EDIT_MODE' && message.data?.metadata) {
        console.log(
          '[Dashboard] Success detected, showing confirmation modal with metadata:',
          message.data.metadata
        );
        setExtractedMetadata(message.data.metadata);
        setShowMetadataModal(true);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => {
      console.log('[Dashboard] Removing OPEN_JOB_IN_EDIT_MODE listener');
      chrome.runtime.onMessage.removeListener(handler);
    };
  }, []);

  // Autofill handler - extract metadata first, then show confirmation
  const handleAutofill = async () => {
    console.log('[Dashboard] Autofill button clicked');
    setIsAutofilling(true);
    try {
      // Get the current active tab
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const currentTab = tabs[0];

      console.log('[Dashboard] Current tab:', currentTab?.id, currentTab?.url);

      if (!currentTab?.id || !currentTab?.url) {
        console.error('[Dashboard] No active tab found');
        setIsAutofilling(false);
        return;
      }

      // Inject content script first (in case it's not already loaded)
      try {
        await chrome.scripting.executeScript({
          target: { tabId: currentTab.id },
          files: ['content/executor-v2.js'],
        });
        console.log('[Dashboard] Content script injected successfully');
        // Wait a bit for script to initialize
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        // Script might already be injected, that's okay
        console.log('[Dashboard] Content script already injected or injection failed:', error);
      }

      // Extract metadata from the page
      console.log('[Dashboard] Extracting metadata from page...');
      const response = await chrome.tabs.sendMessage(currentTab.id, {
        type: 'EXTRACT_JOB_METADATA',
      });

      console.log('[Dashboard] Metadata extraction response:', response);

      if (response?.success) {
        // Trigger autofill (job will be created when user clicks submit)
        console.log('[Dashboard] Sending START_AUTOFILL message');
        await chrome.runtime.sendMessage({
          type: 'START_AUTOFILL',
          tabId: currentTab.id,
          metadata: {
            title: response.title || '',
            company: response.company || '',
            location: response.location || '',
          },
        });
        console.log('[Dashboard] START_AUTOFILL message sent');

        // Reset after a delay (actual completion detected by engine state)
        setTimeout(() => setIsAutofilling(false), 3000);
      } else {
        console.error('[Dashboard] Metadata extraction failed');
        setIsAutofilling(false);
      }
    } catch (error) {
      console.error('[Dashboard] Autofill error:', error);
      setIsAutofilling(false);
    }
  };

  // Edit handlers
  const handleStartEdit = (job: JobRecord) => {
    setEditingJobId(job.id);
    setEditedTitle(job.title);
    setEditedCompany(job.company);
    setEditedLocation(job.location || '');
  };

  const handleCancelEdit = () => {
    setEditingJobId(null);
    setEditedTitle('');
    setEditedCompany('');
    setEditedLocation('');
  };

  const handleConfirmEdit = async (jobId: string) => {
    try {
      await updateJobMetadata(jobId, {
        title: editedTitle,
        company: editedCompany,
        location: editedLocation || undefined,
      });
      // Exit edit mode
      setEditingJobId(null);
      setEditedTitle('');
      setEditedCompany('');
      setEditedLocation('');
      // Refresh the data to show updated values
      refresh();
    } catch (error) {
      console.error('[Dashboard] Error updating job metadata:', error);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      // Import deleteJob from db
      const { deleteJob } = await import('@/lib/jobs/db');
      await deleteJob(jobId);
      // Exit edit mode
      setEditingJobId(null);
      setEditedTitle('');
      setEditedCompany('');
      setEditedLocation('');
      // Refresh the data to remove deleted job
      refresh();
      console.log('[Dashboard] Job deleted:', jobId);
    } catch (error) {
      console.error('[Dashboard] Error deleting job:', error);
    }
  };

  // Handle metadata confirmation after submit - save to DB
  const handleMetadataConfirm = async (confirmed: {
    title: string;
    company: string;
    jobUrl: string;
  }) => {
    console.log('[Dashboard] Metadata confirmed:', confirmed);
    setShowMetadataModal(false);

    try {
      // Determine platform from the confirmed URL (user may have edited it)
      const jobUrl = confirmed.jobUrl || extractedMetadata?.jobUrl || '';

      // Import job store functions
      const { upsertJob } = await import('@/lib/jobs/store');

      // Determine platform from URL
      let platform = 'unknown';
      let jobId = `autofill_${Date.now()}`;

      if (jobUrl.includes('linkedin.com')) {
        platform = 'linkedin';
        const match = jobUrl.match(/jobs\/view\/(\d+)/);
        if (match) jobId = match[1]!;
      } else if (jobUrl.includes('indeed.com')) {
        platform = 'indeed';
        const match = jobUrl.match(/[?&]jk=([^&]+)/);
        if (match) jobId = match[1]!;
      }

      // Save the job as completed with confirmed metadata
      await upsertJob(platform, jobId, {
        title: confirmed.title,
        company: confirmed.company,
        url: jobUrl,
        status: 'completed',
        needsConfirmation: false,
      });

      console.log('[Dashboard] Job saved successfully');
      refresh();
      setExtractedMetadata(null);
    } catch (error) {
      console.error('[Dashboard] Error saving job:', error);
    }
  };

  // Handle metadata modal cancel
  const handleMetadataCancel = () => {
    console.log('[Dashboard] Metadata confirmation cancelled');
    setShowMetadataModal(false);
    setExtractedMetadata(null);
  };

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
      {/* Metadata Confirmation Modal - shown after successful submit */}
      {extractedMetadata && (
        <MetadataConfirmationModal
          isOpen={showMetadataModal}
          metadata={extractedMetadata}
          onConfirm={handleMetadataConfirm}
          onCancel={handleMetadataCancel}
        />
      )}

      {/* Autofill Card - Primary CTA */}
      <AutofillCard isAutofilling={isAutofilling} onAutofill={handleAutofill} />

      {/* Control Center - Agent Mode (hidden for MVP - autofill only) */}
      {/* <ControlCard
        engineState={engineState}
        engineStatus={engineStatus}
        onStart={onStartAgent}
        onStop={onStopAgent}
      /> */}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Pipeline Card */}
        <div className="group relative">
          <div className="absolute -inset-1 bg-gradient-to-r from-[#00f0ff] to-[#7000ff] rounded-[32px] blur opacity-[0.0625] group-hover:opacity-[0.125] transition duration-500" />
          <div className="relative bg-white/5 backdrop-blur-lg border border-white/10 p-8 rounded-[32px] h-full">
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
        <div className="group relative">
          <div className="absolute -inset-1 bg-gradient-to-r from-[#7000ff] to-[#00ff9d] rounded-[32px] blur opacity-[0.0625] group-hover:opacity-[0.125] transition duration-500" />
          <div className="relative bg-white/5 backdrop-blur-lg border border-white/10 p-8 rounded-[32px] h-full flex flex-col">
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
      <div className="group relative">
        <div className="absolute -inset-1 bg-gradient-to-r from-[#00ff9d] to-[#00f0ff] rounded-[32px] blur opacity-[0.0625] group-hover:opacity-[0.125] transition duration-500" />
        <div className="relative bg-white/5 backdrop-blur-lg border border-white/10 p-8 rounded-[32px]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#00ff9d] mb-1">
                Applied Jobs
              </p>
              <h2 className="text-xl font-bold text-white tracking-tight">Your applications</h2>
            </div>
          </div>

          {error && (
            <div className="mb-6 rounded-2xl border border-[#7000ff]/30 bg-[#7000ff]/10 px-4 py-3 text-sm text-[#a78bfa]">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{error}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs border-[#7000ff]/30 text-[#a78bfa] hover:bg-[#7000ff]/10 h-7"
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
                  <th className="pb-4 pl-4">Company / Job Title</th>
                  <th className="pb-4">Job URL</th>
                  <th className="pb-4 pr-4 text-right">Date applied</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading && tableJobs.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-slate-400">
                      <Loader2 className="h-5 w-5 animate-spin inline-block mr-2 text-[#00f0ff]" />
                      Loading applications...
                    </td>
                  </tr>
                ) : tableJobs.length > 0 ? (
                  tableJobs.map((job) => {
                    const isEditing = editingJobId === job.id;
                    const needsConfirmation = job.needsConfirmation;
                    return (
                      <tr
                        key={job.id}
                        className={`group transition-all ${
                          needsConfirmation
                            ? 'bg-[#00ff9d]/5 hover:bg-[#00ff9d]/10 border-l-2 border-[#00ff9d]'
                            : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        {isEditing ? (
                          /* Edit Mode - Form-style layout */
                          <td colSpan={3} className="py-4 px-4">
                            <div className="space-y-4">
                              {/* Form Grid - 2 columns */}
                              <div className="grid grid-cols-2 gap-4">
                                {/* Left Column */}
                                <div className="space-y-3">
                                  <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                                      Company Name
                                    </label>
                                    <input
                                      type="text"
                                      value={editedCompany}
                                      onChange={(e) => setEditedCompany(e.target.value)}
                                      className="w-full bg-[#0a1628]/80 border border-[#00f0ff]/20 rounded-lg px-3 py-2 text-sm font-medium text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00f0ff] focus:ring-1 focus:ring-[#00f0ff]/50 transition-all"
                                      placeholder="Enter company name"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                                      Job Title
                                    </label>
                                    <input
                                      type="text"
                                      value={editedTitle}
                                      onChange={(e) => setEditedTitle(e.target.value)}
                                      className="w-full bg-[#0a1628]/80 border border-[#00f0ff]/20 rounded-lg px-3 py-2 text-sm font-medium text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00f0ff] focus:ring-1 focus:ring-[#00f0ff]/50 transition-all"
                                      placeholder="Enter job title"
                                    />
                                  </div>
                                </div>

                                {/* Right Column */}
                                <div className="space-y-3">
                                  <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                                      Location
                                    </label>
                                    <input
                                      type="text"
                                      value={editedLocation}
                                      onChange={(e) => setEditedLocation(e.target.value)}
                                      className="w-full bg-[#0a1628]/80 border border-[#00f0ff]/20 rounded-lg px-3 py-2 text-sm font-medium text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00f0ff] focus:ring-1 focus:ring-[#00f0ff]/50 transition-all"
                                      placeholder="City, State or Remote"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                                      Status
                                    </label>
                                    <div className="flex items-center h-[42px]">
                                      <span className="inline-flex items-center rounded-full bg-[#00ff9d]/10 px-3 py-1 text-xs font-semibold text-[#00ff9d] border border-[#00ff9d]/20">
                                        Applied
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Action Buttons - Bottom Right */}
                              <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                                {/* Delete button on the left */}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDeleteJob(job.id)}
                                  className="h-8 px-4 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50"
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Delete
                                </Button>

                                {/* Cancel and Confirm on the right */}
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleCancelEdit}
                                    className="h-8 px-4 border-white/20 text-slate-300 hover:bg-white/5 hover:border-white/30"
                                  >
                                    <X className="h-4 w-4 mr-1" />
                                    Cancel
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => handleConfirmEdit(job.id)}
                                    className="h-8 px-4 bg-[#00ff9d] hover:bg-[#00e68a] text-black font-semibold border-0 shadow-lg shadow-[#00ff9d]/20"
                                  >
                                    <Check className="h-4 w-4 mr-1" />
                                    Confirm
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </td>
                        ) : (
                          /* Normal Mode - Regular table cells */
                          <>
                            <td className="py-4 pl-4">
                              <div className="flex items-start gap-2">
                                <div className="flex-1">
                                  <p className="font-bold text-white group-hover:text-[#00f0ff] transition-colors">
                                    {job.company}
                                  </p>
                                  <p className="text-xs font-medium text-slate-400 mt-0.5">
                                    {job.title}
                                  </p>
                                </div>
                                {needsConfirmation && (
                                  <div title="Needs confirmation" className="flex-shrink-0 mt-0.5">
                                    <AlertCircle className="h-4 w-4 text-[#ff9d00]" />
                                  </div>
                                )}
                              </div>
                            </td>

                            <td className="py-4 max-w-[200px]">
                              {job.url ? (
                                <a
                                  href={job.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-[#00f0ff]/70 hover:text-[#00f0ff] font-mono truncate block max-w-[200px] transition-colors"
                                  title={job.url}
                                >
                                  {job.url.replace(/^https?:\/\//, '').substring(0, 45)}
                                  {job.url.replace(/^https?:\/\//, '').length > 45 ? '…' : ''}
                                </a>
                              ) : (
                                <span className="text-slate-600 text-xs">—</span>
                              )}
                            </td>

                            <td className="py-4 pr-4 text-right">
                              <div className="flex items-center justify-end gap-3">
                                <span className="font-mono text-xs text-slate-400">
                                  {formatAppliedDate(job.lastAppliedAt ?? job.updatedAt)}
                                </span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleStartEdit(job)}
                                  className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-[#00f0ff]"
                                >
                                  <PenSquare className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={3} className="py-12 text-center">
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
    </div>
  );
}
