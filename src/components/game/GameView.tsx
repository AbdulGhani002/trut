"use client";
import React, { useMemo, useState } from 'react';
import { useMultiplayerStore } from '@/lib/multiplayer/store';
import GameHeader from './GameHeader';
import ScorePanel from './ScorePanel';
import GameStatus from './GameStatus';
import GameTable from './GameTable';
import PlayerHand from './PlayerHand';
import GameEndScreen from './GameEndScreen';
import { Card, Player } from '../../../shared/types/game';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function GameView() {
  const { gameState, myPlayerId, leaveGame, currentRoom } = useMultiplayerStore();
  const [confirmOpen, setConfirmOpen] = useState(false);
  
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

  const getTeamForPlayer = (playerId: string) => {
    const playerIndex = players.findIndex(p => p.id === playerId);
    return playerIndex === 0 ? 'team1' : 'team2';
  };

    const myTeam = getTeamForPlayer(myPlayerId || '') as 'team1' | 'team2';
    const opponentTeam = getTeamForPlayer(opponent?.id || '') as 'team1' | 'team2';

    const gameScores = gameState.scores || { team1: { truts: 0, cannets: 0 }, team2: { truts: 0, cannets: 0 } };
    const myScore = gameScores[myTeam];
    const opponentScore = gameScores[opponentTeam];

  // Calculate current round tricks won
  const trickWinners = gameState.trickWinners || [];
  const currentRoundTricks = {
    mine: trickWinners.filter((winner: string) => winner === myPlayerId).length,
    opponent: trickWinners.filter((winner: string) => winner === opponent?.id).length
  };

    return { myTeam, opponentTeam, myScore, opponentScore, currentRoundTricks };
  }, [myPlayerId, opponent?.id, players, gameState]);
  
  if (!gameState || !currentRoom) return null;

  const myHand = (gameState.hands?.[myPlayerId || ''] || []) as Card[];
  const currentTrick = gameState.currentTrick || [];
  const canPlay = gameState.currentPlayer === myPlayerId && gameState.phase === 'playing';
  const isMyTurn = gameState.currentPlayer === myPlayerId;


  const handleLeaveGame = () => {
    setConfirmOpen(true);
  };

  const handleConfirmLeave = () => {
    setConfirmOpen(false);
    const success = leaveGame();
    if (!success) {
      alert('Failed to leave the game. You may be disconnected from the server. Please refresh the page to reconnect.');
    }
  };

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
            myPlayer={myPlayer}
            opponent={opponent}
            myTeam={myTeam}
            opponentTeam={opponentTeam}
            currentRoundTricks={currentRoundTricks}
          />

          {/* Game Content - Right Side */}
          <div className="lg:col-span-3">
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

            {/* Turn Indicator */}
            {!gameState.gameEnded && !canPlay && gameState.phase === 'playing' && (
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