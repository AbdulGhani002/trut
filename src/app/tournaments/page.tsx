"use client";
import useSWR from 'swr';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ITournament } from '@shared/models/Tournament';
import { useSession } from 'next-auth/react';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function TournamentsPage() {
  const router = useRouter();
  const { data, error, mutate } = useSWR('/api/tournaments/list', fetcher);
  const { data: session } = useSession();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('Classic 16 Player');
  const [buyIn, setBuyIn] = useState<number>(200);

  if (error) return <div className="p-6">Failed to load</div>;
  if (!data) return <div className="p-6">Loading tournaments...</div>;

  const list = data.tournaments || [];

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) {
      router.push('/login');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/tournaments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, buyIn }),
        credentials: 'same-origin',
      });
      if (res.ok) {
        const json = await res.json();
        const t: ITournament = json.tournament;
        // refresh list and navigate to detail
        mutate();
        router.push(`/tournaments/${t._id as unknown as string}`);
      } else {
        const txt = await res.text();
        alert('Failed to create tournament: ' + txt);
      }
    } catch (err) {
      alert('Error creating tournament');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Tournaments</h1>

      <form onSubmit={create} className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} className="p-2 rounded bg-gray-800" />
        <input type="number" value={buyIn} onChange={(e) => setBuyIn(Number(e.target.value))} className="p-2 rounded bg-gray-800" />
        <div>
          <button type="submit" disabled={creating} className="px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-500">
            {creating ? 'Creating...' : 'Create Tournament'}
          </button>
        </div>
      </form>

      <div className="grid gap-4">
        {list.length === 0 && <div className="p-4 text-center text-white/60">No tournaments yet — create one above.</div>}
        {list.map((t: ITournament) => (
          <div key={t._id as unknown as string} className="glass-panel p-4 flex justify-between items-center">
            <div>
              <div className="font-semibold">{t.name}</div>
              <div className="text-sm text-white/60">Status: {t.status} • Players: {t.players?.length ?? 0}/{t.maxPlayers}</div>
            </div>
            <div>
              <Link href={`/tournaments/${t._id as unknown as string}`} className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500">View</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
