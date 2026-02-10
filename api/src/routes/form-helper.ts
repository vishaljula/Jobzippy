/**
 * Form Helper API Routes
 * 
 * Endpoints for LLM-powered form filling assistance.
 */

import { Router } from 'express';
import { z } from 'zod';
import {
  answerFormQuestions,
  generateCoverLetter,
  type FormAnswerRequest,
  type CoverLetterRequest
} from '../services/form-helper-agent.js';

export const formHelperRouter = Router();

// Schema for form question
const formQuestionSchema = z.object({
  fieldId: z.string(),
  questionText: z.string(),
  inputType: z.enum(['text', 'number', 'select', 'textarea', 'radio', 'checkbox']),
  options: z.array(z.string()).optional(),
  maxLength: z.number().optional(),
  isRequired: z.boolean(),
  validationError: z.string().optional(), // Error message from previous attempt
  previousAnswer: z.string().optional(),  // What was answered before that caused the error
});

// Schema for resume data
const resumeDataSchema = z.object({
  summary: z.string(),
  totalYearsExperience: z.number(),
  skills: z.array(z.string()),
  education: z.array(z.object({
    degree: z.string(),
    field: z.string(),
    school: z.string(),
  })),
  recentJobTitle: z.string(),
  recentCompany: z.string(),
});

// Schema for form answer request
const formAnswerRequestSchema = z.object({
  jobTitle: z.string(),
  company: z.string(),
  jobDescription: z.string().optional(),
  questions: z.array(formQuestionSchema),
  resumeData: resumeDataSchema,
});

// Schema for cover letter request
const coverLetterRequestSchema = z.object({
  jobTitle: z.string(),
  company: z.string(),
  jobDescription: z.string(),
  resumeData: resumeDataSchema,
});

/**
 * POST /form-helper/answer
 * 
 * Batch answer form questions using LLM.
 */
formHelperRouter.post('/answer', async (req, res, next) => {
  try {
    const parsed = formAnswerRequestSchema.parse(req.body);
    const request: FormAnswerRequest = parsed;

    console.log('[FormHelper] /answer request:', {
      jobTitle: request.jobTitle,
      company: request.company,
      questionCount: request.questions.length,
    });

    const result = await answerFormQuestions(request);

    console.log('[FormHelper] /answer response:', {
      answerCount: Object.keys(result.answers).length,
      confidence: result.confidence,
    });

    res.status(200).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Invalid request',
        details: error.errors
      });
      return;
    }
    next(error);
  }
});

/**
 * POST /form-helper/cover-letter
 * 
 * Generate a cover letter using LLM.
 */
formHelperRouter.post('/cover-letter', async (req, res, next) => {
  try {
    const parsed = coverLetterRequestSchema.parse(req.body);
    const request: CoverLetterRequest = parsed;

    console.log('[FormHelper] /cover-letter request:', {
      jobTitle: request.jobTitle,
      company: request.company,
      totalYearsExperience: request.resumeData?.totalYearsExperience,
      recentCompany: request.resumeData?.recentCompany,
      summaryPreview: request.resumeData?.summary?.substring(0, 80),
    });

    const result = await generateCoverLetter(request);

    console.log('[FormHelper] /cover-letter response:', {
      letterLength: result.coverLetter.length,
    });

    res.status(200).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Invalid request',
        details: error.errors
      });
      return;
    }
    next(error);
  }
});

