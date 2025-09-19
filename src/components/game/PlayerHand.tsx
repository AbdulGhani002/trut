"use client";
import React, { useState } from 'react';
import { Card, TrutGameState } from '../../../shared/types/game';
import { useMultiplayerStore } from '@/lib/multiplayer/store';
import PlayingCard from './PlayingCard';

interface PlayerHandProps {
  myHand: Card[];
  gameState: TrutGameState;
  myPlayerId: string | null;
  canPlay: boolean;
}

export default function PlayerHand({ myHand, gameState, myPlayerId, canPlay }: PlayerHandProps) {
  const { playCard, callTrut } = useMultiplayerStore();
  const [playingCardId, setPlayingCardId] = useState<string | null>(null);

  const handleCardPlay = (cardId: string) => {
    if (canPlay && !playingCardId) {
      setPlayingCardId(cardId);
      playCard(cardId);
      setTimeout(() => setPlayingCardId(null), 500);
    }
  };

  const handleTrutCall = () => {
    callTrut();
  };

  const handleChallengeResponse = (accept: boolean) => {
    const { socket } = useMultiplayerStore.getState();
    if (socket) socket.emit('respondToChallenge', accept);
  };

  // Reset playing card state when game state changes
  React.useEffect(() => {
    setPlayingCardId(null);
  }, [gameState?.currentTrick, gameState?.turn]);

  return (
    <div className="bg-slate-800/40 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold">Your Hand</h3>
        <div className="text-white/60 text-sm">
          {myHand.length} {myHand.length === 1 ? 'card' : 'cards'}
        </div>
      </div>
      
      <div className="flex justify-center gap-3 mb-6">
        {myHand.map((card, index) => {
          const isCardBeingPlayed = playingCardId === card.id;
          return (
            <div 
              key={card.id} 
              className={`transform transition-all duration-200 ${
                isCardBeingPlayed 
                  ? 'scale-95 opacity-50 cursor-wait' 
                  : canPlay 
                    ? 'hover:-translate-y-2 hover:scale-105 cursor-pointer' 
                    : 'cursor-not-allowed opacity-60'
              }`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <PlayingCard 
                card={card} 
                size="large" 
                onClick={() => handleCardPlay(card.id)} 
              />
            </div>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center gap-4">
        {gameState.awaitingChallengeResponse && gameState.challengeRespondent === myPlayerId ? (
          // Show challenge response buttons
          <>
            <button 
              onClick={() => handleChallengeResponse(true)}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200"
            >
              ✓ Accept Challenge
            </button>
            <button 
              onClick={() => handleChallengeResponse(false)}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white font-bold text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200"
            >
              ✗ Fold
            </button>
          </>
        ) : (
          // Show normal Trut button
          <button 
            onClick={handleTrutCall} 
            disabled={gameState.phase === 'truting' && gameState.trutingPlayer !== myPlayerId}
            className={`group px-6 py-3 rounded-xl text-white font-bold text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200 ${
              gameState.phase === 'truting' && gameState.trutingPlayer !== myPlayerId
                ? 'bg-gray-600 cursor-not-allowed opacity-50'
                : 'bg-gradient-to-r from-amber-500 via-orange-500 to-red-500'
            }`}
          >
            <span className="flex items-center gap-2">
              ⚡ TRUT!
              <span className="text-sm opacity-80 group-hover:opacity-100">(Challenge)</span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
