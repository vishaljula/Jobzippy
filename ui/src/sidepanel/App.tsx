import { useState, useEffect, useCallback } from 'react';
import { Rocket, Target, BarChart3, Bell, Shield, Sparkles, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { useAuth } from '@/lib/auth/AuthContext';
import { SignInWithGoogle, GmailConsentMessage } from '@/components/SignInWithGoogle';
import { useOnboarding } from '@/lib/onboarding';
import { OnboardingWizard, ResumeOnboardingCard } from '@/components/onboarding';

function App() {
  const { isAuthenticated, isLoading: authLoading, user, logout: handleLogout } = useAuth();
  const {
    snapshot,
    isLoading: onboardingLoading,
    begin,
    complete,
    skip,
  } = useOnboarding(isAuthenticated);
  const [isLoading, setIsLoading] = useState(true);
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  useEffect(() => {
    // Wait for both initial load and auth check
    if (!authLoading) {
      setTimeout(() => setIsLoading(false), 300);
    }
  }, [authLoading]);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsWizardOpen(false);
      return;
    }

    if (!onboardingLoading) {
      if (snapshot.status === 'not_started') {
        void begin();
        setIsWizardOpen(true);
      } else if (snapshot.status === 'in_progress') {
        setIsWizardOpen(true);
      } else if (snapshot.status === 'completed') {
        setIsWizardOpen(false);
      }
    }
  }, [isAuthenticated, onboardingLoading, snapshot.status, begin]);

  const handleResumeOnboarding = useCallback(() => {
    void begin();
    setIsWizardOpen(true);
  }, [begin]);

  const handleCompleteOnboarding = useCallback(async () => {
    await complete();
    setIsWizardOpen(false);
  }, [complete]);

  const handleSkipOnboarding = useCallback(async () => {
    await skip();
    setIsWizardOpen(false);
  }, [skip]);

  const appLoading = isLoading || authLoading || (isAuthenticated && onboardingLoading);

  if (appLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary-50 to-secondary-50">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
          <p className="text-gray-600 font-medium">Loading Jobzippy...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toaster position="top-right" />
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-lg flex items-center justify-center shadow-md">
                  <Sparkles className="w-6 h-6 text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Jobzippy</h1>
                  <p className="text-xs text-gray-500">Your AI Job Assistant</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {isAuthenticated && user ? (
                  <>
                    <img
                      src={user.picture}
                      alt={user.name}
                      className="w-8 h-8 rounded-full border-2 border-primary-200"
                    />
                    <Button variant="ghost" size="sm" onClick={handleLogout} className="text-xs">
                      <LogOut className="w-3 h-3 mr-1" />
                      Logout
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                    <span className="text-xs text-gray-600 font-medium">Not signed in</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="p-6 pb-16">
          <div className="max-w-2xl mx-auto">
            {!isAuthenticated ? (
              /* Sign In View */
              <div className="bg-white rounded-xl shadow-lg p-8 mb-6 animate-slide-up">
                <div className="text-center">
                  <div className="relative w-20 h-20 mx-auto mb-4">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-full opacity-20 blur-xl"></div>
                    <div className="relative w-20 h-20 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-full flex items-center justify-center">
                      <Rocket className="w-10 h-10 text-white" strokeWidth={2.5} />
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Jobzippy!</h2>
                  <p className="text-gray-600 mb-6">
                    Your personal agentic AI assistant who manages your job applications
                  </p>
                  <SignInWithGoogle />
                  <GmailConsentMessage />
                </div>
              </div>
            ) : (
              /* Dashboard View - Authenticated */
              <div className="bg-white rounded-xl shadow-lg p-8 mb-6 animate-slide-up">
                <div className="text-center">
                  <div className="relative w-20 h-20 mx-auto mb-4">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-full opacity-20 blur-xl"></div>
                    <div className="relative w-20 h-20 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-full flex items-center justify-center">
                      <Rocket className="w-10 h-10 text-white" strokeWidth={2.5} />
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    Welcome back, {user?.given_name}!
                  </h2>
                  <p className="text-gray-600 mb-6">
                    Your personal agentic AI assistant who manages your job applications
                  </p>
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-primary-600 to-secondary-600 hover:from-primary-700 hover:to-secondary-700"
                    onClick={handleResumeOnboarding}
                  >
                    {snapshot.status === 'completed' ? 'Launch Jobzippy' : 'Complete Setup'}
                  </Button>
                </div>
              </div>
            )}

            {isAuthenticated && snapshot.status === 'skipped' && (
              <div className="mb-6">
                <ResumeOnboardingCard onResume={handleResumeOnboarding} />
              </div>
            )}

            {/* Feature Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FeatureCard
                icon={<Target className="w-8 h-8" strokeWidth={2} />}
                iconBg="from-blue-500 to-cyan-500"
                title="Auto-Apply"
                description="Automatically apply to jobs matching your preferences"
              />
              <FeatureCard
                icon={<BarChart3 className="w-8 h-8" strokeWidth={2} />}
                iconBg="from-purple-500 to-pink-500"
                title="Track Applications"
                description="All applications logged in your Google Sheet"
              />
              <FeatureCard
                icon={<Bell className="w-8 h-8" strokeWidth={2} />}
                iconBg="from-orange-500 to-red-500"
                title="Daily Updates"
                description="Get WhatsApp/SMS summaries of your progress"
              />
              <FeatureCard
                icon={<Shield className="w-8 h-8" strokeWidth={2} />}
                iconBg="from-green-500 to-emerald-500"
                title="Privacy First"
                description="Your data stays encrypted and under your control"
              />
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>v0.1.0</span>
            <span>Built with ❤️ for job seekers</span>
          </div>
        </footer>
      </div>
      <OnboardingWizard
        open={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onComplete={handleCompleteOnboarding}
        onSkip={handleSkipOnboarding}
      />
    </>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
}

function FeatureCard({ icon, iconBg, title, description }: FeatureCardProps) {
  return (
    <div className="bg-white rounded-lg p-6 shadow-md hover:shadow-lg transition-all duration-200 group cursor-pointer">
      <div className="relative mb-4">
        <div
          className={`w-14 h-14 bg-gradient-to-br ${iconBg} rounded-xl flex items-center justify-center text-white transform group-hover:scale-110 transition-transform duration-200`}
        >
          {icon}
        </div>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
}

export default App;
