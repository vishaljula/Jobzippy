import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AutofillCardProps {
  isAutofilling: boolean;
  onAutofill: () => void;
}

export function AutofillCard({ isAutofilling, onAutofill }: AutofillCardProps) {
  return (
    <div className="relative group w-full">
      {/* Glow Effect */}
      <div className="absolute -inset-1 bg-gradient-to-r from-[#00ff9d] to-[#00f0ff] rounded-3xl blur opacity-[0.125] group-hover:opacity-[0.25] transition duration-500" />

      <div className="relative bg-white/5 backdrop-blur-lg border border-white/10 p-8 rounded-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full flex items-center justify-center bg-gradient-to-br from-[#00ff9d] to-[#00f0ff] shadow-[0_0_20px_rgba(0,255,157,0.4)]">
              <Sparkles className="h-7 w-7 text-slate-900" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white tracking-tight">AI Autofill</h3>
              <p className="text-sm text-slate-400 mt-1">
                {isAutofilling
                  ? 'Filling form fields...'
                  : 'Open a job application, then click to autofill'}
              </p>
            </div>
          </div>

          <Button
            onClick={onAutofill}
            disabled={isAutofilling}
            className="bg-gradient-to-r from-[#00ff9d] to-[#00f0ff] hover:opacity-90 text-slate-900 shadow-[0_0_25px_rgba(0,255,157,0.4)] border-0 h-12 px-8 rounded-xl font-bold transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAutofilling ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Autofilling...
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5 mr-2" />
                Autofill This Form
              </>
            )}
          </Button>
        </div>

        {isAutofilling && (
          <div className="mt-6 rounded-xl border border-[#00ff9d]/20 bg-[#00ff9d]/10 px-4 py-3">
            <p className="text-sm text-[#00ff9d] font-medium">
              ✨ Filling form fields with your profile data. You&apos;ll review and submit when
              ready.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
