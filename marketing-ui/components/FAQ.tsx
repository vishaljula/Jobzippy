'use client';

import { useState } from 'react';

const faqs = [
  {
    question: 'Is this safe? Will job sites ban me?',
    answer:
      'JobZippy uses the same browser automation that you would use manually. We follow rate limits and best practices to ensure your account stays safe. We never violate terms of service.',
  },
  {
    question: 'Do you read my emails?',
    answer:
      'No. We only access email metadata (sender, subject, date) to match emails to job applications. We never read email content. Your privacy is our priority.',
  },
  {
    question: 'Is it allowed for OPT / H-1B?',
    answer:
      'Yes! JobZippy is a tool to help you find and apply to jobs more efficiently. It does not change the nature of your job search or applications. Many OPT and H-1B holders use similar tools.',
  },
  {
    question: 'Which job boards do you support?',
    answer:
      'We currently support LinkedIn and Indeed, with more platforms coming soon. Our goal is to cover all major job boards.',
  },
  {
    question: 'Can I cancel anytime?',
    answer:
      'Absolutely. You can cancel your subscription at any time with no questions asked. No long-term contracts or commitments.',
  },
  {
    question: 'When is launch?',
    answer:
      'We\'re targeting a beta launch in Q2 2024. Join the waitlist to be notified when we go live and get early access!',
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section
      id="faq"
      className="py-24 px-4 sm:px-6 lg:px-8 bg-slate-50"
    >
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-20">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 mb-6">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg transition-shadow"
            >
              <button
                onClick={() =>
                  setOpenIndex(openIndex === index ? null : index)
                }
                className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <span className="font-semibold text-slate-900 text-lg">
                  {faq.question}
                </span>
                <svg
                  className={`w-5 h-5 text-slate-500 transition-transform ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {openIndex === index && (
                <div className="px-6 pb-4 text-slate-600 leading-relaxed animate-fade-in">
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

