import { describe, it, expect } from 'vitest';
import { generateCodeVerifier, generateCodeChallenge, generateState } from './pkce';

describe('PKCE Utilities', () => {
  describe('generateCodeVerifier', () => {
    it('generates a code verifier', () => {
      const verifier = generateCodeVerifier();
      expect(verifier).toBeTruthy();
      expect(typeof verifier).toBe('string');
    });

    it('generates different verifiers each time', () => {
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();
      expect(verifier1).not.toBe(verifier2);
    });

    it('generates verifier of correct length (base64url encoded 32 bytes)', () => {
      const verifier = generateCodeVerifier();
      // 32 bytes = 43 base64url characters (without padding)
      expect(verifier.length).toBe(43);
    });

    it('generates verifier with base64url characters only', () => {
      const verifier = generateCodeVerifier();
      // Should only contain base64url characters: A-Z, a-z, 0-9, -, _
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('generateCodeChallenge', () => {
    it('generates a code challenge from verifier', async () => {
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);
      expect(challenge).toBeTruthy();
      expect(typeof challenge).toBe('string');
    });

    it('generates same challenge for same verifier', async () => {
      const verifier = 'test-verifier-123';
      const challenge1 = await generateCodeChallenge(verifier);
      const challenge2 = await generateCodeChallenge(verifier);
      expect(challenge1).toBe(challenge2);
    });

    it('generates different challenges for different verifiers', async () => {
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();
      const challenge1 = await generateCodeChallenge(verifier1);
      const challenge2 = await generateCodeChallenge(verifier2);
      expect(challenge1).not.toBe(challenge2);
    });

    it('generates challenge with base64url characters only', async () => {
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('generateState', () => {
    it('generates a state parameter', () => {
      const state = generateState();
      expect(state).toBeTruthy();
      expect(typeof state).toBe('string');
    });

    it('generates different states each time', () => {
      const state1 = generateState();
      const state2 = generateState();
      expect(state1).not.toBe(state2);
    });

    it('generates state with base64url characters only', () => {
      const state = generateState();
      expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });
});
