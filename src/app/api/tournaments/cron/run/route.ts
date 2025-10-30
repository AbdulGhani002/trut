import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Tournament, { ITournament, ITournamentPlayer, IMatch } from '@shared/models/Tournament';
import User from '@shared/models/User';

async function refundPlayers(t: ITournament & { save?: () => Promise<void> }) {
  // Refund buy-in to all registered players (in case of cancellation)
  for (const p of t.players || []) {
    try {
      const u = await User.findOne({ _id: p.userId }) || await User.findOne({ uuid: p.userId }) || await User.findOne({ email: p.email });
      if (u) {
        u.tokens = (u.tokens || 0) + (t.buyIn || 0);
        await u.save();
      }
    } catch {
      // ignore individual failures
    }
  }
}

export async function POST() {
  await dbConnect();
  const now = new Date();
  // Find tournaments with a checkinEndsAt that passed and are in registration/checkin
  const toProcess = await Tournament.find({ checkinEndsAt: { $ne: null, $lte: now }, status: { $in: ['registration', 'checkin'] } });
  const results: Array<Record<string, unknown>> = [];
  for (const tRaw of toProcess) {
    const t = tRaw as ITournament & { save: () => Promise<void> };
    try {
      // Mark non-checked-in players eliminated
  const players = (t.players || []).map((p) => ({ ...p })) as ITournamentPlayer[];
  players.forEach((p) => { if (!p.checkedIn) p.eliminated = true; else p.eliminated = false; });
  t.players = players;

      const activeCount = players.filter((p) => !p.eliminated).length;
      if (activeCount < 2) {
        // Cancel tournament and refund
        await refundPlayers(t);
        t.status = 'cancelled';
        await t.save();
  results.push({ id: t._id as unknown as string, action: 'cancelled', refunded: true });
        continue;
      }

      // Otherwise start tournament automatically (seed active players, create matches)
      const activePlayers = players.filter((p) => !p.eliminated);
      // randomize
      for (let i = activePlayers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [activePlayers[i], activePlayers[j]] = [activePlayers[j], activePlayers[i]];
      }
      const slots: Array<string | null> = new Array(16).fill(null);
      for (let i = 0; i < activePlayers.length && i < 16; i++) slots[i] = activePlayers[i].userId;

      const matches: IMatch[] = [];
      const { v4: uuidv4 } = await import('uuid');
      for (let i = 0; i < 8; i++) {
        const slotA = slots[i * 2] || null;
        const slotB = slots[i * 2 + 1] || null;
        const match: IMatch = { id: uuidv4(), round: 1, slotA, slotB, bestOf: 3, finished: false } as IMatch;
        if (slotA && !slotB) { match.winner = slotA; match.finished = true; }
        else if (!slotA && slotB) { match.winner = slotB; match.finished = true; }
        matches.push(match);
      }
      for (let r = 2; r <= 4; r++) {
        const count = r === 2 ? 4 : r === 3 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          matches.push({ id: `${r}-${i}`, round: r, slotA: null, slotB: null, bestOf: r === 4 ? 5 : 3, finished: false } as IMatch);
        }
      }

      // advance pre-resolved winners into QF
      const r16 = matches.filter((m) => m.round === 1);
      const qf = matches.filter((m) => m.round === 2).sort((a, b) => a.id.localeCompare(b.id));
      r16.forEach((m, idx) => {
        if (m.finished && m.winner) {
          const target = Math.floor(idx / 2);
          const qm = qf[target];
          if (!qm.slotA) qm.slotA = m.winner;
          else if (!qm.slotB) qm.slotB = m.winner;
        }
      });

      t.matches = matches;
      t.status = 'ongoing';
      await t.save();
      results.push({ id: t._id as unknown as string, action: 'started', players: activePlayers.length });
    } catch (e) {
      results.push({ id: t._id as unknown as string, action: 'error', error: String(e) });
    }
  }

  return NextResponse.json({ processed: results });
}

export const dynamic = 'force-dynamic';
