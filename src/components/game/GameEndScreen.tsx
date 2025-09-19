"use client";
import React from 'react';
import { TrutGameState } from '../../../shared/types/game';

interface GameEndScreenProps {
  gameState: TrutGameState;
  myTeam: 'team1' | 'team2';
  myScore: { truts: number; cannets: number };
  opponentScore: { truts: number; cannets: number };
  onLeaveGame: () => void;
}

export default function GameEndScreen({ 
  gameState, 
  myTeam, 
  myScore, 
  opponentScore, 
  onLeaveGame 
}: GameEndScreenProps) {
  if (!gameState.gameEnded) return null;

  const winnerTeam = gameState.winner;
  const isMyTeam = (winnerTeam === 'team1' && myTeam === 'team1') || (winnerTeam === 'team2' && myTeam === 'team2');

  return (
    <div className="mt-6 text-center">
      <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
        <div className="text-3xl mb-3">
          {isMyTeam ? '🎉' : '😔'}
        </div>
        <h2 className={`text-2xl font-bold mb-2 ${
          isMyTeam ? 'text-green-400' : 'text-red-400'
        }`}>
          {isMyTeam ? 'Victory!' : 'Defeat'}
        </h2>
        <p className="text-white/70 mb-4">
          Final Score: {myScore.truts} - {opponentScore.truts} Long Points
        </p>
        <button
          onClick={onLeaveGame}
          className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all duration-200"
        >
          Return to Lobby
        </button>
      </div>
    </div>
  );
}
