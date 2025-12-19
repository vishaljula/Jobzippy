/**
 * Unit Tests for Page Classifier
 * Tests the classification logic with various HTML structures
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { classifyPage, isSimpleCaptcha } from '../page-classifier';

describe('Page Classifier', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('Form Detection', () => {
    it('should detect a complete application form', () => {
      const form = document.createElement('form');

      const firstName = document.createElement('input');
      firstName.type = 'text';
      firstName.setAttribute('autocomplete', 'given-name');

      const lastName = document.createElement('input');
      lastName.type = 'text';
      lastName.setAttribute('autocomplete', 'family-name');

      const email = document.createElement('input');
      email.type = 'email';

      const resume = document.createElement('input');
      resume.type = 'file';
      resume.setAttribute('accept', '.pdf');

      form.appendChild(firstName);
      form.appendChild(lastName);
      form.appendChild(email);
      form.appendChild(resume);
      document.body.appendChild(form);

      const classification = classifyPage(document);

      expect(classification.type).toBe('form');
      expect(classification.confidence).toBeGreaterThan(0.7);
      expect(classification.fields.length).toBeGreaterThan(0);
    });
  });

  describe('CAPTCHA Detection', () => {
    it('should detect simple checkbox CAPTCHA', () => {
      const form = document.createElement('form');

      const captcha = document.createElement('input');
      captcha.type = 'checkbox';
      captcha.id = 'recaptcha';

      form.appendChild(captcha);
      document.body.appendChild(form);

      const classification = classifyPage(document);

      expect(isSimpleCaptcha(classification)).toBe(true);
    });
  });

  describe('Confidence Scoring', () => {
    it('should have high confidence for clear form', () => {
      const form = document.createElement('form');

      ['given-name', 'family-name', 'email', 'tel'].forEach((autocomplete) => {
        const input = document.createElement('input');
        input.setAttribute('autocomplete', autocomplete);
        form.appendChild(input);
      });

      const resume = document.createElement('input');
      resume.type = 'file';
      resume.setAttribute('accept', '.pdf');
      form.appendChild(resume);

      document.body.appendChild(form);

      const classification = classifyPage(document);

      expect(classification.confidence).toBeGreaterThan(0.8);
    });
  });
});
