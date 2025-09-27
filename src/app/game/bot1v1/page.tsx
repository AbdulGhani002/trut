"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import GameHeader from "@/components/game/GameHeader";
import GameStatus from "@/components/game/GameStatus";
import GameTable from "@/components/game/GameTable";
import PlayerHand from "@/components/game/PlayerHand";
import GameEndScreen from "@/components/game/GameEndScreen";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import ScorePanel from "@/components/game/ScorePanel";
import { useMultiplayerStore } from "@/lib/multiplayer/store";

export default function Bot1v1Page() {
  const store = useMultiplayerStore();
  const router = useRouter();
  const hasJoined = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!store.socket) {
      store.connect();
    }
  }, [store]);

  useEffect(() => {
    if (
      store.socket &&
      store.connectionStatus.status === "connected" &&
      !hasJoined.current &&
      !store.currentRoom
    ) {
      hasJoined.current = true;
      store.joinBotMatch();
    }
  }, [store.socket, store.connectionStatus.status, store.currentRoom, store.joinBotMatch]);

  const gameState = store.gameState;
  const myPlayerId = store.myPlayerId;
  const currentRoom = store.currentRoom;

  const players = useMemo(() => currentRoom?.players || [], [currentRoom?.players]);
  const myPlayer = useMemo(() => players.find((p) => p.id === myPlayerId), [players, myPlayerId]);
  const botPlayer = useMemo(() => players.find((p) => p.isBot), [players]);

  const myTeam = myPlayer?.team || "team1";
  const botTeam = botPlayer?.team || "team2";
  const myHand = (gameState?.hands?.[myPlayerId || ""] || []);
  const currentTrick = gameState?.currentTrick || [];
  const canPlay = gameState?.currentPlayer === myPlayerId && gameState.phase === "playing";

  // Round tricks for score panel
  const trickWinners = gameState?.trickWinners || [];
  const currentRoundTricks = {
    mine: trickWinners.filter((winner: string) => winner === (myPlayerId || "")).length,
    opponent: trickWinners.filter((winner: string) => winner === (botPlayer?.id || "")).length,
  };

  const handleLeave = () => setConfirmOpen(true);
  const confirmLeave = () => {
    setConfirmOpen(false);
    store.leaveGame();
    router.push("/");
  };

  if (!gameState || !currentRoom) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="glass-panel p-6 text-center">
          <div className="animate-spin h-10 w-10 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p>Setting up your match against the bot…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <ConfirmDialog
        open={confirmOpen}
        title="Leave Match"
        message="Do you want to leave the bot match?"
        confirmText="Leave"
        cancelText="Stay"
        onConfirm={confirmLeave}
        onCancel={() => setConfirmOpen(false)}
      />

      <GameHeader currentRoom={currentRoom} onLeaveGame={handleLeave} />

      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <ScorePanel
            scores={gameState.scores}
            myPlayer={myPlayer}
            opponent={botPlayer}
            myTeam={myTeam}
            opponentTeam={botTeam}
            currentRoundTricks={currentRoundTricks}
          />

          <div className="lg:col-span-3">
            <GameStatus
              gameState={gameState}
              myPlayerId={myPlayerId}
              players={players}
              myTeam={myTeam}
              isMyTurn={canPlay}
              lastChallengeMessage={store.lastChallengeMessage}
            />

            <GameTable currentTrick={currentTrick} myPlayerId={myPlayerId} />

            <PlayerHand
              myHand={myHand}
              gameState={gameState}
              myPlayerId={myPlayerId}
              canPlay={canPlay}
            />

            <GameEndScreen
              gameState={gameState}
              myTeam={myTeam}
              myScore={gameState.scores[myTeam]}
              opponentScore={gameState.scores[botTeam]}
              onLeaveGame={handleLeave}
            />

            {/* Challenge Response Message */}
            {store.lastChallengeMessage && (
              <div className="mt-4 text-center">
                <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-orange-600/80 text-white font-semibold shadow-lg">
                  <div className="w-2 h-2 rounded-full bg-orange-300 animate-pulse"></div>
                  {store.lastChallengeMessage}
                </div>
              </div>
            )}

            {!gameState.gameEnded && !canPlay && gameState.phase === "playing" && !store.lastChallengeMessage && (
              <div className="mt-4 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-700/50 text-white/70">
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
                  Waiting for opponent&apos;s move...
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
