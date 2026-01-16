import Link from 'next/link';
import Logo from '@/components/Logo';

export default function TermsPage() {
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
        <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
        <p className="text-slate-500 mb-12">Last updated: January 16, 2026</p>

        <div className="prose prose-invert prose-slate max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">1. Acceptance of Terms</h2>
            <p className="text-slate-300 leading-relaxed">
              By installing or using JobZippy (&quot;the Service&quot;), operated by MoneyMic LLC, you agree 
              to be bound by these Terms of Service. If you do not agree to these terms, do not use 
              the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">2. Description of Service</h2>
            <p className="text-slate-300 leading-relaxed">
              JobZippy is a Chrome browser extension that automates the job application process on 
              LinkedIn and other job platforms. The Service fills out application forms using 
              information you provide and submits applications on your behalf.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">3. User Responsibilities</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              By using JobZippy, you agree to:
            </p>
            <ul className="list-disc list-inside text-slate-300 space-y-2">
              <li>Provide accurate and truthful information in your profile and resume</li>
              <li>Use the Service only for legitimate job seeking purposes</li>
              <li>Comply with LinkedIn&apos;s and other platforms&apos; terms of service</li>
              <li>Not use the Service for any illegal or unauthorized purpose</li>
              <li>Not attempt to reverse engineer, modify, or redistribute the Service</li>
              <li>Maintain the security of your account credentials</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">4. Subscription & Payments</h2>
            
            <h3 className="text-xl font-medium text-white mt-6 mb-3">4.1 Free Trial</h3>
            <p className="text-slate-300 leading-relaxed">
              New users receive a 3-day free trial. A valid payment method is required to start the trial. 
              You will be charged automatically after the trial period unless you cancel.
            </p>

            <h3 className="text-xl font-medium text-white mt-6 mb-3">4.2 Subscription</h3>
            <p className="text-slate-300 leading-relaxed">
              The Service is billed monthly at $9.99/month. Your subscription will automatically renew 
              unless cancelled before the renewal date.
            </p>

            <h3 className="text-xl font-medium text-white mt-6 mb-3">4.3 Cancellation</h3>
            <p className="text-slate-300 leading-relaxed">
              You may cancel your subscription at any time. Upon cancellation, you will retain access 
              until the end of your current billing period. No refunds are provided for partial months.
            </p>

            <h3 className="text-xl font-medium text-white mt-6 mb-3">4.4 Application Limits</h3>
            <p className="text-slate-300 leading-relaxed">
              The Basic plan includes up to 300 job applications per month. Unused applications do not 
              roll over to the next month.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">5. Disclaimers</h2>
            
            <h3 className="text-xl font-medium text-white mt-6 mb-3">5.1 No Guarantee of Employment</h3>
            <p className="text-slate-300 leading-relaxed">
              JobZippy is a tool to assist with job applications. We do not guarantee that you will 
              receive interviews, job offers, or employment as a result of using our Service.
            </p>

            <h3 className="text-xl font-medium text-white mt-6 mb-3">5.2 Third-Party Platforms</h3>
            <p className="text-slate-300 leading-relaxed">
              JobZippy interacts with third-party platforms (LinkedIn, employer ATS systems, etc.). 
              We are not responsible for changes to these platforms that may affect the Service&apos;s 
              functionality. We do not guarantee compatibility with all job posting platforms or ATS systems.
            </p>

            <h3 className="text-xl font-medium text-white mt-6 mb-3">5.3 Service Availability</h3>
            <p className="text-slate-300 leading-relaxed">
              The Service is provided &quot;as is&quot; without warranties of any kind. We do not guarantee 
              uninterrupted or error-free operation. We reserve the right to modify, suspend, or 
              discontinue the Service at any time.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">6. Limitation of Liability</h2>
            <p className="text-slate-300 leading-relaxed">
              To the maximum extent permitted by law, MoneyMic LLC and its affiliates shall not be 
              liable for any indirect, incidental, special, consequential, or punitive damages, 
              including but not limited to:
            </p>
            <ul className="list-disc list-inside text-slate-300 space-y-2 mt-4">
              <li>Loss of employment opportunities</li>
              <li>Account suspensions on third-party platforms</li>
              <li>Incorrect information submitted in applications</li>
              <li>Data loss or security breaches beyond our reasonable control</li>
            </ul>
            <p className="text-slate-300 leading-relaxed mt-4">
              Our total liability shall not exceed the amount you paid for the Service in the 
              preceding 12 months.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">7. Intellectual Property</h2>
            <p className="text-slate-300 leading-relaxed">
              The Service, including its code, design, logos, and content, is owned by MoneyMic LLC 
              and protected by copyright and other intellectual property laws. You may not copy, 
              modify, distribute, or create derivative works without our written permission.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">8. Account Termination</h2>
            <p className="text-slate-300 leading-relaxed">
              We reserve the right to suspend or terminate your account if you:
            </p>
            <ul className="list-disc list-inside text-slate-300 space-y-2 mt-4">
              <li>Violate these Terms of Service</li>
              <li>Engage in fraudulent or abusive behavior</li>
              <li>Use the Service in a way that harms other users or third parties</li>
              <li>Fail to pay subscription fees</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">9. Governing Law</h2>
            <p className="text-slate-300 leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of the 
              State of Delaware, United States, without regard to its conflict of law provisions.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">10. Changes to Terms</h2>
            <p className="text-slate-300 leading-relaxed">
              We may modify these Terms at any time. We will notify you of significant changes via 
              email or through the Service. Continued use of the Service after changes constitutes 
              acceptance of the new Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">11. Contact Us</h2>
            <p className="text-slate-300 leading-relaxed">
              If you have any questions about these Terms of Service, please contact us at:
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
            <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
            <Link href="/terms" className="text-neon-green">Terms</Link>
            <a href="mailto:support@jobzippy.ai" className="hover:text-white transition">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

