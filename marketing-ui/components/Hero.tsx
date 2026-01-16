'use client';

import { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

// TODO: Replace with actual Chrome Web Store URL once published
const CHROME_STORE_URL = 'https://chromewebstore.google.com/detail/jobzippy';

export default function Hero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;

    canvas.width = width;
    canvas.height = height;

    const particles: Particle[] = [];
    const particleCount = 100;

    class Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;

      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.size = Math.random() * 2;
        // Use neon green and purple from our theme
        this.color = Math.random() > 0.5 ? '#34FFD9' : '#C44BFF';
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0 || this.x > width) this.vx *= -1;
        if (this.y < 0 || this.y > height) this.vy *= -1;
      }

      draw() {
        if (!ctx) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.globalAlpha = 0.5;
        ctx.fill();
      }
    }

    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }

    function animate() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      particles.forEach((particle) => {
        particle.update();
        particle.draw();
      });

      // Draw connections
      particles.forEach((p1, i) => {
        particles.slice(i + 1).forEach((p2) => {
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 150) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(52, 255, 217, ${0.1 - distance / 1500})`;
            ctx.stroke();
          }
        });
      });

      requestAnimationFrame(animate);
    }

    animate();

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center pt-20 overflow-hidden">
      {/* Particle Background */}
      <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none" />

      {/* Subtle center glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-white/[0.02] blur-[100px] rounded-full pointer-events-none" />

      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        {/* Headline */}
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8 animate-fade-in-up">
          Skill Isn&apos;t the Problem. <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-green to-neon-purple text-glow">
            Visibility Is.
          </span>
        </h1>

        {/* Subtext */}
        <p className="text-xl text-slate-400 mb-12 max-w-2xl mx-auto leading-relaxed animate-fade-in-up [animation-delay:200ms]">
          JobZippy applies to jobs on LinkedIn{' '}
          <span className="text-white font-semibold">10× faster</span>, automatically. Stop filling
          forms. Start interviewing.
        </p>

        {/* Single CTA Button */}
        <div className="flex justify-center animate-fade-in-up [animation-delay:400ms]">
          <Link
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative px-10 py-5 rounded-full bg-gradient-to-r from-neon-green to-neon-blue text-black font-bold text-lg transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(52,255,217,0.4)] overflow-hidden"
          >
            <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-20 transition-opacity duration-300" />
            <span className="relative flex items-center gap-2">
              Start Free Trial
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </span>
          </Link>
        </div>

        {/* Trial info */}
        <p className="mt-6 text-sm text-slate-500 animate-fade-in-up [animation-delay:600ms]">
          3-day free trial • $9.99/month • Cancel anytime
        </p>
      </div>
    </section>
  );
}
