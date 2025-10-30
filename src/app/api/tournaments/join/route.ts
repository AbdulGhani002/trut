import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import Tournament from '@shared/models/Tournament';
import User from '@shared/models/User';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const tournamentId = String(body.tournamentId || '');
  await dbConnect();
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) return NextResponse.json({ message: 'Tournament not found' }, { status: 404 });
  if (tournament.status !== 'registration') return NextResponse.json({ message: 'Tournament not open for registration' }, { status: 400 });
  if ((tournament.players || []).length >= tournament.maxPlayers) return NextResponse.json({ message: 'Tournament full' }, { status: 400 });

  const user = await User.findOne({ email: session.user.email });
  if (!user) return NextResponse.json({ message: 'User not found' }, { status: 404 });

  // Deduct buy-in
  if ((user.tokens || 0) < tournament.buyIn) return NextResponse.json({ message: 'Insufficient tokens' }, { status: 400 });
  user.tokens = (user.tokens || 0) - tournament.buyIn;
  await user.save();

  tournament.players.push({ userId: session.user.id, email: session.user.email, name: user.name, checkedIn: false });
  tournament.prizePool = (tournament.prizePool || 0) + tournament.buyIn;
  await tournament.save();

  return NextResponse.json({ message: 'Joined', tournament });
}

export const dynamic = 'force-dynamic';
