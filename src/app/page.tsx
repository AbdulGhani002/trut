"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useMultiplayerStore } from "@/lib/multiplayer/store";
import { logout } from "./actions";

const GameView = dynamic(() => import("@/components/game/GameView"), { ssr: false });

export default function Home() {
  const store = useMultiplayerStore();
  const [tokens, setTokens] = useState<number>(1000);
  const [nameInput, setNameInput] = useState<string>("");

  // Connect once on mount
  useEffect(() => {
    if (!store.socket) {
      store.connect().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connected = store.connectionStatus.status === 'connected';

  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('playerName') : null;
      if (saved) {
        setNameInput(saved);
        store.setPlayerName(saved);
      }
    } catch {}
  }, [store]);

  // Fallback: hydrate name from cookie if localStorage is empty (after login redirect)
  useEffect(() => {
    try {
      if (typeof document === 'undefined') return;
      const hasLocal = localStorage.getItem('playerName');
      const match = document.cookie.match(/(?:^|; )playerName=([^;]+)/);
      const cookieVal = match ? decodeURIComponent(match[1]) : '';
      
      // Always update from cookie if it exists and is different from current store value
      if (cookieVal && cookieVal !== store.playerName) {
        localStorage.setItem('playerName', cookieVal);
        setNameInput(cookieVal);
        store.setPlayerName(cookieVal);
      }
    } catch (e) {
      console.error('Error reading cookie:', e);
    }
  }, [store]);

  const handleFindMatch = useCallback(() => {
    if (!connected) return;
    if (store.matchmakingStatus === 'searching') {
      store.cancelMatchmaking();
      return;
    }
    setTokens((t) => Math.max(0, t - 100));
    store.startMatchmaking({
      playerId: store.myPlayerId || 'temp-player-id',
      gameMode: "1v1",
      timestamp: new Date()
    });
  }, [connected, store]);


  const tiles = useMemo(
    () => [
      {
        key: "bot",
        title: "You vs Bot",
        subtitle: "1v1 • 100 tokens",
        emoji: "⚡",
        gradient: "from-slate-800 to-slate-700",
        onClick: () => alert("Bot mode coming soon"),
      },
      {
        key: "realtime",
        title: "Realtime 1v1",
        subtitle: (() => {
          if (!connected) return "Connecting…";
          if (store.matchmakingStatus === 'searching') {
            return store.estimatedWaitTime 
              ? `Searching... (~${store.estimatedWaitTime}s)`
              : "Searching for opponent...";
          }
          if (store.matchmakingStatus === 'found') return "Match found! Starting...";
          return "Live player • 100 tokens";
        })(),
        emoji: store.matchmakingStatus === 'searching' ? "⏳" : store.matchmakingStatus === 'found' ? "✅" : "👑",
        gradient: store.matchmakingStatus === 'searching' ? "from-yellow-600 to-orange-600" : 
                 store.matchmakingStatus === 'found' ? "from-green-600 to-emerald-600" : 
                 "from-cyan-600 to-teal-600",
        onClick: handleFindMatch,
      },
      {
        key: "multi",
        title: "Multiplayer",
        subtitle: "Play online • Variable bet",
        emoji: "👥",
        gradient: "from-emerald-600 to-green-600",
        onClick: () => alert("Multiplayer lobby coming soon"),
      },
      {
        key: "tutorial",
        title: "Tutorial",
        subtitle: "Learn the rules",
        emoji: "📖",
        gradient: "from-fuchsia-600 to-purple-600",
        onClick: () => alert("Tutorial coming soon"),
      },
      {
        key: "shop",
        title: "Shop",
        subtitle: "Tokens and items",
        emoji: "🛒",
        gradient: "from-amber-600 to-yellow-600",
        onClick: () => alert("Shop coming soon"),
      },
      {
        key: "stats",
        title: "Statistics",
        subtitle: "Your performance",
        emoji: "📈",
        gradient: "from-blue-600 to-indigo-600",
        onClick: () => alert("Statistics coming soon"),
      },
    ], [connected, store.matchmakingStatus, store.estimatedWaitTime, handleFindMatch]
  );

  return (
    <div className="px-6 py-10 md:py-14">
      {!store.currentRoom && (
        <>
          <header className="text-center space-y-3 mb-8 md:mb-10">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight">TRUT</h1>
            <p className="text-sm md:text-base text-white/60">Bluff • Strategy • Psychology</p>
          </header>

          {store.matchmakingStatus === 'searching' && (
            <section className="max-w-4xl mx-auto glass-panel p-6 mb-8 text-center">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-400"></div>
                <h3 className="text-lg font-semibold text-yellow-400">Searching for Opponent</h3>
              </div>
              <p className="text-white/70 mb-4">
                {store.estimatedWaitTime 
                  ? `Estimated wait time: ~${store.estimatedWaitTime} seconds`
                  : "Looking for another player to join your game..."
                }
              </p>
              <button
                onClick={() => store.cancelMatchmaking()}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 transition text-white font-semibold"
              >
                Cancel Search
              </button>
            </section>
          )}

          {store.matchmakingStatus === 'found' && (
            <section className="max-w-4xl mx-auto glass-panel p-6 mb-8 text-center">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="text-green-400 text-2xl">✅</div>
                <h3 className="text-lg font-semibold text-green-400">Match Found!</h3>
              </div>
              <p className="text-white/70">
                Opponent found! Starting game...
              </p>
            </section>
          )}

          <section className="max-w-4xl mx-auto glass-panel p-4 md:p-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-orange-500 to-red-500 grid place-items-center text-white text-xl">🎯</div>
              <div>
                <div className="text-white/90 font-semibold leading-tight">{store.playerName || 'Guest'}</div>
                <div className="text-xs text-white/50">👑 Level 1</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="px-3 py-1.5 rounded-full bg-fuchsia-600 hover:bg-fuchsia-500 transition text-sm font-semibold shadow-lg"
                onClick={() => setTokens((t) => t + 100)}
              >
                Free Tokens
              </button>
              <form action={logout}>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 transition text-sm font-semibold shadow-lg"
                  title="Logout and return to login page"
                  onClick={(e) => {
                    if (!confirm('Are you sure you want to logout? You will need to enter your name again.')) {
                      e.preventDefault();
                    }
                  }}
                >
                  Logout
                </button>
              </form>
              <div className="text-right">
                <div className="font-bold">{tokens}</div>
                <div className="text-xs text-white/50">Virtual Tokens</div>
              </div>
            </div>
          </section>

          <section className="max-w-5xl mx-auto mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {tiles.slice(0, 5).map((tile) => (
              <button
                key={tile.key}
                onClick={tile.onClick}
                disabled={tile.key === "realtime" && !connected}
                className="group text-left glass-panel p-5 hover:-translate-y-0.5 transition transform"
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
            {/* Statistics tile spanning full width on large row */}
            <button
              onClick={tiles[5].onClick}
              className="group text-left glass-panel p-5 hover:-translate-y-0.5 transition transform sm:col-span-2 lg:col-span-3"
            >
              <div className="flex items-center gap-4">
                <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${tiles[5].gradient} grid place-items-center text-xl shadow-lg`}>
                  <span>{tiles[5].emoji}</span>
                </div>
                <div>
                  <div className="font-semibold text-lg">{tiles[5].title}</div>
                  <div className="text-sm text-white/60">{tiles[5].subtitle}</div>
                </div>
              </div>
            </button>
          </section>
        </>
      )}

      {store.currentRoom && (
        <>
          {!store.gameState && (
            <div className="max-w-4xl mx-auto mt-8">
              <div className="glass-panel p-6 text-center">
                <div className="mb-4">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600/20 border border-blue-500/30 text-blue-400 mb-4">
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
                    <span className="font-medium">In Lobby</span>
                  </div>
                </div>
                <div className="text-white/70 mb-2">
                  <span className="font-semibold">Room:</span> <code className="px-2 py-1 rounded bg-white/10 text-sm">{store.currentRoom.id.slice(-8)}</code>
                </div>
                <div className="text-white/60">
                  Players {store.currentRoom.players.length}/{store.currentRoom.maxPlayers} • Waiting for game start…
                </div>
              </div>
            </div>
          )}
          {store.gameState && <GameView />}
        </>
      )}
    </div>
  );
}
