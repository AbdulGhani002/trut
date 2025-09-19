"use client";
import React from 'react';
import { TrutGameState, Player } from '../../../shared/types/game';

interface GameStatusProps {
  gameState: TrutGameState;
  myPlayerId: string | null;
  players: Player[];
  myTeam: 'team1' | 'team2';
  isMyTurn: boolean;
}

export default function GameStatus({ gameState, myPlayerId, players, myTeam, isMyTurn }: GameStatusProps) {
  const getStatusMessage = () => {
    if (gameState.awaitingChallengeResponse) {
      const trutingPlayerName = players.find(p => p.id === gameState.trutingPlayer)?.name || 'Player';
      if (gameState.challengeRespondent === myPlayerId) {
        return `${trutingPlayerName} called TRUT! Accept or Fold?`;
      } else {
        return `Waiting for challenge response...`;
      }
    }
    
    if (gameState.phase === 'truting') {
      return 'Truting Phase - High Stakes!';
    }
    
    if (gameState.gameEnded) {
      const winnerTeam = gameState.winner;
      const isMyTeam = (winnerTeam === 'team1' && myTeam === 'team1') || (winnerTeam === 'team2' && myTeam === 'team2');
      return isMyTeam ? 'You Won the Game! 🎉' : 'Game Over - Opponent Won';
    }
    
    if (isMyTurn) {
      return gameState.phase === 'playing' ? 'Your Turn' : 'Your action required...';
    } else {
      return 'Waiting for opponent...';
    }
  };

  const getIndicatorColor = () => {
    if (gameState.phase === 'truting') return 'bg-orange-400';
    if (isMyTurn) return 'bg-green-400';
    return 'bg-slate-400';
  };

  return (
    <div className="mb-6 text-center">
      <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-slate-800/60 border border-white/10">
        <div className={`w-2 h-2 rounded-full ${getIndicatorColor()}`}></div>
        <span className="text-white font-medium">
          {getStatusMessage()}
        </span>
      </div>
    </div>
  );
}
