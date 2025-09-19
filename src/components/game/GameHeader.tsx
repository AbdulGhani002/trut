"use client";
import React from 'react';
import { GameRoom } from '../../../shared/types/game';

interface GameHeaderProps {
  currentRoom: GameRoom;
  onLeaveGame: () => void;
}

export default function GameHeader({ currentRoom, onLeaveGame }: GameHeaderProps) {
  return (
    <div className="sticky top-0 z-10 backdrop-blur-lg bg-slate-900/80 border-b border-white/10">
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse"></div>
              <span className="text-white font-medium">Live Game</span>
            </div>
            <div className="text-white/60 text-sm">
              Room: <code className="px-2 py-1 rounded bg-white/10 text-xs">{currentRoom.id.slice(-8)}</code>
            </div>
          </div>
          
          <button
            onClick={onLeaveGame}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-600/30 transition-all duration-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Leave Game
          </button>
        </div>
      </div>
    </div>
  );
}
