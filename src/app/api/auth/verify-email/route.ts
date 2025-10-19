import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@shared/models/User';
import { hashToken } from '@/lib/tokens';

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');
    const email = searchParams.get('email');

    if (!token || !email) {
      return NextResponse.json({ message: 'Invalid verification link.' }, { status: 400 });
    }

    const tokenHash = hashToken(token);
    const user = await User.findOne({ email });
    if (!user || !user.verificationTokenHash || !user.verificationTokenExpires) {
      return NextResponse.json({ message: 'Invalid or expired verification link.' }, { status: 400 });
    }

    if (user.verificationTokenHash !== tokenHash) {
      return NextResponse.json({ message: 'Invalid verification token.' }, { status: 400 });
    }

    if (new Date() > new Date(user.verificationTokenExpires)) {
      return NextResponse.json({ message: 'Verification link has expired. Please request a new one.' }, { status: 400 });
    }

    user.emailVerified = new Date();
    user.verificationTokenHash = null;
    user.verificationTokenExpires = null;
    await user.save();

    return NextResponse.redirect(new URL('/login?verified=1', req.url));
  } catch (err) {
    console.error('Verify Email Error:', err);
    return NextResponse.json({ message: 'Server error verifying email.' }, { status: 500 });
  }
}
