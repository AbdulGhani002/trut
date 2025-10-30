"use client";
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ITournament, ITournamentPlayer, IMatch } from '@shared/models/Tournament';
import { useSession } from 'next-auth/react';

export default function TournamentDetail() {
  const params = useParams();
  const id = params.id;
  const router = useRouter();
  const { data: session } = useSession();
  const [tournament, setTournament] = useState<ITournament | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async function fetchTournament() {
      const res = await fetch(`/api/tournaments/${id}`);
      if (!mounted) return;
      if (res.ok) {
        const json = await res.json();
        setTournament(json.tournament as ITournament);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  const join = async () => {
    setLoading(true);
    await fetch('/api/tournaments/join', { method: 'POST', body: JSON.stringify({ tournamentId: id }), headers: { 'Content-Type': 'application/json' } });
    const res = await fetch(`/api/tournaments/${id}`);
    if (res.ok) setTournament((await res.json()).tournament as ITournament);
    setLoading(false);
  };

  const checkin = async () => {
    setLoading(true);
    await fetch('/api/tournaments/checkin', { method: 'POST', body: JSON.stringify({ tournamentId: id }), headers: { 'Content-Type': 'application/json' } });
    const res = await fetch(`/api/tournaments/${id}`);
    if (res.ok) setTournament((await res.json()).tournament as ITournament);
    setLoading(false);
  };

  const start = async () => {
    if (!confirm('Start tournament? This will mark non-checked-in players as forfeited.')) return;
    setLoading(true);
    await fetch('/api/tournaments/start', { method: 'POST', body: JSON.stringify({ tournamentId: id }), headers: { 'Content-Type': 'application/json' } });
    const res = await fetch(`/api/tournaments/${id}`);
    if (res.ok) setTournament((await res.json()).tournament as ITournament);
    setLoading(false);
  };

  const report = async (matchId: string, winnerId: string) => {
    setLoading(true);
    await fetch('/api/tournaments/report-result', { method: 'POST', body: JSON.stringify({ tournamentId: id, matchId, winnerId }), headers: { 'Content-Type': 'application/json' } });
    const res = await fetch(`/api/tournaments/${id}`);
    if (res.ok) setTournament((await res.json()).tournament as ITournament);
    setLoading(false);
  };

  if (!tournament) return <div className="p-6">Loading...</div>;

  const imOwner = session?.user?.id === tournament.ownerId;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">{tournament.name}</h1>
        <div>
          <button onClick={() => router.push('/tournaments')} className="px-3 py-2 rounded bg-gray-700 mr-2">Back</button>
          {imOwner && tournament.status !== 'ongoing' && (
            <button onClick={start} className="px-3 py-2 rounded bg-red-600 text-white">Start</button>
          )}
        </div>
      </div>

      <div className="glass-panel p-4 mb-4">
        <div>Buy-in: {tournament.buyIn} tokens • Prize pool: {tournament.prizePool}</div>
        <div>Status: {tournament.status}</div>
        <div>Players: {tournament.players?.length}/{tournament.maxPlayers}</div>
      </div>

      <div className="grid gap-3">
        {tournament.players?.map((p: ITournamentPlayer) => (
          <div key={p.userId} className="p-3 glass-panel flex justify-between">
            <div>
              <div className="font-semibold">{p.name}</div>
              <div className="text-sm text-white/60">{p.email} {p.checkedIn ? '• Checked-in' : ''} {p.eliminated ? '• Forfeited' : ''}</div>
            </div>
            <div>
              {!p.eliminated && !p.checkedIn && session?.user?.email === p.email && (
                <button onClick={checkin} className="px-3 py-1 rounded bg-emerald-600 text-white">Check-in</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-6 text-xl font-semibold">Matches</h2>
      <div className="grid gap-2 mt-2">
        {tournament.matches?.map((m: IMatch) => (
          <div key={m.id} className="p-3 glass-panel flex justify-between items-center">
            <div>
              <div>Round: {m.round}</div>
              <div className="text-sm">{m.slotA || 'TBD'} vs {m.slotB || 'TBD'}</div>
              <div className="text-sm">Best of: {m.bestOf}</div>
            </div>
            <div>
              {m.finished ? <div className="text-green-400">Finished • Winner: {m.winner}{m.isBronze ? ' (bronze)' : ''}</div> : (
                <>
                  {(imOwner || session?.user?.id === m.slotA || session?.user?.id === m.slotB) && (
                    <>
                      {m.slotA && <button onClick={() => { if (confirm('Report win for this player?')) report(m.id, m.slotA as string); }} className="mr-2 px-3 py-1 rounded bg-blue-600 text-white">Set {m.slotA} Winner</button>}
                      {m.slotB && <button onClick={() => { if (confirm('Report win for this player?')) report(m.id, m.slotB as string); }} className="px-3 py-1 rounded bg-blue-600 text-white">Set {m.slotB} Winner</button>}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <button onClick={join} disabled={loading} className="px-4 py-2 rounded bg-indigo-600 text-white">Join</button>
        <button onClick={checkin} disabled={loading} className="ml-2 px-4 py-2 rounded bg-emerald-600 text-white">Check-in</button>
      </div>
    </div>
  );
}
