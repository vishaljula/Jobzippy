import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="py-12 border-t border-white/5 bg-black/20">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-neon-blue to-neon-purple flex items-center justify-center text-white font-bold text-xs">
            J
          </div>
          <span className="font-bold text-white">JobZippy</span>
        </div>

        <div className="text-slate-500 text-sm">
          © 2025 JobZippy — Operated by MoneyMic LLC
        </div>

        <div className="flex gap-6 text-sm text-slate-400">
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
          <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
        </div>
      </div>
    </footer>
  );
}
