import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import Tournament, { ITournament, ITournamentPlayer, IMatch } from '@shared/models/Tournament';
import { v4 as uuidv4 } from 'uuid';

function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { tournamentId } = await req.json();
  await dbConnect();
  const tDoc = await Tournament.findById(tournamentId);
  if (!tDoc) return NextResponse.json({ message: 'Tournament not found' }, { status: 404 });
  const t = tDoc as ITournament & { save: () => Promise<void> };
  if (t.ownerId !== session.user.id) return NextResponse.json({ message: 'Only owner can start' }, { status: 403 });
  if (t.status !== 'registration' && t.status !== 'checkin') return NextResponse.json({ message: 'Invalid status' }, { status: 400 });

  // Mark non-checked-in players as eliminated (no-shows)
  const players = (t.players || []).map((p) => ({ ...p })) as ITournamentPlayer[];
  players.forEach((p) => {
    p.eliminated = !p.checkedIn;
  });

  const activePlayers = players.filter((p) => !p.eliminated);
  if (activePlayers.length < 2) return NextResponse.json({ message: 'Not enough checked-in players to start' }, { status: 400 });

  // Random seed among active players, other slots become byes
  const seeded = shuffle(activePlayers).map((p, idx: number) => ({ ...p, seed: idx + 1 }));

  // Build R16 slots: fill with seeded players in order; remaining slots are null (byes)
  const slots: Array<string | null> = new Array(16).fill(null);
  for (let i = 0; i < seeded.length && i < 16; i++) {
    slots[i] = seeded[i].userId;
  }

  const matches: IMatch[] = [];
  for (let i = 0; i < 8; i++) {
    const slotA = slots[i * 2] || null;
    const slotB = slots[i * 2 + 1] || null;
    const match: IMatch = { id: uuidv4(), round: 1, slotA, slotB, bestOf: 3, finished: false } as IMatch;
    // If one side missing, auto-advance the other
    if (slotA && !slotB) {
      match.winner = slotA;
      match.loser = null;
      match.finished = true;
    } else if (!slotA && slotB) {
      match.winner = slotB;
      match.loser = null;
      match.finished = true;
    }
    matches.push(match);
  }

  // Create empty placeholders for next rounds (QF/SF/Final)
  // QF: 4 matches, SF:2, Final:1
  for (let r = 2; r <= 4; r++) {
    const count = r === 2 ? 4 : r === 3 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      matches.push({ id: `${r}-${i}`, round: r, slotA: null, slotB: null, bestOf: r === 4 ? 5 : 3, finished: false } as IMatch);
    }
  }

  // Advance pre-resolved winners from R16 into QF slots
  const r16 = matches.filter((m) => m.round === 1);
  const qf = matches.filter((m) => m.round === 2).sort((a, b) => a.id.localeCompare(b.id));
  r16.forEach((m, idx) => {
    if (m.finished && m.winner) {
      const target = Math.floor(idx / 2);
      const qm = qf[target];
      if (!qm.slotA) qm.slotA = m.winner;
      else if (!qm.slotB) qm.slotB = m.winner;
      // If qm now has only one side, it may auto-advance later when starting
    }
  });

  t.players = players;
  t.matches = matches;
  t.status = 'ongoing';
  await t.save();
  return NextResponse.json({ message: 'Tournament started', tournament: t });
}

export const dynamic = 'force-dynamic';
