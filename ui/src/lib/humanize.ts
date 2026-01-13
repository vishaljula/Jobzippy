/**
 * Humanize - Anti-detection layer for job application automation
 *
 * Goals: "Human-ish + resilient", not "undetectable"
 * - Random delays between actions
 * - Character-by-character typing with natural pauses
 * - Proper focus→type→blur event sequences
 */

// ============================================================================
// TIMING UTILITIES
// ============================================================================

/**
 * Random delay between min and max milliseconds
 * @param min Minimum delay in ms (default 800)
 * @param max Maximum delay in ms (default 1500)
 */
export async function jitter(min = 800, max = 1500): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  await new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Short jitter for between-keystroke pauses
 */
export async function microJitter(min = 30, max = 120): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  await new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Longer "think pause" for major step transitions (1-3s)
 */
export async function thinkPause(): Promise<void> {
  await jitter(1000, 3000);
}

// ============================================================================
// TYPING UTILITIES
// ============================================================================

/**
 * Type text character-by-character with human-like delays
 * Includes proper event sequence: focus → keydown → input → keyup → (optional blur)
 *
 * @param element Input/textarea element to type into
 * @param text Text to type
 * @param options Configuration options
 */
export async function humanType(
  element: HTMLInputElement | HTMLTextAreaElement,
  text: string,
  options: {
    clearFirst?: boolean; // Clear existing value before typing
    blurAfter?: boolean; // Dispatch blur event after typing
    minDelay?: number; // Min delay between keystrokes (ms)
    maxDelay?: number; // Max delay between keystrokes (ms)
  } = {}
): Promise<void> {
  const { clearFirst = true, blurAfter = true, minDelay = 30, maxDelay = 120 } = options;

  // Focus the element
  element.focus();
  element.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  await microJitter(50, 150); // Small pause after focus

  // Clear existing value if requested
  if (clearFirst) {
    element.value = '';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Type each character
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;

    // Dispatch keydown
    element.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: char,
        code: `Key${char.toUpperCase()}`,
        bubbles: true,
      })
    );

    // Add the character to value
    element.value += char;

    // Dispatch input event (React and other frameworks listen to this)
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: char,
      })
    );

    // Dispatch keyup
    element.dispatchEvent(
      new KeyboardEvent('keyup', {
        key: char,
        code: `Key${char.toUpperCase()}`,
        bubbles: true,
      })
    );

    // Random delay between keystrokes
    await microJitter(minDelay, maxDelay);

    // Occasionally add longer pause (simulates thinking/typo correction)
    if (Math.random() < 0.05) {
      // 5% chance
      await microJitter(200, 400);
    }
  }

  // Dispatch change event
  element.dispatchEvent(new Event('change', { bubbles: true }));

  // Optionally blur
  if (blurAfter) {
    await microJitter(100, 300); // Small pause before blur
    element.blur();
    element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  }
}

/**
 * Set value directly (for non-sensitive fields where human typing isn't needed)
 * Still dispatches proper events for React/Angular compatibility
 */
export async function setValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string | boolean
): Promise<void> {
  // Focus first
  element.focus();
  element.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  await microJitter(50, 150);

  // Set value
  if (element instanceof HTMLSelectElement) {
    element.value = String(value);
  } else if (element.type === 'checkbox' || element.type === 'radio') {
    (element as HTMLInputElement).checked = Boolean(value);
  } else {
    element.value = String(value);
  }

  // Dispatch events
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));

  // Blur
  await microJitter(100, 200);
  element.blur();
  element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}

// ============================================================================
// CLICK UTILITIES
// ============================================================================

/**
 * Click an element with proper event sequence
 * Dispatches: mouseover → mousedown → mouseup → click
 *
 * @param element Element to click
 * @param options Configuration options
 */
export async function humanClick(
  element: HTMLElement,
  options: {
    jitterBefore?: boolean; // Add random delay before click
    minJitter?: number;
    maxJitter?: number;
  } = {}
): Promise<void> {
  const { jitterBefore = true, minJitter = 800, maxJitter = 1500 } = options;

  // Optional jitter before click
  if (jitterBefore) {
    await jitter(minJitter, maxJitter);
  }

  // Get a slightly randomized click point (not always center)
  const rect = element.getBoundingClientRect();
  const offsetX = rect.width * (0.3 + Math.random() * 0.4); // 30-70% from left
  const offsetY = rect.height * (0.3 + Math.random() * 0.4); // 30-70% from top
  const clientX = rect.left + offsetX;
  const clientY = rect.top + offsetY;

  const eventOptions = {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    button: 0,
    view: window,
  };

  // Event sequence: mouseover → mousedown → mouseup → click
  element.dispatchEvent(new MouseEvent('mouseover', eventOptions));
  await microJitter(10, 30);

  element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
  await microJitter(50, 100); // Hold down briefly

  element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
  await microJitter(5, 15);

  // Try synthetic click first
  const clickEvent = new MouseEvent('click', eventOptions);
  const wasHandled = element.dispatchEvent(clickEvent);

  // Native fallback ONLY if synthetic was prevented (rare)
  // dispatchEvent returns false only if preventDefault() was called
  if (!wasHandled) {
    element.click();
  }
}

