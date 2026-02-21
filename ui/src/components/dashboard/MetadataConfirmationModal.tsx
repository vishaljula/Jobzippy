import { Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

interface MetadataConfirmationModalProps {
  isOpen: boolean;
  metadata: {
    title: string | null;
    company: string | null;
    jobUrl?: string | null;
    needsConfirmation?: boolean;
  };
  onConfirm: (confirmed: { title: string; company: string; jobUrl: string }) => void;
  onCancel: () => void;
}

export function MetadataConfirmationModal({
  isOpen,
  metadata,
  onConfirm,
  onCancel,
}: MetadataConfirmationModalProps) {
  // Strip fallback placeholder strings — show blank so the user fills in correct info
  const cleanTitle = (v: string | null) => (v && v !== 'Unknown Job' ? v : '');
  const cleanCompany = (v: string | null) => (v && v !== 'Unknown Company' ? v : '');

  const [title, setTitle] = useState(cleanTitle(metadata.title));
  const [company, setCompany] = useState(cleanCompany(metadata.company));
  const [jobUrl, setJobUrl] = useState(metadata.jobUrl || '');

  // Sync internal state when metadata prop changes (e.g. modal reused across submissions)
  useEffect(() => {
    setTitle(cleanTitle(metadata.title));
    setCompany(cleanCompany(metadata.company));
    setJobUrl(metadata.jobUrl || '');
  }, [metadata.title, metadata.company, metadata.jobUrl]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!title.trim() || !company.trim()) {
      return;
    }
    onConfirm({ title, company, jobUrl });
  };

  const hasRequiredFields = title.trim() && company.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-gradient-to-br from-[#0a1628] to-[#0d1b2a] border border-[#00f0ff]/20 rounded-2xl shadow-2xl shadow-[#00f0ff]/10 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/10">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white">Save This Job</h2>
              <p className="text-sm text-slate-400 mt-1">
                Confirm the details look right before saving.
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          {/* Company */}
          <div>
            <label className="text-xs font-semibold text-slate-300 mb-2 block flex items-center gap-1">
              Company
              <span className="text-[#ff9d00]">*</span>
            </label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="w-full bg-[#0a1628]/80 border border-[#00f0ff]/20 rounded-lg px-4 py-2.5 text-sm font-bold text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00f0ff] focus:ring-2 focus:ring-[#00f0ff]/30 transition-all"
              placeholder="Enter company name"
              autoFocus
            />
          </div>

          {/* Job Title */}
          <div>
            <label className="text-xs font-semibold text-slate-300 mb-2 block flex items-center gap-1">
              Job Title
              <span className="text-[#ff9d00]">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#0a1628]/80 border border-[#00f0ff]/20 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00f0ff] focus:ring-2 focus:ring-[#00f0ff]/30 transition-all"
              placeholder="Enter job title"
            />
          </div>

          {/* Job URL */}
          <div>
            <label className="text-xs font-semibold text-slate-300 mb-2 block">Job URL</label>
            <input
              type="url"
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
              className="w-full bg-[#0a1628]/80 border border-[#00f0ff]/20 rounded-lg px-4 py-2.5 text-sm text-[#00f0ff]/80 placeholder:text-slate-500 focus:outline-none focus:border-[#00f0ff] focus:ring-2 focus:ring-[#00f0ff]/30 transition-all font-mono"
              placeholder="https://..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white/5 border-t border-white/10 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 px-5 inline-flex items-center gap-2 rounded-md border border-white/30 bg-transparent text-white text-sm font-medium hover:bg-white/10 hover:border-white/50 transition-colors"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
          <Button
            onClick={handleConfirm}
            disabled={!hasRequiredFields}
            className="h-10 px-6 inline-flex items-center bg-[#00ff9d] hover:bg-[#00e68a] text-black font-semibold border-0 shadow-lg shadow-[#00ff9d]/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="h-4 w-4 mr-2" />
            Save Job
          </Button>
        </div>
      </div>
    </div>
  );
}
