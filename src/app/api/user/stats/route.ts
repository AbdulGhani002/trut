import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import User from '@shared/models/User';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  await dbConnect();
  const user = await User.findOne({ email: session.user.email });
  if (!user) {
    return NextResponse.json({ message: 'User not found' }, { status: 404 });
  }
  // TODO: Replace with real stats from game history
  const stats = {
    name: user.name,
    email: user.email,
    tokens: user.tokens,
    gamesPlayed: user.gamesPlayed || 0,
    wins: user.wins || 0,
    losses: user.losses || 0,
    winRate: user.gamesPlayed ? Math.round((user.wins || 0) / user.gamesPlayed * 100) : 0,
  };
  return NextResponse.json(stats);
}
