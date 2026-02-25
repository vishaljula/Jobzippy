import {
  Loader2,
  PenSquare,
  Check,
  X,
  AlertCircle,
  Trash2,
  Sparkles,
  ExternalLink,
  Briefcase,
} from 'lucide-react';
import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import type { UserInfo } from '@/lib/types';
import { useApplicationsData } from '@/lib/jobs/useApplicationsData';
import type { JobRecord } from '@/lib/jobs/store-types';
import { updateJobMetadata } from '@/lib/jobs/store';
import { MetadataConfirmationModal } from './MetadataConfirmationModal';
import { logger } from '@/lib/logger';

interface DashboardOverviewProps {
  user: UserInfo | null;
  onEditProfile: () => void;
  engineState: 'IDLE' | 'RUNNING' | 'PAUSED';
  engineStatus?: string;
  onStartAgent: () => void;
  onStopAgent: () => void;
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

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url.substring(0, 20);
  }
}

export function DashboardOverview({ user: _user }: DashboardOverviewProps) {
  const { inProgress, history, stats, isLoading, error, refresh } = useApplicationsData();

  // Autofill mode state
  const [isAutofilling, setIsAutofilling] = useState(false);

  // Pagination
  const ITEMS_PER_PAGE = 10;
  const [currentPage, setCurrentPage] = useState(1);

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

  // Listen for OPEN_JOB_IN_EDIT_MODE message from background
  useEffect(() => {
    const handler = (message: any) => {
      if (message.type === 'OPEN_JOB_IN_EDIT_MODE' && message.data?.metadata) {
        setExtractedMetadata(message.data.metadata);
        setShowMetadataModal(true);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  // Autofill handler
  const handleAutofill = async () => {
    setIsAutofilling(true);
    try {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const currentTab = tabs[0];

      if (!currentTab?.id || !currentTab?.url) {
        setIsAutofilling(false);
        return;
      }

      try {
        await chrome.scripting.executeScript({
          target: { tabId: currentTab.id },
          files: ['content/executor-v2.js'],
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch {
        // Script might already be injected
      }

      const response = await chrome.tabs.sendMessage(currentTab.id, {
        type: 'EXTRACT_JOB_METADATA',
      });

      if (response?.success) {
        // 🔍 DIAGNOSTIC: Log START_AUTOFILL being sent — should happen exactly ONCE per button click
        logger.log(
          `[⚡ AUTOFILL] Sending START_AUTOFILL to background — tabId:${currentTab.id} at ${new Date().toISOString()}`
        );
        await chrome.runtime.sendMessage({
          type: 'START_AUTOFILL',
          tabId: currentTab.id,
          metadata: {
            title: response.title || '',
            company: response.company || '',
            location: response.location || '',
          },
        });
        setTimeout(() => setIsAutofilling(false), 3000);
      } else {
        setIsAutofilling(false);
      }
    } catch {
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
      setEditingJobId(null);
      setEditedTitle('');
      setEditedCompany('');
      setEditedLocation('');
      refresh();
    } catch (error) {
      console.error('[Dashboard] Error updating job metadata:', error);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      const { deleteJob } = await import('@/lib/jobs/db');
      await deleteJob(jobId);
      setEditingJobId(null);
      setEditedTitle('');
      setEditedCompany('');
      setEditedLocation('');
      refresh();
    } catch (error) {
      console.error('[Dashboard] Error deleting job:', error);
    }
  };

  const handleMetadataConfirm = async (confirmed: {
    title: string;
    company: string;
    jobUrl: string;
  }) => {
    setShowMetadataModal(false);
    try {
      const jobUrl = confirmed.jobUrl || extractedMetadata?.jobUrl || '';
      const { upsertJob } = await import('@/lib/jobs/store');

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

      await upsertJob(platform, jobId, {
        title: confirmed.title,
        company: confirmed.company,
        url: jobUrl,
        status: 'completed',
        needsConfirmation: false,
      });

      refresh();
      setExtractedMetadata(null);
    } catch (error) {
      console.error('[Dashboard] Error saving job:', error);
    }
  };

  const handleMetadataCancel = () => {
    setShowMetadataModal(false);
    setExtractedMetadata(null);
  };

  // Combine in-progress and recent history for the table (show latest 20)
  const allJobs = [...inProgress, ...history];
  const uniqueJobsMap = new Map<string, JobRecord>();
  for (const job of allJobs) {
    const existing = uniqueJobsMap.get(job.id);
    if (!existing || job.updatedAt > existing.updatedAt) {
      uniqueJobsMap.set(job.id, job);
    }
  }
  const tableJobs = Array.from(uniqueJobsMap.values()).sort((a, b) => b.updatedAt - a.updatedAt);

  const totalPages = Math.max(1, Math.ceil(tableJobs.length / ITEMS_PER_PAGE));
  const paginatedJobs = tableJobs.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset to page 1 whenever data reloads
  useEffect(() => {
    setCurrentPage(1);
  }, [tableJobs.length]);

  const totalApps = stats?.completed ?? 0;
  const totalFills = stats?.total ?? 0;

  return (
    <div className="space-y-5">
      {/* Metadata Confirmation Modal */}
      {extractedMetadata && (
        <MetadataConfirmationModal
          isOpen={showMetadataModal}
          metadata={extractedMetadata}
          onConfirm={handleMetadataConfirm}
          onCancel={handleMetadataCancel}
        />
      )}

      {/* ── Stats + Autofill Banner ── */}
      <div className="relative group w-full">
        {/* Glow – purple gradient like Applications This Month */}
        <div className="absolute -inset-1 bg-gradient-to-r from-[#00f0ff] to-[#7000ff] rounded-3xl blur opacity-[0.15] group-hover:opacity-[0.25] transition duration-500" />

        <div className="relative bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl overflow-hidden">
          {/* Top strip: stats row */}
          <div className="flex items-center gap-6 px-6 py-4 border-b border-white/5">
            {/* Stat: Total Apps */}
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#00ff9d]/10 border border-[#00ff9d]/20">
                <Briefcase className="h-4 w-4 text-[#00ff9d]" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300">
                  Jobs Applied
                </p>
                <p className="text-xl font-bold text-white leading-none mt-0.5">
                  {isLoading ? <span className="text-slate-500 text-sm">—</span> : totalApps}
                </p>
              </div>
            </div>

            <div className="h-8 w-px bg-white/10" />

            {/* Stat: Form Fills */}
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#00f0ff]/10 border border-[#00f0ff]/20">
                <Sparkles className="h-4 w-4 text-[#00f0ff]" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300">
                  AI Form Fills
                </p>
                <p className="text-xl font-bold text-white leading-none mt-0.5">
                  {isLoading ? <span className="text-slate-500 text-sm">—</span> : totalFills}
                </p>
              </div>
            </div>
          </div>

          {/* Bottom strip: autofill CTA */}
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full flex items-center justify-center bg-gradient-to-br from-[#00ff9d] to-[#00f0ff] shadow-[0_0_12px_rgba(0,255,157,0.3)]">
                <Sparkles className="h-4 w-4 text-slate-900" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">AI Autofill</p>
                <p className="text-xs text-slate-400">
                  {isAutofilling
                    ? 'Filling form fields with your profile...'
                    : 'Open a job application, then click to autofill'}
                </p>
              </div>
            </div>

            <Button
              onClick={handleAutofill}
              disabled={isAutofilling}
              className="bg-gradient-to-r from-[#00ff9d] to-[#00f0ff] hover:opacity-90 text-slate-900 shadow-[0_0_20px_rgba(0,255,157,0.35)] border-0 h-10 px-5 rounded-xl font-bold text-sm transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              {isAutofilling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Autofilling...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Autofill Form
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Applied Jobs Table ── */}
      <div className="group relative">
        <div className="absolute -inset-1 bg-gradient-to-r from-[#00ff9d] to-[#00f0ff] rounded-[32px] blur opacity-[0.0625] group-hover:opacity-[0.125] transition duration-500" />
        <div className="relative bg-white/5 backdrop-blur-lg border border-white/10 p-6 rounded-[32px]">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#00ff9d] mb-1">
                Applied Jobs
              </p>
              <h2 className="text-lg font-bold text-white tracking-tight">Your applications</h2>
            </div>
          </div>

          {error && (
            <div className="mb-5 rounded-2xl border border-[#7000ff]/30 bg-[#7000ff]/10 px-4 py-3 text-sm text-[#a78bfa]">
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
            <table className="w-full text-sm table-fixed">
              <thead className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-300">
                <tr>
                  <th className="pb-3 pl-2 pr-4 w-[38%]">Company / Job Title</th>
                  <th className="pb-3 w-[28%]">Link</th>
                  <th className="pb-3 hidden sm:table-cell w-[20%]">Date</th>
                  <th className="pb-3 pr-2 text-right w-[14%]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading && tableJobs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">
                      <Loader2 className="h-5 w-5 animate-spin inline-block mr-2 text-[#00f0ff]" />
                      Loading applications...
                    </td>
                  </tr>
                ) : paginatedJobs.length > 0 ? (
                  paginatedJobs.map((job) => {
                    const isEditing = editingJobId === job.id;
                    const needsConfirmation = job.needsConfirmation;
                    return (
                      <tr
                        key={job.id}
                        className={`group/row transition-all ${
                          needsConfirmation
                            ? 'bg-[#00ff9d]/5 hover:bg-[#00ff9d]/10 border-l-2 border-[#00ff9d]'
                            : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        {isEditing ? (
                          /* ── Edit Mode ── */
                          <td colSpan={4} className="py-4 px-2">
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                {/* Left */}
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

                                {/* Right */}
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

                              {/* Action Buttons */}
                              <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDeleteJob(job.id)}
                                  className="h-8 px-4 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50"
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Delete
                                </Button>
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
                          /* ── Normal Mode ── */
                          <>
                            {/* Company / Title */}
                            <td className="py-3 pl-2 pr-4">
                              <div className="flex items-start gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-white truncate group-hover/row:text-[#00f0ff] transition-colors text-sm">
                                    {job.company}
                                  </p>
                                  <p className="text-xs font-medium text-slate-400 mt-0.5 truncate">
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

                            {/* URL – styled link chip */}
                            <td className="py-3 pr-2">
                              {job.url ? (
                                <a
                                  href={job.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={job.url}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[#00f0ff] text-xs font-medium hover:bg-[#00f0ff]/10 hover:border-[#00f0ff]/30 transition-all group/link max-w-[120px]"
                                >
                                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                  <span className="truncate">{getHostname(job.url)}</span>
                                </a>
                              ) : (
                                <span className="text-slate-600 text-xs">—</span>
                              )}
                            </td>

                            {/* Date – hidden on narrow widths */}
                            <td className="py-3 hidden sm:table-cell">
                              <span className="font-mono text-xs text-slate-400">
                                {formatAppliedDate(job.lastAppliedAt ?? job.updatedAt)}
                              </span>
                            </td>

                            {/* Actions */}
                            <td className="py-3 pr-2 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleStartEdit(job)}
                                className="h-7 w-7 p-0 text-slate-500 hover:text-[#00f0ff] hover:bg-[#00f0ff]/10 transition-all rounded-lg"
                              >
                                <PenSquare className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center">
                          <Briefcase className="h-6 w-6 text-slate-500" />
                        </div>
                        <p className="text-slate-400 font-medium">No applications yet</p>
                        <p className="text-xs text-slate-500">
                          Open a job application and use Autofill to get started
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
              <p className="text-xs text-slate-400">
                {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
                {Math.min(currentPage * ITEMS_PER_PAGE, tableJobs.length)} of {tableJobs.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-7 px-3 text-xs text-slate-300 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ← Prev
                </Button>
                <span className="text-xs text-slate-400 font-mono">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="h-7 px-3 text-xs text-slate-300 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next →
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
