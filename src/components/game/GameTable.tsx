"use client";
import React from 'react';
import { TrickCard } from '../../../shared/types/game';
import PlayingCard from './PlayingCard';

interface GameTableProps {
  currentTrick: TrickCard[];
  myPlayerId: string | null;
}

export default function GameTable({ currentTrick, myPlayerId }: GameTableProps) {
  // Find which card belongs to which player
  const myCard = currentTrick.find(trick => trick.playerId === myPlayerId);
  const opponentCard = currentTrick.find(trick => trick.playerId !== myPlayerId);

  return (
    <div className="mb-8">
      <div className="relative mx-auto w-full max-w-md aspect-square">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-900/20 to-teal-900/20 border-2 border-emerald-500/30 shadow-2xl">
          {/* Opponent Area */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2">
            <div className="text-center">
              <div className="text-white/60 text-sm mb-2">Opponent</div>
              {opponentCard && (
                <div className="transform -rotate-2 hover:rotate-0 transition-transform duration-300">
                  <PlayingCard card={opponentCard.card} size="medium" />
                </div>
              )}
            </div>
          </div>

          {/* Center Table Info */}
          <div className="absolute inset-0 flex items-center justify-center">
            {currentTrick.length === 0 && (
              <div className="text-center text-white/40">
                <div className="text-sm">Waiting for cards...</div>
              </div>
            )}
          </div>

          {/* Player Area */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
            <div className="text-center">
              <div className="text-white/60 text-sm mb-2">You</div>
              {myCard && (
                <div className="transform rotate-2 hover:rotate-0 transition-transform duration-300">
                  <PlayingCard card={myCard.card} size="medium" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
