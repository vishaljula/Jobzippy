import { useEffect, useState } from 'react';
import { Sparkles, ShieldCheck, LogIn, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface TutorialCarouselProps {
  open: boolean;
  onClose: () => void;
  onStart?: () => void;
}

type Step = {
  title: string;
  body: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
};

const STEPS: Step[] = [
  {
    title: 'Sign in on job sites',
    body: (
      <span>
        Make sure you&apos;re logged into{' '}
        <a
          href="https://www.linkedin.com/jobs/"
          target="_blank"
          rel="noreferrer"
          className="text-indigo-600 underline underline-offset-2 hover:text-indigo-700"
        >
          LinkedIn
        </a>{' '}
        and{' '}
        <a
          href="https://www.indeed.com/"
          target="_blank"
          rel="noreferrer"
          className="text-indigo-600 underline underline-offset-2 hover:text-indigo-700"
        >
          Indeed
        </a>{' '}
        in this browser.
      </span>
    ),
    icon: LogIn,
  },
  {
    title: 'Keep this window open',
    body: 'Keep Chrome running while Jobzippy works. You can minimize the browser.',
    icon: Monitor,
  },
  {
    title: 'No passwords needed',
    body: 'We never ask for your passwords. We use your existing sessions only.',
    icon: ShieldCheck,
  },
  {
    title: 'You’re in control',
    body: 'You can stop anytime. Your progress is saved automatically.',
    icon: Sparkles,
  },
];

export function TutorialCarousel({ open, onClose, onStart }: TutorialCarouselProps) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!open) {
      setStep(0);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => (!isOpen ? onClose() : null)}>
      <DialogContent className="sm:max-w-md rounded-2xl p-0 overflow-hidden">
        <div className="relative bg-gradient-to-br from-primary-500 to-secondary-500 px-6 py-5 text-white">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-white">Before we start</DialogTitle>
            <DialogDescription className="text-white/80">
              A quick guide to get the best results with Jobzippy
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="px-6 pb-5 pt-4">
          {(() => {
            const safeIndex = Math.min(Math.max(step, 0), STEPS.length - 1);
            const current = STEPS[safeIndex]!;
            const Icon = current.icon!;
            return (
              <div className="mb-4 flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{current.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{current.body}</p>
                </div>
              </div>
            );
          })()}
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  aria-label={`Step ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? 'w-6 bg-indigo-600' : 'w-3 bg-slate-200'
                  }`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              {step > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                >
                  Back
                </Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button size="sm" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
                  Next
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    if (onStart) onStart();
                    onClose();
                  }}
                >
                  Start Agent!
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
