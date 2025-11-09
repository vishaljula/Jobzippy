import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  key: string;
  icon: LucideIcon;
  label: string;
}

interface AvatarProps {
  src: string;
  alt: string;
}

interface LayoutShellProps {
  title: string;
  subtitle: string;
  statusLabel: ReactNode;
  headerActions?: ReactNode;
  history: ReactNode;
  composer: ReactNode;
  navItems: readonly NavItem[];
  avatar?: AvatarProps | null;
  railFooter?: ReactNode;
  footerNote?: ReactNode;
}

export function LayoutShell({
  title,
  subtitle,
  statusLabel,
  headerActions,
  history,
  composer,
  navItems,
  avatar,
  railFooter,
  footerNote,
}: LayoutShellProps) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-100 text-slate-800">
      <div className="flex flex-1 flex-col overflow-hidden rounded-r-[32px] bg-white shadow-xl">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-6 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white shadow-md">
              <Sparkles className="h-5 w-5" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-base font-semibold">{title}</h1>
              <p className="text-xs text-slate-500">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>{statusLabel}</span>
            {headerActions}
          </div>
        </header>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto bg-slate-50/60 px-8 py-6">
            <div className="mx-auto max-w-3xl space-y-6 pb-6">{history}</div>
          </div>
          <div className="border-t border-slate-200 bg-white/95 px-8 py-4">
            <div className="mx-auto w-full max-w-3xl">{composer}</div>
          </div>
          <footer className="flex h-12 items-center justify-between border-t border-slate-200 bg-white/95 px-6 text-xs text-slate-500">
            <span>v0.1.0</span>
            <span>{footerNote ?? 'Built with ❤️ for job seekers'}</span>
          </footer>
        </div>
      </div>

      <aside className="hidden w-20 flex-col items-center justify-between border-l border-slate-200 bg-white/90 py-6 text-slate-500 backdrop-blur md:flex">
        <div className="flex flex-col items-center gap-6">
          {avatar ? (
            <img
              src={avatar.src}
              alt={avatar.alt}
              className="h-11 w-11 rounded-2xl border-2 border-indigo-100 shadow-sm"
            />
          ) : (
            <div className="h-11 w-11 rounded-2xl border border-slate-200 bg-slate-100 shadow-sm" />
          )}
          <div className="flex flex-col items-center gap-4 text-[10px] font-medium uppercase tracking-wide text-slate-400">
            {navItems.map(({ key, icon: Icon, label }) => (
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
        <div>{railFooter}</div>
      </aside>
    </div>
  );
}
