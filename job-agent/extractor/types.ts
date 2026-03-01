/**
 * extractor/types.ts
 * Shared types for the extractor layer.
 */

export interface BoundingBox {
    x: number;   // left edge (absolute, includes scrollY)
    y: number;   // top edge (absolute, includes scrollY)
    w: number;   // width
    h: number;   // height
}

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

    // ── Enriched spatial/semantic context (added in Layer 1) ─────────────────
    bbox: BoundingBox;       // element bounding box (scroll-adjusted) for SoM annotation
    group_id: string;        // shared group id for all elements in the same form question container
    label_source: string;    // "aria-label" | "aria-labelledby" | "for-attr" | "parent" | "placeholder" | "name"
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
    status: 'ok' | 'skip' | 'error' | 'warning';
    verified?: boolean;      // true = DOM readback confirmed; false = click ran but state unchanged; undefined = not readable
    dom_value?: string;      // actual DOM value read back after fill
    error?: string;
}

// ── Vision extraction types (Layer 2b) ──────────────────────────────────────

/** Visual interaction type as inferred by Claude Vision from the screenshot. */
export type VisualType =
    | 'text_input'
    | 'textarea'
    | 'dropdown'
    | 'button_choice'   // side-by-side buttons e.g. Yes/No
    | 'radio_group'     // circular radio options
    | 'checkbox'        // square checkbox (single or multi-select group)
    | 'file_upload';

/**
 * A single field discovered by Claude Vision not covered by DOM extraction.
 * Answer is already determined from the applicant profile — no extra LLM call.
 */
export interface VisionField {
    label: string;              // full question/label text
    visual_type: VisualType;
    choices: string[] | null;   // options visible on screen (for button_choice/radio)
    answer: string | string[];  // what to fill/select/click ([] = nothing selected)
    required: boolean;
    already_filled: boolean;    // true if value already shown on screen
}

// ── Color annotation types (Layer 2 — SoM) ───────────────────────────────────

/** Maps a unique injected color to a DOM element for annotated screenshot targeting. */
export interface ColorAnnotation {
    color: string;              // e.g. "#FF0055" — injected as the element's border color
    element_id: string;         // badge label visible in screenshot: jz_id if known, else 'eN'
    jz_id: string | null;       // set if element already has a data-jz-id
    cx: number;                 // center X of element (scroll-adjusted)
    cy: number;                 // center Y of element (scroll-adjusted)
    label: string;              // best label text for this element
    tag: string;                // tagName
    role: string;               // aria role
}

// ── New vision response types (Layer 2b — SoM-aware) ─────────────────────────

/**
 * A single action returned by Claude Vision in the new SoM-aware schema.
 * Claude references elements by jz_id (if visible in annotation) or by coords.
 */
export interface VisionPlanAction {
    jz_id: string | null;       // reference to annotated element; null = not in DOM
    coords: { x: number; y: number } | null;  // center coords; used when jz_id is null
    action: 'input' | 'click' | 'select' | 'check';
    value: string | string[];   // answer to fill / option to click
    label: string;              // question label text (for diagnostics)
    visual_type: VisualType;
    confidence: 'high' | 'medium' | 'low';
    note?: string;
}

export interface VisionUnresolved {
    label: string;
    visual_type: VisualType;
    why: string;                // e.g. "No jz-id — outside DOM extractor scope"
}

export interface VisionPlanResponse {
    actions: VisionPlanAction[];
    unresolved: VisionUnresolved[];
}

// ── Merged plan types (Layer 3b) ─────────────────────────────────────────────

/** DOM-sourced action — uses data-jz-id for precise element targeting. */
export interface DomAction extends FillAction {
    source: 'dom';
    label: string;
}

/**
 * Vision-sourced action — may have jz_id (annotated) or coords (un-annotated).
 * Falls back to text-proximity selector only when neither is available.
 */
export interface VisionAction {
    source: 'vision';
    label: string;
    visual_type: VisualType;
    choices?: string[];
    action_type: 'click_button' | 'checkbox' | 'combobox' | 'input_text' | 'upload_file';
    value: string | string[];
    // ── SoM-enriched targeting (preferred over text proximity when present) ──
    element_id?: string | null;  // badge ID (jz-N or eN) → data-jz-element-id attr lookup
    jz_id?: string | null;       // = element_id when element_id starts with 'jz-'
    coords?: { x: number; y: number } | null;  // legacy fallback only
}

/** Discriminated union — route in fill.ts on `source` field. */
export type MergedAction = DomAction | VisionAction;



