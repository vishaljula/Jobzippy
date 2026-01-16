import Link from 'next/link';
import Logo from '@/components/Logo';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#020617] text-white">
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <Logo size="md" />
            <span className="text-xl font-bold">JobZippy</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-slate-500 mb-12">Last updated: January 16, 2026</p>

        <div className="prose prose-invert prose-slate max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">1. Introduction</h2>
            <p className="text-slate-300 leading-relaxed">
              JobZippy (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is operated by MoneyMic LLC. This Privacy Policy 
              explains how we collect, use, disclose, and safeguard your information when you use our 
              Chrome extension and related services. Please read this privacy policy carefully.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">2. Information We Collect</h2>
            
            <h3 className="text-xl font-medium text-white mt-6 mb-3">2.1 Information You Provide</h3>
            <ul className="list-disc list-inside text-slate-300 space-y-2">
              <li>Account information (email address via Google Sign-In)</li>
              <li>Resume and professional information you upload</li>
              <li>Job search preferences (target roles, locations, experience level)</li>
              <li>Payment information (processed securely by Stripe)</li>
            </ul>

            <h3 className="text-xl font-medium text-white mt-6 mb-3">2.2 Information Collected Automatically</h3>
            <ul className="list-disc list-inside text-slate-300 space-y-2">
              <li>Application submission history and status</li>
              <li>Extension usage analytics</li>
              <li>Error logs for troubleshooting</li>
            </ul>

            <h3 className="text-xl font-medium text-white mt-6 mb-3">2.3 Information NOT Collected</h3>
            <ul className="list-disc list-inside text-slate-300 space-y-2">
              <li>Your LinkedIn login credentials (we never see or store these)</li>
              <li>Browsing history outside of job application contexts</li>
              <li>Personal files beyond your uploaded resume</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">3. How We Use Your Information</h2>
            <ul className="list-disc list-inside text-slate-300 space-y-2">
              <li>To automate job applications on your behalf</li>
              <li>To pre-fill application forms with your information</li>
              <li>To track and log your applications to Google Sheets</li>
              <li>To process payments and manage your subscription</li>
              <li>To send email notifications about your applications</li>
              <li>To improve our services and fix bugs</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">4. Data Storage & Security</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              Your data security is our priority:
            </p>
            <ul className="list-disc list-inside text-slate-300 space-y-2">
              <li><strong className="text-white">Local Storage:</strong> Your resume and personal information are stored locally in your browser using encrypted IndexedDB. This data never leaves your device unless you explicitly submit an application.</li>
              <li><strong className="text-white">Cloud Storage:</strong> Only your account email, subscription status, and application history are stored in our secure Firebase database.</li>
              <li><strong className="text-white">Encryption:</strong> All data in transit uses TLS encryption. Local data is encrypted using AES-GCM.</li>
              <li><strong className="text-white">Payment Security:</strong> Payment information is handled entirely by Stripe and never touches our servers.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">5. Third-Party Services</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              We use the following third-party services:
            </p>
            <ul className="list-disc list-inside text-slate-300 space-y-2">
              <li><strong className="text-white">Google Sign-In:</strong> For authentication</li>
              <li><strong className="text-white">Google Sheets API:</strong> To log your applications (with your permission)</li>
              <li><strong className="text-white">Stripe:</strong> For payment processing</li>
              <li><strong className="text-white">Firebase:</strong> For account and subscription management</li>
            </ul>
            <p className="text-slate-300 leading-relaxed mt-4">
              Each service has its own privacy policy, and we encourage you to review them.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">6. Data Sharing</h2>
            <p className="text-slate-300 leading-relaxed">
              We do <strong className="text-white">NOT</strong> sell, trade, or rent your personal information to third parties. 
              Your data is only shared when:
            </p>
            <ul className="list-disc list-inside text-slate-300 space-y-2 mt-4">
              <li>You submit a job application (data goes to the employer&apos;s ATS)</li>
              <li>Required by law or to protect our rights</li>
              <li>With service providers who help operate our service (under strict confidentiality)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">7. Your Rights</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              You have the right to:
            </p>
            <ul className="list-disc list-inside text-slate-300 space-y-2">
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Delete your data (uninstalling the extension removes all local data)</li>
              <li>Export your data</li>
              <li>Cancel your subscription at any time</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">8. Children&apos;s Privacy</h2>
            <p className="text-slate-300 leading-relaxed">
              JobZippy is not intended for users under 18 years of age. We do not knowingly collect 
              information from children under 18.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">9. Changes to This Policy</h2>
            <p className="text-slate-300 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any changes 
              by posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">10. Contact Us</h2>
            <p className="text-slate-300 leading-relaxed">
              If you have any questions about this Privacy Policy, please contact us at:
            </p>
            <p className="text-neon-green mt-4">
              <a href="mailto:support@jobzippy.ai" className="hover:underline">support@jobzippy.ai</a>
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 mt-16">
        <div className="max-w-4xl mx-auto px-6 text-center text-slate-500 text-sm">
          <p>© 2026 JobZippy. All rights reserved.</p>
          <div className="flex justify-center gap-6 mt-4">
            <Link href="/privacy" className="text-neon-green">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition">Terms</Link>
            <a href="mailto:support@jobzippy.ai" className="hover:text-white transition">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

