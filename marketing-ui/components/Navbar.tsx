import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import Logo from './Logo';

// TODO: Replace with actual Chrome Web Store URL once published
const CHROME_STORE_URL = 'https://chromewebstore.google.com/detail/jobzippy';

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <Logo size="md" className="group-hover:scale-110 transition-transform duration-300" />
          <span className="text-xl font-bold tracking-tight text-white group-hover:text-neon-green transition-colors">
            JobZippy
          </span>
        </Link>

        {/* Navigation Links */}
        <div className="hidden md:flex items-center gap-8">
          {['Features', 'Pricing'].map((item) => (
            <Link
              key={item}
              href={`#${item.toLowerCase()}`}
              className="text-sm font-medium text-slate-400 hover:text-white transition-colors relative group"
            >
              {item}
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-neon-green group-hover:w-full transition-all duration-300" />
            </Link>
          ))}
        </div>

        {/* CTA Button */}
        <div className="flex items-center gap-4">
          <Link
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative px-6 py-2.5 rounded-full bg-gradient-to-r from-neon-green/20 to-neon-blue/20 hover:from-neon-green/30 hover:to-neon-blue/30 border border-neon-green/30 transition-all duration-300 overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-neon-green/10 to-neon-blue/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <span className="relative flex items-center gap-2 text-sm font-semibold text-white">
              Get Started
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
