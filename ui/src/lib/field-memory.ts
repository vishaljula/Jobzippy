/**
 * Field Memory
 *
 * Learns from user corrections to LLM-filled form fields.
 * Stores corrections keyed by a stable "field signature" so the same question
 * on multiple sites (or with slightly different phrasing) maps to the same entry.
 *
 * Storage: chrome.storage.local (local-first, no encryption needed — it's user-editable text)
 * Cap: 500 entries, LRU eviction
 *
 * NEVER saved:
 *   - Narrative answers ("Why do you want to work here?", "Describe a challenge")
 *   - Cover letters
 *   - Salary/start date (job-specific)
 */

// ============================================================================
// Types
// ============================================================================

export interface FieldMemoryEntry {
  answer: string;
  lastUsed: number; // Unix ms, for LRU eviction
}

export type FieldMemoryStore = Record<string, FieldMemoryEntry>; // key = signature

// ============================================================================
// Constants
// ============================================================================

const FIELD_MEMORY_STORAGE_KEY = 'field_memory';
const FIELD_MEMORY_CAP = 500;

// Narrative trigger words — questions matching these are never saved
const NARRATIVE_TRIGGERS = [
  'why',
  'describe',
  'tell us',
  'tell me',
  'explain',
  'elaborate',
  'strength',
  'weakness',
  'challenge',
  'passion',
  'story',
  'example',
  'accomplishment',
  'achievement',
  'motivated',
  'motivate',
  'yourself',
  'background',
  'interest in',
  'interested in',
  'about you',
  'proud of',
  'difficult',
  'obstacle',
  'situation where',
  'time when',
  'time you',
];

// ============================================================================
// Narrative Detection
// ============================================================================

/**
 * Returns true if this question is a "one-off narrative" field that should
 * never be cached — always LLM-generated fresh per job.
 */
export function isNarrativeField(questionText: string, inputType: string): boolean {
  // Textareas are the primary narrative signal
  const isLongForm = inputType === 'textarea';

  const lowerQuestion = questionText.toLowerCase();

  const hasNarrativeTrigger = NARRATIVE_TRIGGERS.some((trigger) => lowerQuestion.includes(trigger));

  // A textarea with a narrative trigger is definitely narrative
  if (isLongForm && hasNarrativeTrigger) return true;

  // Even text inputs can be narrative if they contain strong triggers
  if (
    hasNarrativeTrigger &&
    (lowerQuestion.includes('please') ||
      lowerQuestion.includes('provide') ||
      lowerQuestion.includes('share') ||
      lowerQuestion.length > 80) // Long questions are likely narrative
  ) {
    return true;
  }

  return false;
}

// ============================================================================
// Field Signature
// ============================================================================

/**
 * Creates a stable signature for a form field to use as a storage key.
 * Domain is intentionally excluded so corrections learned on one ATS platform
 * also apply on another for the same semantic question.
 *
 * Format: "{normalizedLabel}::{inputType}"
 * e.g. "years of python experience::number"
 */
export function makeFieldSignature(questionText: string, inputType: string): string {
  const normalized = questionText
    .toLowerCase()
    .replace(/[*\-–—()[\]{}?!.,;:'"]/g, ' ') // strip punctuation
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim()
    .substring(0, 100); // cap length

  return `${normalized}::${inputType}`;
}

// ============================================================================
// Storage Access (routed through background to avoid CORS / context limits)
// ============================================================================

const isContentScript =
  typeof chrome !== 'undefined' && chrome.runtime && !chrome.runtime.getBackgroundPage;

/**
 * Look up a stored correction for a field signature.
 * Returns null if no correction has been saved.
 */
export async function getFieldMemory(signature: string): Promise<string | null> {
  try {
    if (isContentScript) {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_FIELD_MEMORY',
        data: { signature },
      });
      if (response?.status === 'success' && response.answer != null) {
        return response.answer as string;
      }
      return null;
    }

    // Direct access in background/sidepanel
    const result = await chrome.storage.local.get(FIELD_MEMORY_STORAGE_KEY);
    const store = (result[FIELD_MEMORY_STORAGE_KEY] || {}) as FieldMemoryStore;
    const entry = store[signature];
    if (!entry) return null;

    // Update lastUsed for LRU
    entry.lastUsed = Date.now();
    await chrome.storage.local.set({ [FIELD_MEMORY_STORAGE_KEY]: store });

    return entry.answer;
  } catch (error) {
    console.error('[FieldMemory] getFieldMemory error:', error);
    return null;
  }
}

/**
 * Save a user correction for a field signature.
 * Handles LRU eviction if cap is reached.
 */
export async function saveFieldMemory(signature: string, answer: string): Promise<void> {
  try {
    if (isContentScript) {
      await chrome.runtime.sendMessage({
        type: 'SAVE_FIELD_MEMORY',
        data: { signature, answer },
      });
      return;
    }

    // Direct access in background/sidepanel
    await saveFieldMemoryDirect(signature, answer);
  } catch (error) {
    console.error('[FieldMemory] saveFieldMemory error:', error);
  }
}

/**
 * Direct save (for use in background script).
 */
export async function saveFieldMemoryDirect(signature: string, answer: string): Promise<void> {
  const result = await chrome.storage.local.get(FIELD_MEMORY_STORAGE_KEY);
  const store = (result[FIELD_MEMORY_STORAGE_KEY] || {}) as FieldMemoryStore;

  store[signature] = { answer, lastUsed: Date.now() };

  // LRU eviction if over cap
  const keys = Object.keys(store);
  if (keys.length > FIELD_MEMORY_CAP) {
    // Sort by lastUsed ascending, remove oldest
    const sorted = keys.sort((a, b) => (store[a]?.lastUsed ?? 0) - (store[b]?.lastUsed ?? 0));
    const toRemove = sorted.slice(0, keys.length - FIELD_MEMORY_CAP);
    for (const key of toRemove) {
      delete store[key];
    }
    console.log(`[FieldMemory] Evicted ${toRemove.length} LRU entries`);
  }

  await chrome.storage.local.set({ [FIELD_MEMORY_STORAGE_KEY]: store });
}
