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
    function getLabel(el) {
        // 1. aria-label
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

        // 2. aria-labelledby → resolve referenced element text
        const labelledBy = el.getAttribute('aria-labelledby');
        if (labelledBy) {
            const text = labelledBy.split(' ')
                .map(id => document.getElementById(id)?.textContent?.trim())
                .filter(Boolean)
                .join(' ');
            if (text) return text;
        }

        // 3. <label for="id">
        if (el.id) {
            const label = document.querySelector('label[for="' + el.id + '"]');
            if (label) {
                const clone = label.cloneNode(true);
                clone.querySelectorAll('input,select,textarea').forEach(e => e.remove());
                const text = clone.textContent.trim();
                if (text) return text;
            }
        }

        // 4. Wrapping <label>
        const parentLabel = el.closest('label');
        if (parentLabel) {
            const clone = parentLabel.cloneNode(true);
            clone.querySelectorAll('input,select,textarea,button').forEach(e => e.remove());
            const text = clone.textContent.trim();
            if (text) return text;
        }

        // 5. Preceding legend/label/title in parent
        const parent = el.parentElement;
        if (parent) {
            const prev = parent.querySelector('legend, label, [class*="label"], [class*="title"]');
            if (prev && prev !== el) {
                const text = prev.textContent.trim();
                if (text) return text;
            }
        }

        // 6. placeholder
        const placeholder = el.getAttribute('placeholder');
        if (placeholder && placeholder.trim()) return placeholder.trim();

        // 7. name attribute (humanized)
        const name = el.getAttribute('name');
        if (name) return name.replace(/[_-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();

        return '(unlabelled)';
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
        if (type === 'submit' || type === 'button') return 'click_button';
        if (tag === 'button') return 'click_button';
        if (role === 'combobox') return 'combobox';
        if (role === 'listbox') return 'combobox';
        if (role === 'checkbox') return 'click_checkbox';
        if (role === 'radio') return 'click_radio';
        if (role === 'textbox') return 'input_text';
        if (tag === 'input') return 'input_text';
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

    // ── Visibility check ────────────────────────────────────────────
    function isVisible(el) {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return (
            (rect.width > 0 || rect.height > 0) &&
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            style.opacity !== '0' &&
            !el.disabled
        );
    }

    // ── Gather all interactive elements ────────────────────────────
    const SELECTOR = [
        'input:not([type=hidden])',
        'select',
        'textarea',
        '[role="combobox"]',
        '[role="listbox"]',
        '[role="textbox"]',
        '[role="checkbox"]',
        '[role="radio"]',
    ].join(', ');

    const seen = new Set();

    for (const el of document.querySelectorAll(SELECTOR)) {
        if (seen.has(el)) continue;
        seen.add(el);

        if (!isVisible(el)) continue;

        const type = (el.getAttribute('type') || '').toLowerCase();
        if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) continue;

        const id = 'jz-' + (++counter);
        el.setAttribute('data-jz-id', id);

        const actionType = getActionType(el);
        const label = getLabel(el);
        const options = getOptions(el);

        elements.push({
            id,
            tagName: el.tagName.toLowerCase(),
            type: el.getAttribute('type') || '',
            role: el.getAttribute('role') || '',
            action_type: actionType,
            label,
            name: el.getAttribute('name') || '',
            placeholder: el.getAttribute('placeholder') || '',
            value: el.value || '',
            required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
            // aria-controls tells us which listbox container this combobox controls —
            // used by combobox.ts to scope option reading during expand-and-read pass
            ariaControls: el.getAttribute('aria-controls') || '',
            options, // empty [] for comboboxes — filled in by combobox.ts
        });

        // For radio groups: mark all siblings as seen so only first gets an id
        if (type === 'radio' && el.name) {
            document.querySelectorAll('input[type="radio"][name="' + el.name + '"]')
                .forEach(m => seen.add(m));
        }
    }

    return elements;
})();
