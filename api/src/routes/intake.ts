import { Router } from 'express';
import { intakeRequestSchema, type IntakeRequestInput } from '../schemas/intake.js';
import { runIntakeAgent } from '../services/intake-agent.js';
import type { IntakeRequestBody } from '../types/intake.js';

export const intakeRouter = Router();

intakeRouter.post('/parse', async (req, res, next) => {
  try {
    const parsed = intakeRequestSchema.parse(req.body) as IntakeRequestInput;
    // Transform to match IntakeRequestBody type
    const payload: IntakeRequestBody = {
      resumeText: parsed.resumeText,
      resumeMetadata: parsed.resumeMetadata,
      conversation: parsed.conversation,
      knownFields: parsed.knownFields as IntakeRequestBody['knownFields'],
      missingFields: parsed.missingFields,
    };
    
    console.log('[IntakeRoute] Received request, resume text length:', payload.resumeText.length);
    
    const result = await runIntakeAgent(payload);
    
    console.log('[IntakeRoute] Response preview sections:', result.previewSections.length);
    result.previewSections.forEach((section, idx) => {
      console.log(`[IntakeRoute] Section ${idx}: ${section.title}, fields: ${section.fields.length}, confidence: ${section.confidence}`);
    });
    
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});


