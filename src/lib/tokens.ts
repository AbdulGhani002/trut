import crypto from 'node:crypto';

export function generateVerificationToken(): { token: string; hash: string; expires: Date } {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 2); // 2 hours
  return { token, hash, expires };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
