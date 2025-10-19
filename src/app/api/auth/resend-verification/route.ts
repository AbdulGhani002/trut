import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@shared/models/User';
import { generateVerificationToken } from '@/lib/tokens';
import { getBaseUrl, sendMail } from '@/lib/mail';

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const { email } = await req.json();
    if (!email) return NextResponse.json({ message: 'Email is required.' }, { status: 400 });

    const user = await User.findOne({ email });
    if (!user) {
      // Do not reveal whether account exists
      return NextResponse.json({ message: 'If the account exists, a verification email has been sent.' });
    }

    if (user.emailVerified) {
      return NextResponse.json({ message: 'Email is already verified.' });
    }

    // Enforce 2-hour cooldown between sends
    const now = Date.now();
    if (user.verificationEmailSentAt && now - new Date(user.verificationEmailSentAt).getTime() < 1000 * 60 * 60 * 2) {
      const remainingMs = 1000 * 60 * 60 * 2 - (now - new Date(user.verificationEmailSentAt).getTime());
      const minutes = Math.ceil(remainingMs / (1000 * 60));
      return NextResponse.json({ message: `Please wait ${minutes} minutes before requesting another verification email.` }, { status: 429 });
    }

    const { token, hash, expires } = generateVerificationToken();
    user.verificationTokenHash = hash;
    user.verificationTokenExpires = expires;
    user.verificationEmailSentAt = new Date();
    await user.save();

    const verifyUrl = `${getBaseUrl()}/api/auth/verify-email?token=${token}&email=${encodeURIComponent(user.email)}`;
    await sendMail({
      to: user.email,
      subject: 'Verify your email',
      html: `
        <p>Hi ${user.name},</p>
        <p>Please verify your email by clicking the link below. This link expires in 2 hours.</p>
        <p><a href="${verifyUrl}">Verify Email</a></p>
      `,
    });

    return NextResponse.json({ message: 'Verification email sent.' });
  } catch (err) {
    console.error('Resend Verification Error:', err);
    return NextResponse.json({ message: 'Server error sending verification email.' }, { status: 500 });
  }
}
