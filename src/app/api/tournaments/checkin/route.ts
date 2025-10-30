import { NextRequest, NextResponse } from 'next/server';
import type { ITournamentPlayer } from '@shared/models/Tournament';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import Tournament from '@shared/models/Tournament';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { tournamentId } = await req.json();
  await dbConnect();
  const t = await Tournament.findById(tournamentId);
  if (!t) return NextResponse.json({ message: 'Tournament not found' }, { status: 404 });
  if (!t.players) return NextResponse.json({ message: 'No players' }, { status: 400 });

  const p = t.players.find((pl: ITournamentPlayer) => pl.userId === session.user.id);
  if (!p) return NextResponse.json({ message: 'You are not registered' }, { status: 400 });
  p.checkedIn = true;
  await t.save();
  return NextResponse.json({ message: 'Checked in', tournament: t });
}

export const dynamic = 'force-dynamic';
