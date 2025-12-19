'use client';

import { useState } from 'react';

interface WaitlistFormProps {
  onSuccess: () => void;
}

export default function WaitlistForm({ onSuccess }: WaitlistFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    visaStatus: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }
    if (!formData.visaStatus) {
      newErrors.visaStatus = 'Please select your visa status';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      // Placeholder API call
      const response = await fetch('/api/placeholder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        onSuccess();
        // Reset form
        setFormData({ name: '', email: '', visaStatus: '' });
        setErrors({});
      } else {
        setErrors({ submit: 'Something went wrong. Please try again.' });
      }
    } catch (error) {
      setErrors({ submit: 'Something went wrong. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          Name
        </label>
        <input
          type="text"
          id="name"
          value={formData.name}
          onChange={(e) =>
            setFormData({ ...formData, name: e.target.value })
          }
          className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
            errors.name
              ? 'border-red-300 focus:ring-red-500'
              : 'border-slate-300 focus:ring-primary-500'
          }`}
          placeholder="John Doe"
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-600">{errors.name}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          Email
        </label>
        <input
          type="email"
          id="email"
          value={formData.email}
          onChange={(e) =>
            setFormData({ ...formData, email: e.target.value })
          }
          className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
            errors.email
              ? 'border-red-300 focus:ring-red-500'
              : 'border-slate-300 focus:ring-primary-500'
          }`}
          placeholder="john@example.com"
        />
        {errors.email && (
          <p className="mt-1 text-sm text-red-600">{errors.email}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="visaStatus"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          Are you on OPT/H-1B?
        </label>
        <select
          id="visaStatus"
          value={formData.visaStatus}
          onChange={(e) =>
            setFormData({ ...formData, visaStatus: e.target.value })
          }
          className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
            errors.visaStatus
              ? 'border-red-300 focus:ring-red-500'
              : 'border-slate-300 focus:ring-primary-500'
          }`}
        >
          <option value="">Select...</option>
          <option value="opt">Yes, OPT</option>
          <option value="h1b">Yes, H-1B</option>
          <option value="no">No</option>
        </select>
        {errors.visaStatus && (
          <p className="mt-1 text-sm text-red-600">{errors.visaStatus}</p>
        )}
      </div>

      {errors.submit && (
        <p className="text-sm text-red-600">{errors.submit}</p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full px-6 py-3 bg-gradient-to-r from-primary-500 to-secondary-500 text-white rounded-lg font-semibold hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'Submitting...' : 'Join waitlist'}
      </button>
    </form>
  );
}

