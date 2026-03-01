/**
 * extractor/dom-elements.js
 *
 * Browser-side extraction script. Injected into the page via page.evaluate().
 * Finds all interactive form fields, stamps each with data-jz-id="jz-N",
 * and returns a structured array of element metadata.
 *
 * Usage (Node/Playwright):
 *   const code = fs.readFileSync('extractor/dom-elements.js', 'utf8');
 *   const elements = await page.evaluate(code);
 *
 * Returns: ExtractedElement[]
 */
(function extractFormElements() {
    let counter = 0;
    const elements = [];

    // ── Label resolution ────────────────────────────────────────────
    // Returns { text, source } where source identifies how the label was found.
    function getLabel(el) {
        // 1. aria-label
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel && ariaLabel.trim()) return { text: ariaLabel.trim(), source: 'aria-label' };

        // 2. aria-labelledby → resolve referenced element text
        const labelledBy = el.getAttribute('aria-labelledby');
        if (labelledBy) {
            const text = labelledBy.split(' ')
                .map(id => document.getElementById(id)?.textContent?.trim())
                .filter(Boolean)
                .join(' ');
            if (text) return { text, source: 'aria-labelledby' };
        }

        // 3. <label for="id">
        if (el.id) {
            const label = document.querySelector('label[for="' + el.id + '"]');
            if (label) {
                const clone = label.cloneNode(true);
                clone.querySelectorAll('input,select,textarea').forEach(e => e.remove());
                const text = clone.textContent.trim();
                if (text) return { text, source: 'for-attr' };
            }
        }

        // 4. Wrapping <label>
        const parentLabel = el.closest('label');
        if (parentLabel) {
            const clone = parentLabel.cloneNode(true);
            clone.querySelectorAll('input,select,textarea,button').forEach(e => e.remove());
            const text = clone.textContent.trim();
            if (text) return { text, source: 'parent-label' };
        }

        // 4b. Sibling div text — Workday hides native inputs and puts Yes/No text in a sibling div
        // e.g. <div><input type="radio"><span/><div>Yes</div></div>
        const parentEl = el.parentElement;
        if (parentEl) {
            for (const sib of Array.from(parentEl.children)) {
                if (sib === el) continue;
                if (sib.tagName === 'INPUT' || sib.tagName === 'BUTTON') continue;
                const t = (sib.textContent ?? '').trim();
                if (t && t.length >= 1 && t.length <= 50) return { text: t, source: 'sibling-div' };
            }
        }

        // 5. Preceding legend/label/title in parent or grandparent
        let currentParent = el.parentElement;
        for (let i = 0; i < 3 && currentParent; i++) {
            const prev = currentParent.querySelector('legend, label, [class*="label"], [class*="title"], [class*="heading"]');
            if (prev && prev !== el && !prev.contains(el)) {
                // Ignore if it's a generic UI string
                const text = prev.textContent.trim();
                // Ensure the label we found isn't actually just the placeholder mapped differently
                if (text && text.length < 100 && !text.toLowerCase().includes('start typing')) {
                    return { text, source: 'ancestor-sibling' };
                }
            }
            currentParent = currentParent.parentElement;
        }

        // 6. placeholder
        const placeholder = el.getAttribute('placeholder');
        if (placeholder && placeholder.trim()) return { text: placeholder.trim(), source: 'placeholder' };

        // 7. name attribute (humanized)
        const name = el.getAttribute('name');
        if (name) return { text: name.replace(/[_-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim(), source: 'name' };

        return { text: '(unlabelled)', source: 'none' };
    }

    // ── Action type classification ──────────────────────────────────
    function getActionType(el) {
        const tag = el.tagName.toLowerCase();
        const type = (el.getAttribute('type') || '').toLowerCase();
        const role = (el.getAttribute('role') || '').toLowerCase();

        if (tag === 'select') return 'select_option';
        if (tag === 'textarea') return 'input_text';
        if (type === 'checkbox') return 'click_checkbox';
        if (type === 'radio') return 'click_radio';
        if (type === 'file') return 'upload_file';

        if (role === 'combobox' || role === 'listbox' || el.hasAttribute('aria-haspopup')) return 'combobox';

        if (type === 'submit' || type === 'button') return 'click_button';
        if (tag === 'button') return 'click_button';
        if (role === 'checkbox') return 'click_checkbox';
        if (role === 'radio') return 'click_radio';
        if (role === 'textbox') return 'input_text';

        if (tag === 'input') {
            // Workday "selectinput" pattern — the input has data-uxi-element-id starting with "selectinput"
            // This is Workday's custom multiselect widget (e.g. "How Did You Hear About Us")
            const uxiId = el.getAttribute('data-uxi-element-id') || '';
            if (uxiId.startsWith('selectinput')) return 'combobox';

            // Workday: parent div has data-automation-hiddensearch attribute
            if (el.parentElement?.hasAttribute('data-automation-hiddensearch')) return 'combobox';

            // Generic: inside a [role="combobox"] ancestor
            if (el.closest('[role="combobox"]')) return 'combobox';

            // Generic: nearby button[aria-haspopup="listbox"]
            const parent = el.parentElement;
            if (parent) {
                const hasListboxTrigger =
                    parent.querySelector('button[aria-haspopup="listbox"], [aria-haspopup="listbox"]') ||
                    parent.parentElement?.querySelector('button[aria-haspopup="listbox"]');
                if (hasListboxTrigger) return 'combobox';
            }

            return 'input_text';
        }

        return 'input_text';
    }


    // ── Options (native <select> and radio groups only) ─────────────
    // NOTE: ARIA combobox options are NOT read here.
    // extractor/combobox.ts expands them separately via Playwright clicks.
    function getOptions(el) {
        const tag = el.tagName.toLowerCase();
        const type = (el.getAttribute('type') || '').toLowerCase();

        if (tag === 'select') {
            return Array.from(el.options)
                .map(o => o.text.trim())
                .filter(t => t && !['-- select --', 'select', ''].includes(t.toLowerCase()));
        }

        if (type === 'radio' && el.name) {
            return Array.from(document.querySelectorAll('input[type="radio"][name="' + el.name + '"]'))
                .map(r => {
                    const lbl = document.querySelector('label[for="' + r.id + '"]');
                    return lbl ? lbl.textContent.trim() : r.value;
                })
                .filter(Boolean);
        }

        return [];
    }

    // ── Group ID: find the question container wrapping label + input ──
    // Walk up from the element until we find an ancestor that contains BOTH
    // a text-like label node AND another interactive element (or the element itself).
    // All elements sharing the same container node get the same group_id.
    let groupCounter = 0;
    const groupMap = new WeakMap(); // node → group_id string

    function getGroupId(el) {
        let node = el.parentElement;
        // Walk up max 6 levels
        for (let i = 0; i < 6 && node && node !== document.body; i++) {
            const hasLabel = node.querySelector('label, legend, [class*="label"], [class*="title"]');
            const hasInput = node.querySelector('input:not([type=hidden]), select, textarea, [role="combobox"], [role="radio"], [role="checkbox"]');
            if (hasLabel && hasInput) {
                if (!groupMap.has(node)) groupMap.set(node, 'grp-' + (++groupCounter));
                return groupMap.get(node);
            }
            node = node.parentElement;
        }
        return '';
    }


    // ── Visibility check ────────────────────────────────────────────
    function isVisible(el) {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        const tag = el.tagName.toLowerCase();
        const type = (el.getAttribute('type') || '').toLowerCase();
        // Native radio/checkbox and native select inputs are often disabled or CSS-hidden
        // by ATS frameworks (Workday) but still have options/values we can read and fill.
        // Accept them even if disabled or bbox is zero.
        if (type === 'radio' || type === 'checkbox' || tag === 'select') return true;
        if (el.disabled) return false;
        return rect.width > 0 || rect.height > 0;
    }

    // ── Gather all interactive elements ────────────────────────────
    // Expanded: now also catches button groups and ARIA button roles
    // so that custom pill buttons get jz-ids for SoM annotation.
    const SELECTOR = [
        'input:not([type=hidden])',
        'select',
        'textarea',
        '[role="combobox"]',
        '[role="listbox"]',
        '[role="textbox"]',
        '[role="checkbox"]',
        '[role="radio"]',
        'button[aria-haspopup="listbox"]',
        'button[aria-haspopup="true"]',
        'button[aria-haspopup="menu"]'
    ].join(', ');

    // Secondary selector for button groups (caught separately to avoid
    // polluting the primary extraction with nav/submit buttons).
    const BTN_SELECTOR = [
        'button:not([type="submit"]):not([type="reset"])',
        '[role="button"]:not([type="submit"])',
        '[role="switch"]',
    ].join(', ');

    const seen = new Set();

    function processElement(el) {
        if (seen.has(el)) return;
        seen.add(el);

        if (!isVisible(el)) return;

        const type = (el.getAttribute('type') || '').toLowerCase();
        if (['hidden', 'submit', 'reset', 'image'].includes(type)) return;

        // ── Combobox trigger promotion ─────────────────────────────────────────────
        // If this input is classified as 'combobox' (listbox-backed), find the
        // real clickable trigger element (the button[aria-haspopup]) so that:
        //   a) The jz-id is stamped on the TRIGGER (correct click target)
        //   b) The TRIGGER's current displayed value is captured for pre-fill detection
        //   c) The inner <input> is marked as seen so it doesn't get its own jz-id
        const wouldBeCombobox = getActionType(el) === 'combobox';
        const isInputEl = el.tagName.toLowerCase() === 'input';
        if (wouldBeCombobox && isInputEl) {
            // Look for the listbox trigger button in the surrounding container
            const parent = el.parentElement;
            const grandParent = parent?.parentElement;
            const trigger =
                parent?.querySelector('button[aria-haspopup]') ||
                grandParent?.querySelector('button[aria-haspopup]') ||
                el.closest('[role="combobox"]');
            if (trigger && trigger !== el && !seen.has(trigger)) {
                // Stamp the trigger instead, and mark the original input as seen
                seen.add(el); // don't double-stamp the input
                processElement(trigger); // recursively process the trigger
                return;
            }
            // If no trigger found, fall through and stamp the input itself
        }

        const id = 'jz-' + (++counter);
        el.setAttribute('data-jz-id', id);

        const actionType = getActionType(el);
        const { text: labelText, source: labelSource } = getLabel(el);
        const options = getOptions(el);
        const group_id = getGroupId(el);

        // Scroll-adjusted bounding box for SoM annotation
        const rect = el.getBoundingClientRect();
        const bbox = {
            x: Math.round(rect.left),
            y: Math.round(rect.top + window.scrollY),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
        };

        elements.push({
            id,
            tagName: el.tagName.toLowerCase(),
            type: el.getAttribute('type') || '',
            role: el.getAttribute('role') || '',
            action_type: actionType,
            label: labelText,
            label_source: labelSource,
            name: el.getAttribute('name') || '',
            placeholder: el.getAttribute('placeholder') || '',
            value: el.value || '',
            required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
            ariaControls: el.getAttribute('aria-controls') || '',
            options,
            bbox,
            group_id,
        });

        // ── Native radio: mark all siblings as seen (only first gets jz-id) ────
        // Stamping data-jz-id on every native input[type=radio] triggers React
        // re-renders in SPAs like Ashby, wiping jz-ids from later elements.
        // [role="radio"] elements (the styled clickable options) are handled
        // separately via the SELECTOR and each get their own jz-id safely.
        if (type === 'radio' && el.name) {
            document.querySelectorAll('input[type="radio"][name="' + el.name + '"]')
                .forEach(m => seen.add(m));
        }
    }

    // Process primary form fields
    for (const el of document.querySelectorAll(SELECTOR)) {
        processElement(el);
    }

    // Process button groups — only if they appear to be inside a form field
    // container (i.e., their parent has a label). This catches Ashby's pill
    // buttons while ignoring nav/header buttons.
    for (const el of document.querySelectorAll(BTN_SELECTOR)) {
        if (el.getAttribute('data-jz-id')) continue; // already processed
        const parent = el.closest('form, [role="form"], main, [class*="form"], [class*="application"]');
        if (!parent) continue;
        const hasNearbyLabel = el.closest('[class*="question"], [class*="field"], [class*="group"], fieldset, li');
        if (!hasNearbyLabel) continue;
        processElement(el);
    }

    return elements;
})();
