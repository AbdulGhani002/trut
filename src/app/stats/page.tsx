"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

export default function StatsPage() {
  const { data: session, status } = useSession();
  type Stats = {
    name: string;
    email: string;
    tokens: number;
    gamesPlayed: number;
    wins: number;
    losses: number;
    winRate: number;
  };
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      try {
        const res = await fetch("/api/user/stats", { credentials: "same-origin" });
        if (res.ok) {
          setStats(await res.json());
        } else {
          setStats(null);
        }
      } catch {
        setStats(null);
      }
      setLoading(false);
    }
    fetchStats();
  }, []);

  if (status === "loading" || loading) {
    return <div className="flex items-center justify-center h-screen"><p>Loading stats...</p></div>;
  }
  if (!session) {
    return <div className="flex items-center justify-center h-screen"><p>Please log in to view your stats.</p></div>;
  }
  if (!stats) {
    return <div className="flex items-center justify-center h-screen"><p>Could not load stats.</p></div>;
  }

  return (
    <div className="max-w-xl mx-auto mt-10 p-6 glass-panel rounded-lg">
      <h2 className="text-3xl font-bold mb-4">Your Statistics</h2>
      <div className="space-y-3">
        <div><span className="font-semibold">Name:</span> {stats.name}</div>
        <div><span className="font-semibold">Email:</span> {stats.email}</div>
        <div><span className="font-semibold">Tokens:</span> {stats.tokens}</div>
        <div><span className="font-semibold">Games Played:</span> {stats.gamesPlayed}</div>
        <div><span className="font-semibold">Wins:</span> {stats.wins}</div>
        <div><span className="font-semibold">Losses:</span> {stats.losses}</div>
        <div><span className="font-semibold">Win Rate:</span> {stats.winRate}%</div>
      </div>
    </div>
  );
}
