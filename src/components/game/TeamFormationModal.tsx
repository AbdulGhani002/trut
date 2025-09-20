"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface TeamFormationModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerTokens: number;
}

export default function TeamFormationModal({
  isOpen,
  onClose,
  playerTokens
}: TeamFormationModalProps) {
  const router = useRouter();
  const [teamMode, setTeamMode] = useState<'solo' | 'team'>('solo');

  if (!isOpen) return null;

  const FIXED_BET_AMOUNT = 300;

  const handleStartMatch = () => {
    if (playerTokens < FIXED_BET_AMOUNT) {
      alert(`You need at least ${FIXED_BET_AMOUNT} tokens to play 2v2`);
      return;
    }
    
    // Navigate to 2v2 game page with fixed bet amount
    router.push(`/game/2v2?teamMode=${teamMode}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-panel p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">2v2 Match Setup</h2>
          <p className="text-white/70">Configure your match preferences</p>
        </div>

        {/* Team Mode Selection */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-white mb-3">Team Mode</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setTeamMode('solo')}
              className={`p-4 rounded-xl glass-panel border-2 transition ${
                teamMode === 'solo'
                  ? 'border-blue-500 bg-blue-500/20'
                  : 'border-white/20 hover:border-white/40'
              }`}
            >
              <div className="text-2xl mb-2">🎯</div>
              <div className="font-semibold text-white">Solo Queue</div>
              <div className="text-sm text-white/60">Auto-assigned team</div>
            </button>

            <button
              onClick={() => setTeamMode('team')}
              className={`p-4 rounded-xl glass-panel border-2 transition ${
                teamMode === 'team'
                  ? 'border-green-500 bg-green-500/20'
                  : 'border-white/20 hover:border-white/40'
              }`}
            >
              <div className="text-2xl mb-2">👥</div>
              <div className="font-semibold text-white">Create Team</div>
              <div className="text-sm text-white/60">Play with friends</div>
            </button>
          </div>
        </div>

        {/* Fixed Bet Amount Display */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-white mb-3">
            Match Details
          </label>

          {/* Prize Pool Display */}
          <div className="glass-panel p-4 bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/20">
            <div className="text-center">
              <div className="text-lg font-bold text-yellow-400 mb-1">{FIXED_BET_AMOUNT * 4} tokens</div>
              <div className="text-sm text-white/80 mb-1">Prize Pool (4 players × {FIXED_BET_AMOUNT} tokens)</div>
              <div className="text-xs text-white/60">Winner team splits the pool</div>
            </div>
          </div>
          
          {playerTokens < FIXED_BET_AMOUNT && (
            <div className="mt-3 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
              <div className="text-red-300 text-sm font-medium">
                ⚠️ Insufficient tokens: You have {playerTokens}, need {FIXED_BET_AMOUNT}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-lg bg-white/10 hover:bg-white/20 transition text-white font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleStartMatch}
            disabled={playerTokens < FIXED_BET_AMOUNT}
            className={`flex-1 px-4 py-3 rounded-lg transition text-white font-semibold shadow-lg ${
              playerTokens < FIXED_BET_AMOUNT
                ? 'bg-gray-600 cursor-not-allowed opacity-50'
                : 'bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500'
            }`}
          >
            {playerTokens < FIXED_BET_AMOUNT ? 'Insufficient Tokens' : 'Find Match'}
          </button>
        </div>
      </div>
    </div>
  );
}

