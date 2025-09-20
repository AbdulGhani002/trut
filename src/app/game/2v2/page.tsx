"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMultiplayerStore } from "@/lib/multiplayer/store";
import GameTable2v2 from "@/components/game/GameTable2v2";
import PlayerHand from "@/components/game/PlayerHand";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
// import { Card, TrickCard } from "@/../shared/types/game";

export default function Game2v2Page() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const store = useMultiplayerStore();
  const hasStartedMatchmaking = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  
  const [gameData] = useState({
    betAmount: 300, // Fixed bet amount for 2v2 games
    teamMode: (searchParams.get('teamMode') as 'solo' | 'team') || 'solo'
  });

  // Auto-connect to multiplayer when page loads
  useEffect(() => {
    if (!store.socket) {
      store.connect();
    }
  }, [store]);

  // Auto-start matchmaking when page loads with params - ONLY ONCE
  useEffect(() => {
    if (store.socket && store.connectionStatus.status === 'connected' &&
        store.matchmakingStatus === 'idle' && !hasStartedMatchmaking.current) {
      console.log('Starting 2v2 matchmaking with:', {
        playerId: store.myPlayerId,
        gameMode: '2v2',
        playerName: store.playerName,
        betAmount: gameData.betAmount,
        teamMode: gameData.teamMode
      });
      hasStartedMatchmaking.current = true;
      store.startMatchmaking({
        playerId: store.myPlayerId || '',
        gameMode: '2v2',
        playerName: store.playerName,
        betAmount: gameData.betAmount,
        teamMode: gameData.teamMode,
        timestamp: new Date()
      });
    }
  }, [store.socket, store.connectionStatus.status, store.matchmakingStatus, store.myPlayerId, store.playerName, store.startMatchmaking, gameData.betAmount, gameData.teamMode]);

  // Get real game data from store
  const currentRoom = store.currentRoom;
  const gameState = store.gameState;
  const myPlayerId = store.myPlayerId;

  // Use real players from room or fallback to mock for demo
  const players = currentRoom?.players || [
    { id: myPlayerId || "player1", name: store.playerName || "You", team: 'team1' as const, isReady: false, isConnected: true, socketId: '', joinedAt: new Date() },
    { id: "player2", name: "Teammate", team: 'team1' as const, isReady: false, isConnected: true, socketId: '', joinedAt: new Date() },
    { id: "player3", name: "Opponent 1", team: 'team2' as const, isReady: false, isConnected: true, socketId: '', joinedAt: new Date() },
    { id: "player4", name: "Opponent 2", team: 'team2' as const, isReady: false, isConnected: true, socketId: '', joinedAt: new Date() }
  ];

  const currentTrick = gameState?.currentTrick || [];
  const myHand = gameState?.hands?.[myPlayerId || ''] || [];
  const scores = gameState?.scores || { team1: { truts: 0, cannets: 0 }, team2: { truts: 0, cannets: 0 } };

  // Show waiting when: connecting, searching, or no room yet after starting matchmaking
  const isWaiting =
    store.connectionStatus.status !== 'connected' ||
    store.matchmakingStatus === 'searching' ||
    (!currentRoom && hasStartedMatchmaking.current);

  const handleLeaveGame = () => {
    setConfirmOpen(true);
  };

  // Show matchmaking screen while searching / waiting
  if (isWaiting) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
        <ConfirmDialog
          open={confirmOpen}
          title="Leave Match"
          message="Are you sure you want to leave the game?"
          confirmText="Leave"
          cancelText="Stay"
          onConfirm={() => {
            setConfirmOpen(false);
            // Cancel any active matchmaking first
            if (store.matchmakingStatus === 'searching') {
              store.cancelMatchmaking();
            }
            store.leaveGame();
            router.push('/');
          }}
          onCancel={() => setConfirmOpen(false)}
        />
        <div className="glass-panel p-8 max-w-md w-full text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold text-white mb-2">Finding Match...</h2>
          <p className="text-white/70 mb-4">
            Looking for {gameData.teamMode === 'solo' ? 'players' : 'team opponents'} for 2v2 match
          </p>
          <div className="text-sm text-white/60 mb-4">
            Fixed Bet: {gameData.betAmount} tokens • Prize Pool: {gameData.betAmount * 4} tokens
          </div>
          {store.estimatedWaitTime && (
            <div className="text-sm text-white/60 mb-4">
              Estimated wait: {store.estimatedWaitTime}s
            </div>
          )}
          <button
            onClick={() => {
              store.cancelMatchmaking();
              router.push('/');
            }}
            className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <ConfirmDialog
        open={confirmOpen}
        title="Leave Match"
        message="Are you sure you want to leave the game?"
        confirmText="Leave"
        cancelText="Stay"
        onConfirm={() => {
          setConfirmOpen(false);
          // Cancel any active matchmaking first
          if (store.matchmakingStatus === 'searching') {
            store.cancelMatchmaking();
          }
          store.leaveGame();
          router.push('/');
        }}
        onCancel={() => setConfirmOpen(false)}
      />
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="glass-panel p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={handleLeaveGame}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 transition text-white font-semibold shadow-lg text-sm"
              >
                Leave Game
              </button>
              <div>
                <h1 className="text-2xl font-bold text-white">2v2 Match</h1>
                <p className="text-white/70 text-sm">
                  Bet: {gameData.betAmount} tokens • Mode: {gameData.teamMode === 'solo' ? 'Solo Queue' : 'Team Match'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-yellow-400">
                {gameData.betAmount * 4} tokens
              </div>
              <div className="text-xs text-white/60">Prize Pool</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* Left Sidebar - Team Info & Scoring */}
          <div className="lg:col-span-1 space-y-4">
            {/* Team Alpha */}
            <div className="glass-panel p-5 border-l-4 border-blue-500 bg-gradient-to-r from-blue-500/10 to-transparent">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-3 h-3 rounded-full bg-blue-500 shadow-lg"></div>
                <h3 className="text-lg font-bold text-blue-400">Team Alpha</h3>
                <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded-full">Your Team</span>
              </div>
              
              <div className="space-y-2 mb-4">
                {players.filter(p => p.team === 'team1').map((player) => (
                  <div
                    key={player.id}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                      player.name === store.playerName
                        ? 'bg-blue-500/20 border border-blue-500/30 shadow-md'
                        : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${
                      player.name === store.playerName ? 'bg-blue-400' : 'bg-white/40'
                    }`}></div>
                    <span className={`text-sm font-medium ${
                      player.name === store.playerName ? 'text-blue-300' : 'text-white/80'
                    }`}>
                      {player.name}
                    </span>
                    {player.name === store.playerName && (
                      <span className="text-xs bg-blue-500/30 text-blue-300 px-2 py-0.5 rounded ml-auto">You</span>
                    )}
                  </div>
                ))}
              </div>
              
              {/* Team Alpha Score */}
              <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/10 rounded-lg p-4 border border-blue-500/20">
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-400 mb-1">{scores.team1.truts}</div>
                    <div className="text-xs text-blue-300 font-medium">Long Tokens</div>
                    <div className="text-xs text-white/50">Truts</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-400 mb-1">{scores.team1.cannets}</div>
                    <div className="text-xs text-yellow-300 font-medium">Small Tokens</div>
                    <div className="text-xs text-white/50">Cannets</div>
                  </div>
                </div>
                
                <div className="bg-white/5 rounded-lg p-2 text-center">
                  <div className="text-sm font-medium text-white/90 mb-1">Round Progress</div>
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-400"></div>
                    <div className="w-3 h-3 rounded-full bg-white/20"></div>
                    <div className="w-3 h-3 rounded-full bg-white/20"></div>
                  </div>
                  <div className="text-xs text-white/60 mt-1">1 of 3 tricks won</div>
                </div>
              </div>
            </div>

            {/* Team Beta */}
            <div className="glass-panel p-5 border-l-4 border-red-500 bg-gradient-to-r from-red-500/10 to-transparent">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-500 shadow-lg"></div>
                <h3 className="text-lg font-bold text-red-400">Team Beta</h3>
                <span className="text-xs bg-red-500/20 text-red-300 px-2 py-1 rounded-full">Opponents</span>
              </div>
              
              <div className="space-y-2 mb-4">
                {players.filter(p => p.team === 'team2').map((player) => (
                  <div key={player.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-all">
                    <div className="w-2 h-2 rounded-full bg-red-400/60"></div>
                    <span className="text-sm font-medium text-white/80">{player.name}</span>
                  </div>
                ))}
              </div>
              
              {/* Team Beta Score */}
              <div className="bg-gradient-to-br from-red-500/10 to-red-600/10 rounded-lg p-4 border border-red-500/20">
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-red-400 mb-1">{scores.team2.truts}</div>
                    <div className="text-xs text-red-300 font-medium">Long Tokens</div>
                    <div className="text-xs text-white/50">Truts</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-400 mb-1">{scores.team2.cannets}</div>
                    <div className="text-xs text-yellow-300 font-medium">Small Tokens</div>
                    <div className="text-xs text-white/50">Cannets</div>
                  </div>
                </div>
                
                <div className="bg-white/5 rounded-lg p-2 text-center">
                  <div className="text-sm font-medium text-white/90 mb-1">Round Progress</div>
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-white/20"></div>
                    <div className="w-3 h-3 rounded-full bg-white/20"></div>
                    <div className="w-3 h-3 rounded-full bg-white/20"></div>
                  </div>
                  <div className="text-xs text-white/60 mt-1">0 of 3 tricks won</div>
                </div>
              </div>
            </div>

            {/* Game Rules Summary */}
            <div className="glass-panel p-4 bg-gradient-to-br from-purple-500/10 to-indigo-600/10 border border-purple-500/20">
              <div className="flex items-center gap-2 mb-3">
                <div className="text-lg">📋</div>
                <h4 className="text-sm font-bold text-white">Quick Rules</h4>
              </div>
              <div className="space-y-2 text-xs text-white/80">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
                  <span>Win 2/3 tricks → Win round</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-400"></div>
                  <span>Round win → +1 small token</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                  <span>3 small tokens → 1 long token</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-400"></div>
                  <span>Goal: 7 long tokens to win</span>
                </div>
                <div className="bg-red-500/20 border border-red-500/30 rounded p-2 mt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-red-400">⚠️</span>
                    <span className="text-red-300 text-xs font-medium">Risk: Opponent long token = lose all small tokens</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Game Content - Right Side */}
          <div className="lg:col-span-3">
            {/* Game Status */}
            <div className="glass-panel p-4 mb-6 text-center">
              <div className="text-white/80">
                Current Turn: <span className="text-yellow-400 font-semibold">
                  {players.find(p => p.id === gameState?.currentPlayer)?.name || 'Unknown'}
                </span>
              </div>
            </div>

            {/* Game Table */}
            <GameTable2v2 
              currentTrick={currentTrick} 
              myPlayerId={myPlayerId} 
              players={players.map(p => ({
                id: p.id,
                name: p.name,
                team: p.team || 'team1'
              }))}
            />

            {/* Player Hand */}
            {gameState && (
              <PlayerHand 
                myHand={myHand}
                gameState={gameState}
                myPlayerId={myPlayerId}
                canPlay={gameState.currentPlayer === myPlayerId}
              />
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
