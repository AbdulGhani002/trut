"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMultiplayerStore } from "@/lib/multiplayer/store";
import { useSession, signOut } from "next-auth/react";

const GameView = dynamic(() => import("@/components/game/GameView"), { ssr: false });

export default function Home() {
  const router = useRouter();
  const store = useMultiplayerStore();
  const { data: session, status } = useSession();
  const [tokens, setTokens] = useState<number | null>(null);
  const setPlayerName = useMultiplayerStore((s) => s.setPlayerName);

  useEffect(() => {
    async function fetchTokens() {
      if (status === 'authenticated') {
        try {
          const res = await fetch('/api/user/stats', { credentials: 'same-origin' });
          if (res.ok) {
            const data = await res.json();
            setTokens(data.tokens);
          }
        } catch {}
      }
    }
    fetchTokens();
  }, [status]);

  // Handle session loading and authentication
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
    if (status === 'authenticated' && session?.user?.name) {
      setPlayerName(session.user.name);
    }
  }, [status, router, session, setPlayerName]);

  // Connect socket once authenticated
  useEffect(() => {
    if (status === 'authenticated' && !store.socket) {
      store.connect().catch(() => {});
    }
  }, [status, store.connect, store.socket]);

  // Only one useEffect for fetching tokens

  const handle2v2Click = useCallback(() => {
    router.push('/game/2v2');
  }, [router]);

  const handleBotClick = useCallback(() => {
    router.push('/game/bot1v1');
  }, [router]);

  const handleTournamentClick = useCallback(() => {
    router.push('/tournaments');
  }, [router]);

  const handleLogout = useCallback(async () => {
    if (confirm('Are you sure you want to logout?')) {
      store.disconnect();
      await signOut({ redirect: true, callbackUrl: '/login' });
    }
  }, [store]);

  const tiles = useMemo(
    () => [
      {
        key: "bot",
        title: "You vs Bot",
        subtitle: "Practice against AI • Free",
        emoji: "🤖",
        gradient: "from-slate-800 to-slate-700",
        onClick: handleBotClick,
      },
      {
        key: "2v2",
        title: "2v2 Match",
        subtitle: "Team up • Quick match",
        emoji: "🤝",
        gradient: "from-green-600 to-emerald-500",
        onClick: handle2v2Click,
      },
      {
        key: "tournament",
        title: "Tournament Mode",
        subtitle: "Classic 16-player • 200 tokens",
        emoji: (
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-6 h-6">
            <path d="M12 2c.55 0 1 .45 1 1v1h2.5A2.5 2.5 0 0 1 18 6.5V8c0 1.66-1.34 3-3 3H9c-1.66 0-3-1.34-3-3V6.5A2.5 2.5 0 0 1 8.5 4H11V3c0-.55.45-1 1-1z" fill="#F59E0B" />
            <path d="M7 10v2a5 5 0 0 0 5 5v5h2v-5a5 5 0 0 0 5-5v-2H7z" fill="#D97706" />
          </svg>
        ),
        gradient: "from-yellow-600 to-amber-500",
        onClick: handleTournamentClick,
  },
      {
        key: "tutorial",
        title: "Tutorial",
        subtitle: "Learn the rules",
        emoji: "📖",
        gradient: "from-fuchsia-600 to-purple-600",
        onClick: () => router.push('/tutorial'),
      },
      {
        key: "shop",
        title: "Shop",
        subtitle: "Tokens and items",
        emoji: "🛒",
        gradient: "from-amber-600 to-yellow-600",
        onClick: () => router.push('/shop'),
      },
      {
        key: "stats",
        title: "Statistics",
        subtitle: "Your performance",
        emoji: "📈",
        gradient: "from-blue-600 to-indigo-600",
        onClick: () => router.push('/stats'),
      },
    ],
    [handle2v2Click, handleBotClick, handleTournamentClick, router]
  );
  
  const inGame = useMemo(() => store.currentRoom || store.gameState, [store.currentRoom, store.gameState]);


  if (status === 'loading' || !session) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Loading...</p>
      </div>
    );
  }
  
  if (inGame) {
    return <GameView />;
  }

  return (
    <div className="px-6 py-10 md:py-14">
          <header className="text-center space-y-3 mb-8 md:mb-10">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight">TRUT</h1>
            <p className="text-sm md:text-base text-white/60">Bluff • Strategy • Psychology</p>
          </header>

          <section className="max-w-4xl mx-auto glass-panel p-4 md:p-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-orange-500 to-red-500 grid place-items-center text-white text-xl">🎯</div>
              <div>
                <div className="text-white/90 font-semibold leading-tight">{session.user.name || 'Guest'}</div>
                <div className="text-xs text-white/50">👑 Level 1</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="px-3 py-1.5 rounded-full bg-fuchsia-600 hover:bg-fuchsia-500 transition text-sm font-semibold shadow-lg"
                onClick={() => alert("This will be implemented later.")}
              >
                Free Tokens
              </button>
              <div className="text-right">
                <div className="font-bold">{tokens ?? '...'}</div>
                <div className="text-xs text-white/50">Virtual Tokens</div>
              </div>
            </div>
          </section>

          <section className="max-w-5xl mx-auto mt-8 grid grid-cols-2 lg:grid-cols-3 gap-5">
            {tiles.map((tile) => (
              <button
                key={tile.key}
                onClick={tile.onClick}
                disabled={false}
                className="group text-left glass-panel p-5 hover:-translate-y-0.5 transition transform disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${tile.gradient} grid place-items-center text-xl shadow-lg`}>
                  <span>{tile.emoji}</span>
                </div>
                <div className="mt-4">
                  <div className="font-semibold text-lg">{tile.title}</div>
                  <div className="text-sm text-white/60">{tile.subtitle}</div>
                </div>
              </button>
            ))}
          </section>

          <section className="max-w-5xl mx-auto mt-8 flex justify-center">
            <button
              onClick={handleLogout}
              className="px-6 py-3 rounded-lg bg-red-600 hover:bg-red-500 transition text-white font-semibold shadow-lg"
              title="Logout and return to login page"
            >
              Logout
            </button>
          </section>
    </div>
  );
}
