import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@shared/models/User';
import bcrypt from 'bcryptjs';
import { generateVerificationToken } from '@/lib/tokens';
import { getBaseUrl, sendMail } from '@/lib/mail';
import { z } from 'zod';

const registerSchema = z.object({
  name: z.string().min(3, { message: 'Name must be at least 3 characters long' }),
  email: z.string().toLowerCase().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: 'Invalid email address' }),
  username: z.string()
    .min(3, { message: 'Username must be at least 3 characters long' })
    .regex(/^\w+$/, { message: 'Username can only contain letters, numbers, and underscores' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters long' }),
});

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const body = await req.json();
    const validation = registerSchema.safeParse(body);

    if (!validation.success) {
      const errorMessage = validation.error.issues.map(e => e.message).join(', ');
      return NextResponse.json({ message: errorMessage || 'Invalid input' }, { status: 400 });
    }
    
  const { email, username } = validation.data;

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      let message = 'User already exists.';
      if (existingUser.email === email) {
        message = 'An account with this email already exists.';
      } else if (existingUser.username === username) {
        message = 'This username is already taken.';
      }
      return NextResponse.json({ message }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(validation.data.password, 10);

    const newUser = new User({
      name: validation.data.name,
      email: validation.data.email,
      username: validation.data.username,
      password: hashedPassword,
      emailVerified: null,
    });

    const { token, hash, expires } = generateVerificationToken();
    newUser.verificationTokenHash = hash;
    newUser.verificationTokenExpires = expires;
    newUser.verificationEmailSentAt = new Date();

    await newUser.save();

    const verifyUrl = `${getBaseUrl()}/api/auth/verify-email?token=${token}&email=${encodeURIComponent(newUser.email)}`;
    await sendMail({
      to: newUser.email,
      subject: 'Verify your email',
      html: `
        <p>Hi ${newUser.name},</p>
        <p>Thanks for registering. Please verify your email by clicking the link below. This link expires in 2 hours.</p>
        <p><a href="${verifyUrl}">Verify Email</a></p>
        <p>If you did not request this, you can ignore this email.</p>
      `,
    });

    return NextResponse.json({ message: 'User created. Please check your email to verify your account.' }, { status: 201 });
  } catch (error) {
    console.error('Registration Error:', error);
    return NextResponse.json({ message: 'An unexpected error occurred on the server.' }, { status: 500 });
  }
}
