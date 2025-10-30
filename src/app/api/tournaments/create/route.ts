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
  const name = String(body.name || 'Classic 16 Player');
  const buyIn = Number(body.buyIn || 200);
  // Optional check-in end timestamp (ISO) set by owner; if provided store it
  const checkinEndsAt = body.checkinEndsAt ? new Date(body.checkinEndsAt) : null;
  const maxPlayers = 16;
  await dbConnect();
  const user = await User.findOne({ email: session.user.email });
  if (!user) return NextResponse.json({ message: 'User not found' }, { status: 404 });

  const tournament = await Tournament.create({
    name,
    ownerId: session.user.id,
    buyIn,
    prizePool: 0,
    status: 'registration',
    maxPlayers,
    checkinEndsAt,
  });

  return NextResponse.json({ tournament });
}

export const dynamic = 'force-dynamic';
