import { Router } from 'express';
import { z } from 'zod';

import { fetchJobMatches } from '../services/job-search.js';

const querySchema = z.object({
  keywords: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',').map((token) => token.trim()).filter(Boolean) : [])),
  locations: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',').map((token) => token.trim()).filter(Boolean) : [])),
  remote: z
    .string()
    .optional()
    .transform((value) => {
      if (value === 'true') return true;
      if (value === 'false') return false;
      return undefined;
    }),
  limit: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      const parsed = Number.parseInt(value, 10);
      return Number.isNaN(parsed) ? undefined : parsed;
    }),
});

export const jobsRouter = Router();

jobsRouter.get('/search', async (req, res) => {
  try {
    const { keywords, locations, remote, limit } = querySchema.parse(req.query);
    const jobs = await fetchJobMatches({
      keywords,
      locations,
      remoteOnly: remote,
      limit,
    });
    res.json({ jobs, count: jobs.length });
  } catch (error) {
    console.error('[Jobs] Failed to fetch job matches', error);
    res.status(500).json({
      error: 'job_search_failed',
      message: error instanceof Error ? error.message : 'Unable to fetch job matches',
    });
  }
});

