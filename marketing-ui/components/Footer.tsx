import Link from 'next/link';
import Logo from './Logo';

export default function Footer() {
  return (
    <footer className="py-12 border-t border-white/5 bg-black/20">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2 group">
          <Logo size="sm" className="group-hover:scale-110 transition-transform duration-300" />
          <span className="font-bold text-white group-hover:text-neon-green transition-colors">
            JobZippy
          </span>
        </Link>

        <div className="text-slate-500 text-sm">© 2026 JobZippy — Operated by MoneyMic LLC</div>

        <div className="flex gap-6 text-sm text-slate-400">
          <Link href="/privacy" className="hover:text-white transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-white transition-colors">
            Terms
          </Link>
          <a href="mailto:support@jobzippy.ai" className="hover:text-white transition-colors">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
