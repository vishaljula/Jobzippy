import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ResumeOnboardingCardProps {
  onResume: () => void;
}

export function ResumeOnboardingCard({ onResume }: ResumeOnboardingCardProps) {
  return (
    <div
      data-testid="resume-onboarding-card"
      className="border border-amber-200 bg-amber-50 rounded-xl p-5 flex items-start space-x-4 shadow-sm"
    >
      <div className="w-10 h-10 rounded-full bg-amber-200 text-amber-700 flex items-center justify-center">
        <AlertCircle className="w-5 h-5" />
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-amber-900 mb-1">Finish setting up Jobzippy</h3>
        <p className="text-sm text-amber-800 mb-3">
          You skipped onboarding earlier. Complete setup to unlock auto-apply, intelligent tracking,
          and daily insights.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="border-amber-300 text-amber-900 hover:bg-amber-100"
          onClick={onResume}
        >
          Resume onboarding
        </Button>
      </div>
    </div>
  );
}
