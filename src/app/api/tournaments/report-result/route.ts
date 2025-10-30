import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import Tournament, { ITournament, IMatch } from '@shared/models/Tournament';
import User from '@shared/models/User';

function findMatch(t: ITournament, matchId: string): IMatch | undefined {
  return (t.matches || []).find((m) => m.id === matchId) as IMatch | undefined;
}

async function creditUserTokens(userId: string, amount: number) {
  const u = await User.findOne({ uuid: userId }) || await User.findById(userId) || await User.findOne({ _id: userId });
  if (!u) return null;
  u.tokens = (u.tokens || 0) + amount;
  await u.save();
  return u;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { tournamentId, matchId, winnerId } = await req.json();
  await dbConnect();
  const tDoc = await Tournament.findById(tournamentId);
  if (!tDoc) return NextResponse.json({ message: 'Tournament not found' }, { status: 404 });
  const t = tDoc as ITournament & { save: () => Promise<void> };
  if (t.status !== 'ongoing') return NextResponse.json({ message: 'Tournament not ongoing' }, { status: 400 });

  const match = findMatch(t, matchId);
  if (!match) return NextResponse.json({ message: 'Match not found' }, { status: 404 });
  if (match.finished) return NextResponse.json({ message: 'Match already finished' }, { status: 400 });

  // Verify reporter: must be one of participants (slotA/slotB) or the tournament owner
  const reporterId = session.user.id;
  const isParticipant = [match.slotA, match.slotB].includes(reporterId as string);
  if (!isParticipant && t.ownerId !== reporterId) {
    return NextResponse.json({ message: 'Only participants or tournament owner can report results' }, { status: 403 });
  }

  // Mark winner and loser
  const slotA = match.slotA as string | null | undefined;
  const slotB = match.slotB as string | null | undefined;
  const loserId = slotA === winnerId ? slotB : slotA;
  match.winner = winnerId;
  match.loser = loserId;
  match.finished = true;

  // Advance to next round: determine next match slot
  const currentRound = match.round;
  // Find matches of next round or create placeholder
  const nextRound = currentRound + 1;

  if (nextRound <= 4) {
    // Calculate index for next round match: floor(matchIndex/2)
    const roundMatches = (t.matches || []).filter((m) => m.round === currentRound).sort((a, b) => a.id.localeCompare(b.id)) as IMatch[];
    const matchIndex = roundMatches.findIndex((m) => m.id === match.id);
    // compute global nextRoundMatches index
    let nextMatches = (t.matches || []).filter((m) => m.round === nextRound) as IMatch[];
    if (nextMatches.length === 0) {
      // create expected number of matches for next round
      const expected = Math.max(1, Math.floor(roundMatches.length / 2));
      for (let i = 0; i < expected; i++) {
        (t.matches as IMatch[]).push({ id: `${nextRound}-${i}`, round: nextRound, slotA: null, slotB: null, bestOf: nextRound === 4 ? 5 : 3, finished: false } as IMatch);
      }
      nextMatches = (t.matches || []).filter((m) => m.round === nextRound).sort((a, b) => a.id.localeCompare(b.id)) as IMatch[];
    }
    const targetIndex = Math.floor(matchIndex / 2);
    const target = nextMatches[targetIndex];
    if (target) {
      if (!target.slotA) target.slotA = match.winner as string | null;
      else if (!target.slotB) target.slotB = match.winner as string | null;
    }
  }

  // If this was a semifinal (round 3) then when both SF are finished we should create a bronze match
  if (match.round === 3) {
    const sfMatches = (t.matches || []).filter((m) => m.round === 3 && !m.isBronze) as IMatch[];
    const finishedSF = sfMatches.filter((m) => m.finished);
    // collect losers
    const semifinalLosers: string[] = finishedSF.map((m) => m.loser as string).filter(Boolean);
    // if we have two semifinal losers and no bronze match yet, create bronze match
    const bronzeExists = (t.matches || []).some((m) => (m as IMatch).isBronze);
    if (semifinalLosers.length >= 2 && !bronzeExists) {
      const bronzeId = `bronze-${Date.now()}`;
      (t.matches as IMatch[]).push({ id: bronzeId, round: 3, slotA: semifinalLosers[0], slotB: semifinalLosers[1], bestOf: 3, finished: false, isBronze: true } as IMatch);
    }
  }

  // If this was the final (round 4) then finalize tournament and payout
  if (match.round === 4) {
    // Determine 1st and 2nd
    const championId = match.winner;
    const runnerUpId = match.loser;

    // Determine third place: prefer bronze match winner if finished
    let thirdId: string | null = null;
    const bronze = (t.matches || []).find((m) => (m as IMatch).isBronze) as IMatch | undefined;
    if (bronze && bronze.finished && bronze.winner) {
      thirdId = bronze.winner as string;
    } else {
      // fallback to semifinal losers if available
      const sfMatches = (t.matches || []).filter((m) => m.round === 3 && !(m as IMatch).isBronze) as IMatch[];
      const semifinalLosers: string[] = [];
      for (const m of sfMatches) {
        if (m.finished && m.loser) semifinalLosers.push(m.loser as string);
      }
      if (semifinalLosers.length >= 1) thirdId = semifinalLosers[0];
    }

    const pool = t.prizePool || 0;
    const firstAmt = Math.round(pool * 0.6);
    const secondAmt = Math.round(pool * 0.25);
    const thirdAmt = Math.round(pool * 0.15);

    if (championId) await creditUserTokens(championId, firstAmt);
    if (runnerUpId) await creditUserTokens(runnerUpId, secondAmt);
    if (thirdId) await creditUserTokens(thirdId, thirdAmt);

    t.status = 'completed';
  }

  await t.save();
  return NextResponse.json({ message: 'Result recorded', tournament: t });
}

export const dynamic = 'force-dynamic';
