/**
 * Mock vault data for testing
 * Use this when vault is empty to test form filling
 */

export const MOCK_VAULT_DATA = {
  identity: {
    first_name: 'John',
    last_name: 'Doe',
    email: 'john.doe@example.com',
    phone: '+1 (555) 123-4567',
    address: '123 Main St, San Francisco, CA 94102',
  },
  work_auth: {
    visa_type: 'Citizen',
    sponsorship_required: false,
  },
};

/**
 * Mock resume for testing
 * A minimal PDF-like ArrayBuffer for testing resume upload functionality
 */
export const MOCK_RESUME: ArrayBuffer = (() => {
  // Create a minimal PDF structure (PDF header + basic content)
  const pdfContent =
    '%PDF-1.4\n%Mock Resume\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 1\ntrailer\n<< /Size 1 /Root 1 0 R >>\nstartxref\n100\n%%EOF';
  const encoder = new TextEncoder();
  return encoder.encode(pdfContent).buffer;
})();
