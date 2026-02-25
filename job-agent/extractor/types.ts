/**
 * extractor/types.ts
 * Shared types for the extractor layer.
 */

export interface ExtractedElement {
    id: string;              // "jz-1", "jz-2", ...
    tagName: string;         // "input", "select", "textarea", ...
    type: string;            // input type attribute ("text", "file", "checkbox", ...)
    role: string;            // aria role attribute
    action_type:             // how to interact with this element
    | 'input_text'
    | 'select_option'
    | 'combobox'
    | 'click_checkbox'
    | 'click_radio'
    | 'upload_file'
    | 'click_button';
    label: string;           // best human-readable label we could find
    name: string;            // name attribute
    placeholder: string;     // placeholder attribute
    value: string;           // current value (if pre-filled)
    required: boolean;
    ariaControls: string;    // aria-controls value — used by combobox.ts to scope option lookup
    options: string[];       // [] for comboboxes until expanded; real options for <select> and radio
}

export interface FillAction {
    id: string;              // matches ExtractedElement.id
    action_type: ExtractedElement['action_type'] | 'skip';
    value: string;           // "__RESUME_PATH__" special token for file uploads
    note?: string;           // LLM's reasoning
    options?: string[];      // combobox options from extraction — used by filler's findBestMatch()
}

export interface FillResult {
    id: string;
    action_type: string;
    value: string;
    status: 'ok' | 'skip' | 'error';
    error?: string;
}
