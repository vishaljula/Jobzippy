import { useState } from 'react';
import { Sparkles, UserCheck, FolderCheck, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface OnboardingWizardProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  onSkip: () => void;
}

interface StepDefinition {
  id: string;
  title: string;
  subtitle: string;
  highlight: string;
  illustration: LucideIcon;
  checklist: string[];
}

const steps: StepDefinition[] = [
  {
    id: 'welcome',
    title: 'Welcome to Jobzippy',
    subtitle: 'Let’s set up your AI job assistant in just a few steps.',
    highlight:
      'Jobzippy auto-applies, tracks responses, and keeps you informed—while you focus on interviews.',
    illustration: Sparkles,
    checklist: [
      'Connect your Google account securely',
      'Share role, location, and salary targets',
      'Review sample drafts so the agent matches your tone before it applies',
    ],
  },
  {
    id: 'ready',
    title: 'What happens next?',
    subtitle: 'We’ll guide you through collecting details so the agent can apply like a pro.',
    highlight: 'The more context you provide, the smarter Jobzippy becomes.',
    illustration: UserCheck,
    checklist: [
      'Upload your resume for AI parsing',
      'Share preferred roles and locations',
      'Confirm what data Jobzippy can read or update on your behalf',
    ],
  },
  {
    id: 'preview',
    title: 'Stay in control',
    subtitle: 'Review and confirm everything before Jobzippy starts applying on your behalf.',
    highlight: 'You can pause, resume, or update your preferences anytime from the dashboard.',
    illustration: FolderCheck,
    checklist: [
      'Review the profile fields and preferences we store for you',
      'See how edits sync right away to your encrypted vault',
      'Launch auto-apply with confidence',
    ],
  },
];

export function OnboardingWizard({ open, onClose, onComplete, onSkip }: OnboardingWizardProps) {
  const [activeStep, setActiveStep] = useState(0);

  if (!open) return null;

  const totalSteps = steps.length;
  const progress = Math.round(((activeStep + 1) / totalSteps) * 100);
  const step = steps[activeStep] ?? steps[0];
  if (!step) return null;
  const Illustration = step.illustration;

  const handleNext = () => {
    if (activeStep === totalSteps - 1) {
      onComplete();
      onClose();
    } else {
      setActiveStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (activeStep === 0) {
      onClose();
    } else {
      setActiveStep((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    onSkip();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-slide-up">
        <div className="px-6 pt-6 pb-4 bg-gradient-to-br from-primary-50 via-white to-secondary-50">
          <div className="flex items-center justify-between text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
            <span>
              Step {activeStep + 1} of {totalSteps}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden mb-6">
            <div
              className="h-full bg-gradient-to-r from-primary-500 to-secondary-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>

          <div className="flex items-center space-x-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500 text-white flex items-center justify-center shadow-lg">
              <Illustration className="w-6 h-6" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-1">{step.title}</h2>
              <p className="text-sm text-gray-600">{step.subtitle}</p>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-inner">
            <p className="text-sm text-gray-700 font-medium mb-3 leading-relaxed">
              {step.highlight}
            </p>
            <ul className="space-y-2 text-sm text-gray-600">
              {step.checklist.map((item) => (
                <li key={item} className="flex items-start space-x-3">
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-primary-500"></span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="px-6 py-4 flex items-center justify-between bg-white border-t border-gray-100">
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="sm" onClick={handleSkip}>
              Skip for now
            </Button>
            {activeStep > 0 && (
              <Button variant="ghost" size="sm" onClick={handleBack}>
                Back
              </Button>
            )}
          </div>
          <Button
            size="sm"
            className="bg-gradient-to-r from-primary-600 to-secondary-600 hover:from-primary-700 hover:to-secondary-700"
            onClick={handleNext}
          >
            {activeStep === totalSteps - 1 ? 'Finish setup' : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}
