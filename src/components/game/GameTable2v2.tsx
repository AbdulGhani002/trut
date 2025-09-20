"use client";
import React from 'react';
import { TrickCard } from '../../../shared/types/game';
import PlayingCard from './PlayingCard';

interface GameTable2v2Props {
  currentTrick: TrickCard[];
  myPlayerId: string | null;
  players: Array<{id: string, name: string, team: 'team1' | 'team2'}>;
}

export default function GameTable2v2({ currentTrick, myPlayerId, players }: GameTable2v2Props) {
  // Find cards for each player position
  const getCardForPlayer = (playerId: string) => {
    return currentTrick.find(trick => trick.playerId === playerId);
  };

  // Determine player positions (You always at bottom)
  const myPlayer = players.find(p => p.id === myPlayerId);
  const otherPlayers = players.filter(p => p.id !== myPlayerId);
  
  // Arrange players: teammate opposite (top), opponents on sides
  const teammate = myPlayer ? otherPlayers.find(p => p.team === myPlayer.team) : null;
  const opponents = myPlayer ? otherPlayers.filter(p => p.team !== myPlayer.team) : otherPlayers;

  return (
    <div className="mb-8">
      <div className="relative mx-auto w-full max-w-lg aspect-square">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-900/20 to-teal-900/20 border-2 border-emerald-500/30 shadow-2xl">
          
          {/* Top Player (Teammate) */}
          {teammate && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2">
              <div className="text-center">
                <div className="text-white/60 text-xs mb-2">{teammate.name}</div>
                {getCardForPlayer(teammate.id) && (
                  <div className="transition-transform duration-300">
                    <PlayingCard card={getCardForPlayer(teammate.id)!.card} size="small" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Left Player (Opponent 1) */}
          {opponents[0] && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              <div className="text-center">
                <div className="text-white/60 text-xs mb-2 writing-mode-vertical">
                  {opponents[0].name}
                </div>
                {getCardForPlayer(opponents[0].id) && (
                  <div className="transition-transform duration-300">
                    <PlayingCard card={getCardForPlayer(opponents[0].id)!.card} size="small" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Right Player (Opponent 2) */}
          {opponents[1] && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <div className="text-center">
                <div className="text-white/60 text-xs mb-2 writing-mode-vertical">
                  {opponents[1].name}
                </div>
                {getCardForPlayer(opponents[1].id) && (
                  <div className="transition-transform duration-300">
                    <PlayingCard card={getCardForPlayer(opponents[1].id)!.card} size="small" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Center Table Info */}
          <div className="absolute inset-0 flex items-center justify-center">
            {currentTrick.length === 0 && (
              <div className="text-center text-white/40">
                <div className="text-sm">Waiting for cards...</div>
              </div>
            )}
            {currentTrick.length > 0 && (
              <div className="text-center text-white/60">
                <div className="text-xs">Trick {currentTrick.length}/4</div>
              </div>
            )}
          </div>

          {/* Bottom Player (You) */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <div className="text-center">
              <div className="text-white/60 text-xs mb-2">You</div>
              {myPlayerId && getCardForPlayer(myPlayerId) && (
                <div className="transition-transform duration-300">
                  <PlayingCard card={getCardForPlayer(myPlayerId)!.card} size="small" />
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
