import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import User from '@shared/models/User';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const { amount } = await req.json();
    const amt = Number(amount || 0);
    if (!amt || amt <= 0) return NextResponse.json({ message: 'Invalid amount' }, { status: 400 });
    await dbConnect();
    const user = await User.findOne({ email: session.user.email });
    if (!user) return NextResponse.json({ message: 'User not found' }, { status: 404 });
    user.tokens = (user.tokens || 0) + amt;
    await user.save();
    return NextResponse.json({ tokens: user.tokens });
  } catch (e) {
    console.error('Credit tokens error:', e);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
