import { MessageCircle, LogOut, BarChart3, Shield, Bell } from 'lucide-react';
import { LayoutShell } from './LayoutShell';

const PLACEHOLDER_MESSAGES = Array.from({ length: 20 }).map((_, index) => ({
  id: `msg-${index}`,
  sender: index % 2 === 0 ? 'assistant' : 'user',
  timestamp: `7:${index.toString().padStart(2, '0')} AM`,
  content:
    index % 2 === 0
      ? 'Here’s a preview placeholder response from the assistant. We will stream real content once the Intake Agent is wired up.'
      : 'Sounds good—let me know what you need next!',
}));

export function NewLayoutPreview({ onExit }: { onExit: () => void }) {
  const history = (
    <div className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur">
      <div className="space-y-4">
        {PLACEHOLDER_MESSAGES.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.sender === 'assistant' ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-[70%] rounded-3xl border px-4 py-3 shadow-sm ${
                message.sender === 'assistant'
                  ? 'border-slate-200 bg-white text-slate-700'
                  : 'border-indigo-200 bg-gradient-to-r from-indigo-500 to-purple-500 text-white'
              }`}
            >
              <p className="text-sm leading-relaxed">{message.content}</p>
              <span className="mt-2 block text-[10px] uppercase tracking-wide opacity-60">
                {message.timestamp}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const composer = (
    <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-md">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
          <MessageCircle className="h-5 w-5" />
        </div>
        <textarea
          className="min-h-[60px] flex-1 resize-none border-none bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-0"
          placeholder="Ask anything or paste a job note..."
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">
          Commands · Attach resumes · Slash actions
        </span>
        <button
          type="button"
          className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-purple-600"
        >
          Send
        </button>
      </div>
    </div>
  );

  return (
    <LayoutShell
      title="Jobzippy Intake Agent"
      subtitle="Preview layout · Fixed chrome · Scrollable transcript"
      statusLabel={<span className="text-slate-500">Preview mode</span>}
      headerActions={
        <button
          type="button"
          onClick={onExit}
          className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
        >
          Back to current UI
        </button>
      }
      history={history}
      composer={composer}
      navItems={[
        { key: 'insights', icon: BarChart3, label: 'Insights' },
        { key: 'vault', icon: Shield, label: 'Vault' },
        { key: 'alerts', icon: Bell, label: 'Alerts' },
      ]}
      avatar={null}
      railFooter={
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-400 shadow-sm transition hover:text-slate-700"
        >
          <LogOut className="h-4 w-4" />
        </button>
      }
      footerNote="Built with ❤️ for job seekers"
    />
  );
}
