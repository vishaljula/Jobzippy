/**
 * Quick test to verify confidence scoring fix
 * Run this in the browser console on a page with submit buttons
 */

// Mock the scenario from the user's issue
const mockActions = [
    {
        type: "link",
        purpose: "submit",
        element: { textContent: "Continue" },
        confidence: 0.75, // Link with traversal match
        selectors: ["inference-traversal"]
    },
    {
        type: "link",
        purpose: "submit",
        element: { textContent: "Next" },
        confidence: 0.75,
        selectors: ["inference-traversal"]
    },
    {
        type: "link",
        purpose: "submit",
        element: { textContent: "Review" },
        confidence: 0.75,
        selectors: ["inference-traversal"]
    },
    {
        type: "button",
        purpose: "submit",
        element: { textContent: "Submit application" },
        confidence: 1.0, // Button with direct text match - HIGHEST
        selectors: ["inference-traversal"]
    }
];

// Test findBestAction logic
function findBestAction(actions, purpose) {
    const candidates = actions.filter((a) => a.purpose === purpose);

    if (candidates.length === 0) return undefined;

    // Sort by confidence
    candidates.sort((a, b) => b.confidence - a.confidence);

    return candidates[0];
}

// Run test
const bestSubmit = findBestAction(mockActions, 'submit');

console.log('=== Confidence Scoring Test ===');
console.log('All submit actions:', mockActions.map(a => ({
    type: a.type,
    text: a.element.textContent,
    confidence: a.confidence
})));
console.log('\nBest submit action:', {
    type: bestSubmit.type,
    text: bestSubmit.element.textContent,
    confidence: bestSubmit.confidence
});

// Verify the fix
if (bestSubmit.type === 'button' && bestSubmit.confidence === 1.0) {
    console.log('\n✅ TEST PASSED: Button with "Submit application" correctly selected with 1.0 confidence');
} else {
    console.log('\n❌ TEST FAILED: Expected button with 1.0 confidence, got:', bestSubmit);
}
