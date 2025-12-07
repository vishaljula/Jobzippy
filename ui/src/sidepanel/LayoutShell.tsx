import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  key: string;
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  active?: boolean;
  highlight?: boolean;
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
  secondaryNavItems?: readonly NavItem[];
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
  secondaryNavItems,
  avatar,
  railFooter,
  footerNote,
}: LayoutShellProps) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-gradient-to-br from-[#020617] via-[#0f172a] to-[#020617] text-slate-50">
      <div className="flex flex-1 flex-col overflow-hidden rounded-r-[32px] border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl">
        <header className="flex h-16 items-center justify-between border-b border-white/10 px-6 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#00f0ff] via-[#7000ff] to-[#00ff9d] text-[#020617] shadow-[0_10px_30px_rgba(0,240,255,0.3)]">
              <Sparkles className="h-5 w-5" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-white">{title}</h1>
              <p className="text-xs text-slate-400">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-300">
            <span>{statusLabel}</span>
            {headerActions}
          </div>
        </header>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="mx-auto max-w-4xl space-y-6 pb-6">
              <div className="rounded-3xl border border-white/10 p-6 shadow-[0_20px_40px_rgba(0,0,0,0.35)]">
                {history}
              </div>
            </div>
          </div>
          {composer ? (
            <div className="border-t border-white/10 px-8 py-4 backdrop-blur">
              <div className="mx-auto w-full max-w-4xl">{composer}</div>
            </div>
          ) : null}
          <footer className="flex h-12 items-center justify-between border-t border-white/10 px-6 text-xs text-slate-400 backdrop-blur">
            <span>v0.1.0</span>
            <span>{footerNote ?? 'Built with ❤️ for job seekers'}</span>
          </footer>
        </div>
      </div>

      <aside className="hidden w-20 flex-col items-center justify-between border-l border-white/10 py-6 text-slate-200 backdrop-blur-xl md:flex">
        <div className="flex flex-col items-center gap-6">
          {avatar ? (
            <img
              src={avatar.src}
              alt={avatar.alt}
              className="h-11 w-11 rounded-2xl border-2 border-[#00f0ff]/40 shadow-[0_10px_25px_rgba(0,240,255,0.25)]"
            />
          ) : (
            <div className="h-11 w-11 rounded-2xl border border-white/10 shadow-sm" />
          )}
          <div className="flex flex-col items-center gap-4 text-[10px] font-medium uppercase tracking-wide text-slate-400">
            {navItems.map(({ key, icon: Icon, label, onClick, active, highlight }) => (
              <button
                key={key}
                type="button"
                onClick={onClick}
                className={`flex flex-col items-center gap-1 focus:outline-none ${
                  highlight ? 'text-[#00f0ff]' : 'text-slate-400 hover:text-[#00f0ff]'
                }`}
              >
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl border shadow-sm transition hover:scale-105 hover:border-[#00f0ff]/40 ${
                    active ? 'border-[#00f0ff]/40 text-[#00f0ff]' : 'border-white/10'
                  }`}
                  style={
                    highlight
                      ? {
                          boxShadow: '0 0 16px rgba(0,240,255,0.35)',
                        }
                      : undefined
                  }
                >
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </div>
                <span>{label}</span>
              </button>
            ))}
          </div>
          {secondaryNavItems?.length ? (
            <div className="mt-4 flex flex-col items-center gap-3 text-[10px] font-medium uppercase tracking-wide text-slate-400">
              {secondaryNavItems.map(({ key, icon: Icon, label, onClick, active, highlight }) => (
                <button
                  key={key}
                  type="button"
                  onClick={onClick}
                  className={`flex flex-col items-center gap-1 focus:outline-none ${
                    highlight ? 'text-[#00f0ff]' : 'text-slate-400 hover:text-[#00f0ff]'
                  }`}
                >
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl border shadow-sm transition hover:scale-105 hover:border-[#00f0ff]/40 ${
                      active ? 'border-[#00f0ff]/40 text-[#00f0ff]' : 'border-white/10'
                    }`}
                    style={
                      highlight
                        ? {
                            boxShadow: '0 0 16px rgba(0,240,255,0.35)',
                          }
                        : undefined
                    }
                  >
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </div>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div>{railFooter}</div>
      </aside>
    </div>
  );
}
