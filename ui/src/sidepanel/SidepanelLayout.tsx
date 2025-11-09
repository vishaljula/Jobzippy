import { Sparkles, LogOut, Settings, BarChart3, Shield, Bell } from 'lucide-react';
import type { ReactNode } from 'react';
import type { UserInfo } from '@/lib/types';
import clsx from 'clsx';

interface SidepanelLayoutProps {
  user: UserInfo | null;
  onLogout?: () => void;
  statusLabel: ReactNode;
  headerActions?: ReactNode;
  history: ReactNode;
  composer?: ReactNode;
}

const NAV_ITEMS = [
  { key: 'settings', icon: Settings, label: 'Settings' },
  { key: 'insights', icon: BarChart3, label: 'Insights' },
  { key: 'vault', icon: Shield, label: 'Vault' },
  { key: 'alerts', icon: Bell, label: 'Alerts' },
] as const;

export function SidepanelLayout({
  user,
  onLogout,
  statusLabel,
  headerActions,
  history,
  composer,
}: SidepanelLayoutProps) {
  return (
    <div className="h-screen w-full bg-slate-100 text-slate-800 flex overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden rounded-r-[32px] bg-white shadow-xl">
        <header className="flex h-16 items-center justify-between px-6 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white shadow-md">
              <Sparkles className="h-5 w-5" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-base font-semibold">Jobzippy</h1>
              <p className="text-xs text-slate-500">Your agentic AI for job search</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>{statusLabel}</span>
            {headerActions}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-6 bg-slate-50/60">
          <div className="mx-auto h-full max-w-3xl space-y-6">{history}</div>
        </div>

        {composer ? (
          <div className="border-t border-slate-200 bg-white/95 px-6 py-4">{composer}</div>
        ) : null}

        <footer className="flex h-12 flex-none items-center justify-between border-t border-slate-200 bg-white/95 px-6 text-xs text-slate-500">
          <span>v0.1.0</span>
          <span>Built with ❤️ for job seekers</span>
        </footer>
      </div>

      <aside className="hidden w-20 flex-col items-center justify-between border-l border-slate-200 bg-white/90 py-6 text-slate-500 backdrop-blur md:flex">
        <div className="flex flex-col items-center gap-6">
          {user ? (
            <img
              src={user.picture}
              alt={user.name}
              className="h-11 w-11 rounded-2xl border-2 border-indigo-100 shadow-sm"
            />
          ) : (
            <div className="h-11 w-11 rounded-2xl border border-slate-200 bg-slate-100 shadow-sm" />
          )}
          <div className="flex flex-col items-center gap-4 text-[10px] font-medium uppercase tracking-wide text-slate-400">
            {NAV_ITEMS.map(({ key, icon: Icon, label }) => (
              <div
                key={key}
                className="flex flex-col items-center gap-1 text-slate-400 transition-colors hover:text-indigo-500"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:scale-105 hover:border-indigo-200">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </div>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          disabled={!onLogout}
          className={clsx(
            'flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-400 shadow-sm transition',
            onLogout ? 'hover:text-slate-700' : 'opacity-40 cursor-default'
          )}
        >
          <LogOut className="h-4 w-4" />
        </button>
      </aside>
    </div>
  );
}
