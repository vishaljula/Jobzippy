import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import InteractiveDemo from '@/components/InteractiveDemo';
import FeatureGrid from '@/components/FeatureGrid';
import SocialProof from '@/components/SocialProof';
import Pricing from '@/components/Pricing';
import Footer from '@/components/Footer';

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <Navbar />
      <Hero />
      <InteractiveDemo />
      <FeatureGrid />
      <SocialProof />
      <Pricing />
      <Footer />
    </main>
  );
}

