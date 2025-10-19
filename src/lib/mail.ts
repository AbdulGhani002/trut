import nodemailer from 'nodemailer';

export type MailParams = {
  to: string;
  subject: string;
  html: string;
};

export function getBaseUrl() {
  return process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3001}`;
}

export async function sendMail({ to, subject, html }: MailParams) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('SMTP is not configured. Skipping email send.');
    return;
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: String(process.env.SMTP_USER), pass: String(process.env.SMTP_PASS) },
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || String(process.env.SMTP_USER),
    to,
    subject,
    html,
  });
}
