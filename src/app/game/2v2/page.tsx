"use client";
//
export const dynamic = 'force-dynamic';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMultiplayerStore } from '@/lib/multiplayer/store';
import GameTable2v2 from '@/components/game/GameTable2v2';
import PlayerHand from '@/components/game/PlayerHand';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

// Helper to find next non-"rotten" winner near a given index
function findNextNonRottenWinner(trickWinners: string[], rottenIndex: number): string | null {
  for (let i = rottenIndex + 1; i < trickWinners.length; i++) {
    if (trickWinners[i] !== 'rotten') {
      return trickWinners[i];
    }
  }
  for (let i = rottenIndex - 1; i >= 0; i--) {
    if (trickWinners[i] !== 'rotten') {
      return trickWinners[i];
    }
  }
  return null;
}

function Game2v2Inner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const store = useMultiplayerStore();
  const hasStartedMatchmaking = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showChallengeResolution, setShowChallengeResolution] = useState(false);

  const [gameData] = useState({
    betAmount: 300,
    teamMode: (searchParams?.get('teamMode') as 'solo' | 'team') || 'solo',
  });

  useEffect(() => {
    if (!store.socket) {
      store.connect();
    }
  }, [store]);

  useEffect(() => {
    if (
      store.socket &&
      store.connectionStatus.status === 'connected' &&
      store.matchmakingStatus === 'idle' &&
      !hasStartedMatchmaking.current
    ) {
      hasStartedMatchmaking.current = true;
      store.startMatchmaking({
        playerId: store.myPlayerId || '',
        gameMode: '2v2',
        playerName: store.playerName,
        betAmount: gameData.betAmount,
        teamMode: gameData.teamMode,
        timestamp: new Date(),
      });
    }
  }, [store.socket, store.connectionStatus.status, store.matchmakingStatus, store.myPlayerId, store.playerName, store.startMatchmaking, gameData.betAmount, gameData.teamMode]);

  const currentRoom = store.currentRoom;
  const gameState = store.gameState;
  const myPlayerId = store.myPlayerId;

  const players =
    currentRoom?.players || [
      { id: myPlayerId || 'player1', name: store.playerName || 'You', team: 'team1' as const, isReady: false, isConnected: true, socketId: '', joinedAt: new Date() },
      { id: 'player2', name: 'Opponent 1', team: 'team2' as const, isReady: false, isConnected: true, socketId: '', joinedAt: new Date() },
      { id: 'player3', name: 'Teammate', team: 'team1' as const, isReady: false, isConnected: true, socketId: '', joinedAt: new Date() },
      { id: 'player4', name: 'Opponent 2', team: 'team2' as const, isReady: false, isConnected: true, socketId: '', joinedAt: new Date() },
    ];

  const currentTrick = gameState?.currentTrick || [];
  const myHand = gameState?.hands?.[myPlayerId || ''] || [];
  const canPlay = gameState?.currentPlayer === myPlayerId && gameState?.phase === 'playing';

  const scores = gameState?.scores || { team1: { truts: 0, cannets: 0 }, team2: { truts: 0, cannets: 0 } };

  // Compute tricks won by each team; treat 'rotten' as the next non-rotten winner
  const trickWinners = gameState?.trickWinners || [];
  const teamTricks = { team1: 0, team2: 0 } as { team1: number; team2: number };
  for (let i = 0; i < trickWinners.length; i++) {
    const w = trickWinners[i];
    const winnerId = w === 'rotten' ? findNextNonRottenWinner(trickWinners, i) : w;
    if (!winnerId) continue;
    const winnerPlayer = players.find((p) => p.id === winnerId);
    if (winnerPlayer?.team === 'team1') teamTricks.team1++;
    else if (winnerPlayer?.team === 'team2') teamTricks.team2++;
  }


  const isWaiting =
    store.connectionStatus.status !== 'connected' || store.matchmakingStatus === 'searching' || (!currentRoom && hasStartedMatchmaking.current);

  const handleLeaveGame = () => {
    setConfirmOpen(true);
  };

  useEffect(() => {
    if (gameState?.phase === 'truting' && !gameState?.awaitingChallengeResponse) {
      setShowChallengeResolution(true);
      const timer = setTimeout(() => {
        setShowChallengeResolution(false);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setShowChallengeResolution(false);
    }
  }, [gameState?.phase, gameState?.awaitingChallengeResponse]);

  if (isWaiting) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
        <ConfirmDialog
          open={confirmOpen}
          title="Leave Match"
          message="Are you sure you want to leave the game?"
          confirmText="Leave"
          cancelText="Stay"
          onConfirm={() => {
            setConfirmOpen(false);
            if (store.matchmakingStatus === 'searching') {
              store.cancelMatchmaking();
            }
            store.leaveGame();
            router.push('/');
          }}
          onCancel={() => setConfirmOpen(false)}
        />
        <div className="glass-panel p-8 max-w-md w-full text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold text-white mb-2">Finding Match...</h2>
          <p className="text-white/70 mb-4">Looking for {gameData.teamMode === 'solo' ? 'players' : 'team opponents'} for 2v2 match</p>
          <div className="text-sm text-white/60 mb-4">Fixed Bet: {gameData.betAmount} tokens • Prize Pool: {gameData.betAmount * 4} tokens</div>
          {store.estimatedWaitTime && <div className="text-sm text-white/60 mb-4">Estimated wait: {store.estimatedWaitTime}s</div>}
          <button
            onClick={() => {
              store.cancelMatchmaking();
              router.push('/');
            }}
            className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <ConfirmDialog
        open={confirmOpen}
        title="Leave Match"
        message="Are you sure you want to leave the game?"
        confirmText="Leave"
        cancelText="Stay"
        onConfirm={() => {
          setConfirmOpen(false);
          if (store.matchmakingStatus === 'searching') {
            store.cancelMatchmaking();
          }
          store.leaveGame();
          router.push('/');
        }}
        onCancel={() => setConfirmOpen(false)}
      />
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="glass-panel p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={handleLeaveGame} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 transition text-white font-semibold shadow-lg text-sm">
                Leave Game
              </button>
              <div>
                <h1 className="text-2xl font-bold text-white">2v2 Match</h1>
                <p className="text-white/70 text-sm">
                  Bet: {gameData.betAmount} tokens • Mode: {gameData.teamMode === 'solo' ? 'Solo Queue' : 'Team Match'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-yellow-400">{gameData.betAmount * 4} tokens</div>
              <div className="text-xs text-white/60">Prize Pool</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar - Team Info & Scoring */}
          <div className="lg:col-span-1 space-y-4">
            {/* Team Alpha (Your Team) */}
            <div className="glass-panel p-5 border-l-4 border-blue-500 bg-gradient-to-r from-blue-500/10 to-transparent">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-3 h-3 rounded-full bg-blue-500 shadow-lg"></div>
                <h3 className="text-lg font-bold text-blue-400">Team Alpha</h3>
                <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded-full">Your Team</span>
              </div>

              <div className="space-y-2 mb-4">
                {players
                  .filter((p) => (p.team || 'team1') === 'team1')
                  .map((player) => (
                    <div
                      key={player.id}
                      className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                        player.id === myPlayerId
                          ? 'bg-blue-500/20 border border-blue-500/30 shadow-md'
                          : 'bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      <div
                        className={`w-2 h-2 rounded-full ${
                          player.id === myPlayerId ? 'bg-blue-400' : 'bg-white/40'
                        }`}
                      ></div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">{player.name || 'Player'}</div>
                        <div className="text-xs text-white/50">{player.id === myPlayerId ? 'You' : 'Teammate'}</div>
                      </div>
                      <div className={`text-xs ${player.isConnected ? 'text-green-300' : 'text-red-300'}`}>
                        {player.isConnected ? 'Online' : 'Offline'}
                      </div>
                    </div>
                  ))}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-white/5 p-3">
                  <div className="text-white/60">Tricks</div>
                  <div className="text-white font-semibold">{teamTricks.team1}</div>
                </div>
                <div className="rounded-lg bg-white/5 p-3">
                  <div className="text-white/60">Score</div>
                  <div className="text-white font-semibold">{scores.team1.truts} / {scores.team1.cannets}</div>
                </div>
              </div>
            </div>

            {/* Team Beta (Opponents) */}
            <div className="glass-panel p-5 border-l-4 border-purple-500 bg-gradient-to-r from-purple-500/10 to-transparent">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-3 h-3 rounded-full bg-purple-500 shadow-lg"></div>
                <h3 className="text-lg font-bold text-purple-300">Team Beta</h3>
              </div>

              <div className="space-y-2 mb-4">
                {players
                  .filter((p) => (p.team || 'team2') === 'team2')
                  .map((player) => (
                    <div key={player.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10">
                      <div className="w-2 h-2 rounded-full bg-white/40"></div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">{player.name || 'Opponent'}</div>
                        <div className="text-xs text-white/50">Opponent</div>
                      </div>
                      <div className={`text-xs ${player.isConnected ? 'text-green-300' : 'text-red-300'}`}>
                        {player.isConnected ? 'Online' : 'Offline'}
                      </div>
                    </div>
                  ))}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-white/5 p-3">
                  <div className="text-white/60">Tricks</div>
                  <div className="text-white font-semibold">{teamTricks.team2}</div>
                </div>
                <div className="rounded-lg bg-white/5 p-3">
                  <div className="text-white/60">Score</div>
                  <div className="text-white font-semibold">{scores.team2.truts} / {scores.team2.cannets}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side Content */}
          <div className="lg:col-span-3">
            {gameState?.awaitingChallengeResponse && (
              <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-orange-500/20 to-red-500/20 border-2 border-orange-500/30">
                <div className="text-center">
                  <div className="text-2xl mb-2">⚡ TRUT CHALLENGE! ⚡</div>
                  <div className="text-white/90 font-semibold">
                    {players.find((p) => p.id === gameState.trutingPlayer)?.name || 'Player'} has called TRUT!
                  </div>
                  <div className="text-white/70 text-sm mt-1">
                    {gameState.challengeRespondent === myPlayerId
                      ? "It's your turn to respond - Accept or Fold?"
                      : `Waiting for ${players.find((p) => p.id === gameState.challengeRespondent)?.name || 'Player'} to respond...`}
                  </div>
                </div>
              </div>
            )}

            {showChallengeResolution && gameState && (
              <div
                className={`mb-6 p-4 rounded-xl border-2 ${
                  gameState.challengeAccepted
                    ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-green-500/30'
                    : 'bg-gradient-to-r from-red-500/20 to-pink-500/20 border-red-500/30'
                }`}
              >
                <div className="text-center">
                  <div className="text-2xl mb-2">{gameState.challengeAccepted ? '✅ CHALLENGE ACCEPTED!' : '❌ CHALLENGE FOLDED!'}</div>
                  <div className="text-white/90 font-semibold">
                    {gameState.challengeAccepted ? 'Playing for Long Point! The stakes are high!' : 'Starting new round...'}
                  </div>
                </div>
              </div>
            )}

            <GameTable2v2
              currentTrick={currentTrick}
              myPlayerId={myPlayerId}
              players={players.map((p) => ({ id: p.id, name: p.name, team: p.team || 'team1' }))}
            />

            {gameState && <PlayerHand myHand={myHand} gameState={gameState} myPlayerId={myPlayerId} canPlay={gameState.currentPlayer === myPlayerId} />}

            {store.lastChallengeMessage && (
              <div className="mt-4 text-center">
                <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-orange-600/80 text-white font-semibold shadow-lg">
                  <div className="w-2 h-2 rounded-full bg-orange-300 animate-pulse"></div>
                  {store.lastChallengeMessage}
                </div>
              </div>
            )}

            {!gameState?.gameEnded && !canPlay && gameState?.phase === 'playing' && !store.lastChallengeMessage && (
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

export default function Game2v2Page() {
  return (
    <Suspense fallback={<div className="p-6 text-white/70">Loading 2v2 game...</div>}>
      <Game2v2Inner />
    </Suspense>
  );
}
