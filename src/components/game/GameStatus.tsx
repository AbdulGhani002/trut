"use client";
import React from 'react';
import { TrutGameState, Player } from '../../../shared/types/game';

interface GameStatusProps {
  gameState: TrutGameState;
  myPlayerId: string | null;
  players: Player[];
  myTeam: 'team1' | 'team2';
  isMyTurn: boolean;
  lastChallengeMessage?: string | null;
}

export default function GameStatus({ gameState, myPlayerId, players, myTeam, isMyTurn, lastChallengeMessage }: GameStatusProps) {
  const getStatusMessage = () => {
    // Show challenge message if available (highest priority)
    if (lastChallengeMessage) {
      return lastChallengeMessage;
    }
    
    // Challenge response phase
    if (gameState.awaitingChallengeResponse) {
      const trutingPlayerName = players.find(p => p.id === gameState.trutingPlayer)?.name || 'Player';
      const currentRespondentName = players.find(p => p.id === gameState.challengeRespondent)?.name || 'Player';
      
      if (gameState.challengeRespondent === myPlayerId) {
        return `⚡ ${trutingPlayerName} called TRUT! Your decision: Accept or Fold?`;
      } else if (gameState.challengeRespondents?.includes(myPlayerId || '')) {
        return `⏳ Waiting for ${currentRespondentName} to respond to ${trutingPlayerName}'s TRUT...`;
      } else {
        return `⏳ ${trutingPlayerName} called TRUT! Waiting for opponents to respond...`;
      }
    }
    
    // Challenge resolution phase
    if (gameState.phase === 'truting') {
      if (gameState.challengeAccepted) {
        return '✅ Challenge Accepted! Playing for Long Point!';
      } else {
        return '❌ Challenge Folded! Starting new round...';
      }
    }
    
    // Game end
    if (gameState.gameEnded) {
      const winnerTeam = gameState.winner;
      const isMyTeam = (winnerTeam === 'team1' && myTeam === 'team1') || (winnerTeam === 'team2' && myTeam === 'team2');
      return isMyTeam ? '🎉 You Won the Game!' : '💀 Game Over - Opponent Won';
    }
    
    // Normal gameplay
    if (isMyTurn) {
      return gameState.phase === 'playing' ? '🎯 Your Turn - Play a card' : '⚡ Your action required...';
    } else {
      const currentPlayerName = players.find(p => p.id === gameState.currentPlayer)?.name || 'Player';
      return `⏳ Waiting for ${currentPlayerName}...`;
    }
  };

  const getIndicatorColor = () => {
    if (gameState.awaitingChallengeResponse) {
      if (gameState.challengeRespondent === myPlayerId) {
        return 'bg-yellow-400'; // Your turn to respond
      } else {
        return 'bg-orange-400'; // Waiting for others
      }
    }
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
