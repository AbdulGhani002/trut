"use client";
import { useCallback, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMultiplayerStore } from "@/lib/multiplayer/store";
import { useSession, signOut } from "next-auth/react";

const GameView = dynamic(() => import("@/components/game/GameView"), { ssr: false });

export default function Home() {
  const router = useRouter();
  const store = useMultiplayerStore();
  const { data: session, status } = useSession();
  const setPlayerName = useMultiplayerStore((s) => s.setPlayerName);

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

  const connected = store.connectionStatus.status === 'connected';

  const handle2v2Click = useCallback(() => {
    if (!connected) {
      alert('Not connected to server. Please wait...');
      return;
    }
    router.push('/game/2v2');
  }, [connected, router]);

  const handleBotClick = useCallback(() => {
    router.push('/game/bot1v1');
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
        key: "multi",
        title: "2v2 Realtime",
        subtitle: "Play with friends • 300 tokens",
        emoji: "👥",
        gradient: "from-emerald-600 to-green-600",
        onClick: handle2v2Click,
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
        onClick: () => alert("Statistics coming soon"),
      },
    ],
    [handle2v2Click, handleBotClick, router]
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
                <div className="font-bold">{session.user.tokens}</div>
                <div className="text-xs text-white/50">Virtual Tokens</div>
              </div>
            </div>
          </section>

          <section className="max-w-5xl mx-auto mt-8 grid grid-cols-2 lg:grid-cols-3 gap-5">
            {tiles.map((tile) => (
              <button
                key={tile.key}
                onClick={tile.onClick}
                disabled={!connected && (tile.key === 'multi' || tile.key === 'bot')}
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