/**
 * Scroll element into view smoothly (if not already visible)
 */
export async function scrollIntoViewIfNeeded(element: HTMLElement): Promise<void> {
  const rect = element.getBoundingClientRect();
  const isInViewport =
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= window.innerHeight &&
    rect.right <= window.innerWidth;

  if (!isInViewport) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Wait for scroll to complete
    await jitter(300, 500);
  }
}

// ============================================================================
// SELECT/DROPDOWN UTILITIES
// ============================================================================

/**
 * Select an option from a dropdown with human-like behavior
 */
export async function humanSelect(select: HTMLSelectElement, value: string): Promise<boolean> {
  // Focus the select
  select.focus();
  select.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  await microJitter(100, 200);

  // Find and select the option
  const option = Array.from(select.options).find(
    (opt) => opt.value === value || opt.textContent?.toLowerCase().includes(value.toLowerCase())
  );

  if (!option) {
    return false;
  }

  select.value = option.value;
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));

  // Blur
  await microJitter(100, 200);
  select.blur();
  select.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

  return true;
}

/**
 * Handle custom dropdowns (React Select, etc.)
 * Opens dropdown, searches for option, clicks it
 */
export async function handleCustomDropdown(
  triggerElement: HTMLElement,
  searchText: string
): Promise<boolean> {
  // Click to open dropdown
  await humanClick(triggerElement, { jitterBefore: false });
  await jitter(300, 500); // Wait for dropdown to open

  // Look for options container
  const optionsContainer = document.querySelector(
    '[role="listbox"], [class*="dropdown"], [class*="menu"], [class*="options"]'
  );

  if (!optionsContainer) {
    return false;
  }

  // Find matching option
  const options = optionsContainer.querySelectorAll('[role="option"], [class*="option"], li');

  for (const option of Array.from(options)) {
    const text = option.textContent?.toLowerCase() || '';
    if (text.includes(searchText.toLowerCase())) {
      await humanClick(option as HTMLElement, {
        jitterBefore: true,
        minJitter: 200,
        maxJitter: 400,
      });
      return true;
    }
  }

  return false;
}

// ============================================================================
// CHECKBOX/RADIO UTILITIES
// ============================================================================

/**
 * Toggle a checkbox/radio with human-like behavior
 */
export async function humanToggle(input: HTMLInputElement, checked: boolean): Promise<void> {
  if (input.checked === checked) {
    return; // Already in desired state
  }

  // Click the input or its label
  const label = input.labels?.[0] || input.closest('label');
  const clickTarget = label || input;

  await humanClick(clickTarget as HTMLElement, { minJitter: 300, maxJitter: 600 });

  // Ensure state is correct
  if (input.checked !== checked) {
    input.checked = checked;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

// ============================================================================
// FILE INPUT UTILITIES
// ============================================================================

/**
 * Attach a file to a file input (can't simulate real file selection dialog)
 * This still uses DataTransfer API but adds appropriate events
 */
export async function attachFile(input: HTMLInputElement, file: File): Promise<void> {
  // Focus
  input.focus();
  await microJitter(100, 200);

  // Use DataTransfer API to set files
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  input.files = dataTransfer.files;

  // Dispatch events
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  // Blur
  await microJitter(100, 200);
  input.blur();
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Global humanize configuration
 * Can be modified at runtime to adjust behavior
 */
export const humanizeConfig = {
  /** Enable/disable all humanization (for testing) */
  enabled: true,

  /** Default jitter range */
  defaultJitterMin: 800,
  defaultJitterMax: 1500,

  /** Keystroke delay range */
  keystrokeDelayMin: 30,
  keystrokeDelayMax: 120,

  /** Whether to use human typing for all text inputs */
  useHumanTyping: true,
};

/**
 * Wrapper that respects humanizeConfig.enabled
 */
export async function maybeJitter(min?: number, max?: number): Promise<void> {
  if (!humanizeConfig.enabled) return;
  await jitter(min ?? humanizeConfig.defaultJitterMin, max ?? humanizeConfig.defaultJitterMax);
}
