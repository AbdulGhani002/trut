"use client";
import React, { useMemo, useState } from 'react';
import { useMultiplayerStore } from '@/lib/multiplayer/store';
import GameHeader from './GameHeader';
import ScorePanel from './ScorePanel';
import GameStatus from './GameStatus';
import GameTable from './GameTable';
import PlayerHand from './PlayerHand';
import GameEndScreen from './GameEndScreen';
// types imported where needed; avoid unused imports here
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function GameView() {
  const { gameState, myPlayerId, leaveGame, currentRoom, lastChallengeMessage } = useMultiplayerStore();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showChallengeResolution, setShowChallengeResolution] = useState(false);
  
  // Get players (memoized to prevent dependency issues) - must be before early return
  const players = useMemo(() => currentRoom?.players || [], [currentRoom?.players]);
  const myPlayer = useMemo(() => players.find(p => p.id === myPlayerId), [players, myPlayerId]);
  const opponent = useMemo(() => players.find(p => p.id !== myPlayerId && !p.isBot), [players, myPlayerId]);

  // Determine teams and scores - must be before early return
  const { myTeam, opponentTeam, myScore, opponentScore, currentRoundTricks } = useMemo(() => {
    if (!gameState) {
      return {
        myTeam: 'team1' as const,
        opponentTeam: 'team2' as const,
        myScore: { truts: 0, cannets: 0 },
        opponentScore: { truts: 0, cannets: 0 },
        currentRoundTricks: { mine: 0, opponent: 0 }
      };
    }

  // Get team from player data (matches server's team assignment)
  const myTeam: 'team1' | 'team2' = myPlayer?.team === 'team2' ? 'team2' : 'team1';
  const opponentTeam: 'team1' | 'team2' = myTeam === 'team1' ? 'team2' : 'team1';

    const gameScores = gameState.scores || { team1: { truts: 0, cannets: 0 }, team2: { truts: 0, cannets: 0 } };
    const myScore = gameScores[myTeam];
    const opponentScore = gameScores[opponentTeam];

  // Calculate current round tricks won by teams (properly handle rotten tricks)
  const trickWinners: string[] = gameState.trickWinners || [];
  
  // Helper function to find next non-rotten winner (matches server logic)
  const findNextNonRottenWinner = (trickWinners: string[], rottenIndex: number): string | null => {
    // Look forward first
    for (let i = rottenIndex + 1; i < trickWinners.length; i++) {
      if (trickWinners[i] !== 'rotten') {
        return trickWinners[i];
      }
    }
    // Look backward if no forward winner
    for (let i = rottenIndex - 1; i >= 0; i--) {
      if (trickWinners[i] !== 'rotten') {
        return trickWinners[i];
      }
    }
    return null;
  };

  const currentRoundTricks = {
  mine: trickWinners.filter((winner) => {
      if (winner === 'rotten') {
        const rottenIndex = trickWinners.indexOf(winner);
        const nextWinner = findNextNonRottenWinner(trickWinners, rottenIndex);
        if (nextWinner) {
          const winnerPlayer = players.find(p => p.id === nextWinner);
          return winnerPlayer?.team === myTeam;
        }
        return false;
      }
      const winnerPlayer = players.find(p => p.id === winner);
      return winnerPlayer?.team === myTeam;
    }).length,
  opponent: trickWinners.filter((winner) => {
      if (winner === 'rotten') {
        const rottenIndex = trickWinners.indexOf(winner);
        const nextWinner = findNextNonRottenWinner(trickWinners, rottenIndex);
        if (nextWinner) {
          const winnerPlayer = players.find(p => p.id === nextWinner);
          return winnerPlayer?.team === opponentTeam;
        }
        return false;
      }
      const winnerPlayer = players.find(p => p.id === winner);
      return winnerPlayer?.team === opponentTeam;
    }).length
  };

    return { myTeam, opponentTeam, myScore, opponentScore, currentRoundTricks };
  }, [myPlayerId, opponent?.id, players, gameState]);
  
  const myHand = gameState?.hands?.[myPlayerId || ''] || [];
  const currentTrick = gameState?.currentTrick || [];
  const canPlay = gameState?.currentPlayer === myPlayerId && gameState?.phase === 'playing';
  const isMyTurn = gameState?.currentPlayer === myPlayerId;


  const handleLeaveGame = () => {
    setConfirmOpen(true);
  };

  // Show challenge resolution when phase changes; ensure hook is called unconditionally
  React.useEffect(() => {
    if (gameState?.phase === 'truting' && !gameState?.awaitingChallengeResponse) {
      setShowChallengeResolution(true);
      // Auto-hide after 3 seconds
      const timer = setTimeout(() => {
        setShowChallengeResolution(false);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setShowChallengeResolution(false);
    }
  }, [gameState?.phase, gameState?.awaitingChallengeResponse]);

  if (!gameState || !currentRoom) return null;
  const handleConfirmLeave = () => {
    setConfirmOpen(false);
    const success = leaveGame();
    if (!success) {
      alert('Failed to leave the game. You may be disconnected from the server. Please refresh the page to reconnect.');
    }
  };

  // (effect above already handles showing challenge resolution)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <ConfirmDialog
        open={confirmOpen}
        title="Leave Match"
        message="Are you sure you want to leave the game?"
        confirmText="Leave"
        cancelText="Stay"
        onConfirm={handleConfirmLeave}
        onCancel={() => setConfirmOpen(false)}
      />
      <GameHeader currentRoom={currentRoom} onLeaveGame={handleLeaveGame} />

      {/* Main Game Area */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <ScorePanel
            scores={gameState.scores}
            myTeam={myTeam}
            opponentTeam={opponentTeam}
            currentRoundTricks={currentRoundTricks}
            players={players}
          />

          {/* Game Content - Right Side */}
          <div className="lg:col-span-3">
            {/* Challenge Notification Banner */}
            {gameState.awaitingChallengeResponse && (
              <div className="mb-4 p-4 rounded-xl bg-gradient-to-r from-orange-500/20 to-red-500/20 border-2 border-orange-500/30">
                <div className="text-center">
                  <div className="text-2xl mb-2">⚡ TRUT CHALLENGE! ⚡</div>
                  <div className="text-white/90 font-semibold">
                    {players.find(p => p.id === gameState.trutingPlayer)?.name || 'Player'} has called TRUT!
                  </div>
                  <div className="text-white/70 text-sm mt-1">
                    {gameState.challengeRespondent === myPlayerId 
                      ? "It's your turn to respond - Accept or Fold?"
                      : `Waiting for ${players.find(p => p.id === gameState.challengeRespondent)?.name || 'Player'} to respond...`
                    }
                  </div>
                </div>
              </div>
            )}

            {/* Challenge Resolution Banner */}
            {showChallengeResolution && (
              <div className={`mb-4 p-4 rounded-xl border-2 ${
                gameState.challengeAccepted 
                  ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-green-500/30' 
                  : 'bg-gradient-to-r from-red-500/20 to-pink-500/20 border-red-500/30'
              }`}>
                <div className="text-center">
                  <div className="text-2xl mb-2">
                    {gameState.challengeAccepted ? '✅ CHALLENGE ACCEPTED!' : '❌ CHALLENGE FOLDED!'}
                  </div>
                  <div className="text-white/90 font-semibold">
                    {gameState.challengeAccepted 
                      ? 'Playing for Long Point! The stakes are high!'
                      : 'Starting new round...'
                    }
                  </div>
                  <div className="text-white/70 text-sm mt-1">
                    {gameState.challengeAccepted 
                      ? 'Winner gets a trut, loser loses all cannets!'
                      : 'Truting team gets a cannet point.'
                    }
                  </div>
                </div>
              </div>
            )}

            <GameStatus 
              gameState={gameState}
              myPlayerId={myPlayerId}
              players={players}
              myTeam={myTeam}
              isMyTurn={isMyTurn}
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
              myScore={myScore}
              opponentScore={opponentScore}
              onLeaveGame={handleLeaveGame}
            />

            {/* Challenge Response Message */}
            {lastChallengeMessage && (
              <div className="mt-4 text-center">
                <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-orange-600/80 text-white font-semibold shadow-lg">
                  <div className="w-2 h-2 rounded-full bg-orange-300 animate-pulse"></div>
                  {lastChallengeMessage}
                </div>
              </div>
            )}

            {/* Turn Indicator */}
            {!gameState.gameEnded && !canPlay && gameState.phase === 'playing' && !lastChallengeMessage && (
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