"use client";
import React from 'react';
import { TeamScores, Player } from '../../../shared/types/game';

interface ScorePanelProps {
  scores: TeamScores;
  myPlayer: Player | undefined;
  opponent: Player | undefined;
  myTeam: 'team1' | 'team2';
  opponentTeam: 'team1' | 'team2';
  currentRoundTricks: {
    mine: number;
    opponent: number;
  };
}

export default function ScorePanel({ 
  scores, 
  myPlayer, 
  opponent, 
  myTeam, 
  opponentTeam, 
  currentRoundTricks 
}: ScorePanelProps) {
  const myScore = scores[myTeam];
  const opponentScore = scores[opponentTeam];

  return (
    <div className="lg:col-span-1">
      <div className="bg-slate-800/40 backdrop-blur-sm rounded-2xl border border-white/10 p-4 sticky top-24">
        <h3 className="text-white font-bold text-lg mb-4 text-center">Game Score</h3>
        
        {/* My Score */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-full bg-blue-400"></div>
            <span className="text-white font-semibold">{myPlayer?.name || 'You'}</span>
          </div>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-white/70">Long Points (Truts):</span>
              <span className="text-amber-400 font-bold text-lg">{myScore.truts}/7</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/70">Small Points (Cannets):</span>
              <span className="text-blue-400 font-semibold">{myScore.cannets}/3</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/70">Round Tricks:</span>
              <span className="text-green-400 font-semibold">{currentRoundTricks.mine}/3</span>
            </div>
          </div>
        </div>

        {/* VS Divider */}
        <div className="flex items-center justify-center mb-6">
          <div className="h-px bg-white/20 flex-1"></div>
          <span className="px-3 text-white/50 text-sm font-medium">VS</span>
          <div className="h-px bg-white/20 flex-1"></div>
        </div>

        {/* Opponent Score */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-full bg-red-400"></div>
            <span className="text-white font-semibold">{opponent?.name || 'Opponent'}</span>
          </div>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-white/70">Long Points (Truts):</span>
              <span className="text-amber-400 font-bold text-lg">{opponentScore.truts}/7</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/70">Small Points (Cannets):</span>
              <span className="text-blue-400 font-semibold">{opponentScore.cannets}/3</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/70">Round Tricks:</span>
              <span className="text-green-400 font-semibold">{currentRoundTricks.opponent}/3</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
