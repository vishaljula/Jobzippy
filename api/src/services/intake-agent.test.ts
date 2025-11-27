import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IntakeRequestBody } from '../types/intake.js';

// Mock the LLM clients
const mockAnthropicCreate = vi.fn();
const mockOpenAICreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({
    messages: {
      create: mockAnthropicCreate,
    },
  })),
}));

vi.mock('openai', () => ({
  default: vi.fn(() => ({
    chat: {
      completions: {
        create: mockOpenAICreate,
      },
    },
  })),
}));

describe('runIntakeAgent', () => {
  const mockRequest: IntakeRequestBody = {
    resumeText: 'John Doe\njohn@example.com\nSkills: TypeScript, React',
    resumeMetadata: {
      fileName: 'resume.pdf',
      fileType: 'application/pdf',
      fileSize: 12345,
    },
    conversation: [],
    knownFields: {
      profile: {
        identity: {
          first_name: 'John',
        },
      },
    },
    missingFields: ['profile.identity.last_name'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefers Claude when API key is available', async () => {
    // Mock successful Claude response
    mockAnthropicCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            profile: {
              identity: {
                first_name: 'John',
                last_name: 'Doe',
                email: 'john@example.com',
              },
            },
            compliance: { veteran_status: 'prefer_not' },
            history: { employment: [], education: [] },
            policies: { eeo: 'ask_if_required' },
            previewSections: [],
            summary: 'Resume parsed successfully',
            confidence: 0.9,
          }),
        },
      ],
    });

    // Set up environment
    process.env.ANTHROPIC_API_KEY = 'test-claude-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';

    // Reload the module to pick up the new env vars
    vi.resetModules();
    const { runIntakeAgent: freshRunIntakeAgent } = await import('./intake-agent.js');

    const result = await freshRunIntakeAgent(mockRequest);

    expect(result).toHaveProperty('profile.identity.first_name', 'John');
    expect(result).toHaveProperty('profile.identity.last_name', 'Doe');
    expect(mockAnthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-3-haiku-20240307',
        messages: expect.any(Array),
      })
    );
  });

  it('falls back to OpenAI when Claude fails', async () => {
    // Mock Claude failure
    mockAnthropicCreate.mockRejectedValue(new Error('Claude API error'));

    // Mock successful OpenAI response
    mockOpenAICreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              profile: {
                identity: {
                  first_name: 'John',
                  last_name: 'Doe',
                  email: 'john@example.com',
                },
              },
              compliance: { veteran_status: 'prefer_not' },
              history: { employment: [], education: [] },
              policies: { eeo: 'ask_if_required' },
              previewSections: [],
              summary: 'Resume parsed via OpenAI fallback',
              confidence: 0.8,
            }),
          },
        },
      ],
    });

    process.env.ANTHROPIC_API_KEY = 'test-claude-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';

    vi.resetModules();
    const { runIntakeAgent: freshRunIntakeAgent } = await import('./intake-agent.js');

    const result = await freshRunIntakeAgent(mockRequest);

    expect(result).toHaveProperty('summary', 'Resume parsed via OpenAI fallback');
    expect(mockAnthropicCreate).toHaveBeenCalled();
    expect(mockOpenAICreate).toHaveBeenCalled();
  });

  it('falls back to heuristic when both Claude and OpenAI fail', async () => {
    // Mock both failures
    mockAnthropicCreate.mockRejectedValue(new Error('Claude API error'));
    mockOpenAICreate.mockRejectedValue(new Error('OpenAI API error'));

    process.env.ANTHROPIC_API_KEY = 'test-claude-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';

    vi.resetModules();
    const { runIntakeAgent: freshRunIntakeAgent } = await import('./intake-agent.js');

    const result = await freshRunIntakeAgent(mockRequest);

    expect(result).toHaveProperty('profile.identity.first_name', 'John'); // From known fields
    expect(result).toHaveProperty('profile.identity.last_name', 'Doe'); // Extracted from name
    expect(mockAnthropicCreate).toHaveBeenCalled();
    expect(mockOpenAICreate).toHaveBeenCalled();
  });

  it('skips Claude when API key is not available', async () => {
    // Mock successful OpenAI response
    mockOpenAICreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              profile: {
                identity: {
                  first_name: 'John',
                  last_name: 'Doe',
                  email: 'john@example.com',
                },
              },
              compliance: { veteran_status: 'prefer_not' },
              history: { employment: [], education: [] },
              policies: { eeo: 'ask_if_required' },
              previewSections: [],
              summary: 'Resume parsed via OpenAI',
              confidence: 0.8,
            }),
          },
        },
      ],
    });

    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = 'test-openai-key';

    vi.resetModules();
    const { runIntakeAgent: freshRunIntakeAgent } = await import('./intake-agent.js');

    const result = await freshRunIntakeAgent(mockRequest);

    expect(result).toHaveProperty('summary', 'Resume parsed via OpenAI');
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(mockOpenAICreate).toHaveBeenCalled();
  });

  it('handles Claude response parsing errors', async () => {
    // Mock Claude with invalid JSON response
    mockAnthropicCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: 'Invalid JSON response',
        },
      ],
    });

    // Mock successful OpenAI fallback
    mockOpenAICreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              profile: {
                identity: {
                  first_name: 'John',
                  last_name: 'Doe',
                },
              },
              compliance: { veteran_status: 'prefer_not' },
              history: { employment: [], education: [] },
              policies: { eeo: 'ask_if_required' },
              previewSections: [],
              summary: 'Fallback parsing successful',
              confidence: 0.7,
            }),
          },
        },
      ],
    });

    process.env.ANTHROPIC_API_KEY = 'test-claude-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';

    vi.resetModules();
    const { runIntakeAgent: freshRunIntakeAgent } = await import('./intake-agent.js');

    const result = await freshRunIntakeAgent(mockRequest);

    expect(result).toHaveProperty('summary', 'Fallback parsing successful');
    expect(mockAnthropicCreate).toHaveBeenCalled();
    expect(mockOpenAICreate).toHaveBeenCalled();
  });
});
