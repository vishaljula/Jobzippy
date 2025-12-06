import type { NextFunction, Request, Response } from 'express';
import { getAuth } from '../services/firebase-admin.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    email_verified?: boolean;
  };
}

/**
 * Middleware to authenticate Firebase ID tokens
 */
export async function authenticateFirebase(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'unauthorized', message: 'Missing or invalid authorization header' });
      return;
    }

    const idToken = authHeader.split('Bearer ')[1];

    if (!idToken) {
      res.status(401).json({ error: 'unauthorized', message: 'Missing ID token' });
      return;
    }

    // Verify the Firebase ID token
    const decodedToken = await getAuth().verifyIdToken(idToken);

    // Attach user info to request
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      email_verified: decodedToken.email_verified,
    };

    next();
  } catch (error) {
    console.error('[Auth Middleware] Token verification failed:', error);
    res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired token' });
  }
}

