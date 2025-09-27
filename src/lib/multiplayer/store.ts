import { create } from 'zustand';
import { Socket, io } from 'socket.io-client';
import type { GameRoom, TrutGameState, MatchmakingRequest, Card } from '../../../shared/types/game';
import type { ChatMessage } from '../../../shared/types/socket';

export interface ConnectionStatus {
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  reconnectAttempts: number;
  ping: number;
  lastConnected?: Date;
  error?: string;
}

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4001';
interface MultiplayerStore {
  socket: Socket | null;
  connectionStatus: ConnectionStatus;
  currentRoom: GameRoom | null;
  gameState: TrutGameState | null;
  myPlayerId: string | null;
  playerName: string;
  chatMessages: ChatMessage[];
  unreadMessageCount: number;
  matchmakingStatus: 'idle' | 'searching' | 'found' | 'cancelled';
  estimatedWaitTime: number | null;
  currentMode: 'bot1v1' | null;
  botOpponent: { id: string; isBot: boolean } | null;
  lastChallengeMessage: string | null;

  connect: () => Promise<void>;
  disconnect: () => void;

  startMatchmaking: (request: MatchmakingRequest) => void;
  cancelMatchmaking: () => void;
  leaveGame: () => boolean;
  joinBotMatch: () => void;

  sendChatMessage: (message: string) => void;
  playCard: (cardId: string) => void;
  callTrut: () => void;
  callBrelan: (cards: Card[]) => void;
  startFortialPhase: () => void;
  respondToChallenge: (accept: boolean) => void;
  setPlayerName: (name: string) => void;
}

interface SocketEventData {
  connected: { playerId: string; message: string; timestamp: Date };
  matchFound: { room: GameRoom };
  matchmakingStatus: { 
    status?: string; 
    estimatedWaitTime?: number | null; 
    playersInQueue?: number;
  };
  gameStart: { room?: GameRoom; gameState?: TrutGameState };
  cardPlayed: { gameState?: TrutGameState };
  trutCalled: { 
    playerId: string; 
    gameState?: TrutGameState; 
  };
  brellanCalled: {
    playerId: string;
    cards: Card[];
    gameState?: TrutGameState;
  };
  challengeResponse: { 
    playerId: string;
    accept: boolean; 
    gameState?: TrutGameState;
    message?: string;
  };
  rottenTrick: {
    trickCards: Card[];
    gameState?: TrutGameState;
  };
  fortialPhase: {
    playerId: string;
    gameState?: TrutGameState;
  };
  newRound: { 
    gameState?: TrutGameState; 
    scores?: TrutGameState['scores']; 
  };
  gameEnded: { 
    gameState?: TrutGameState;
    prizeDistribution?: { [playerId: string]: number };
  };
}

const initialConnectionStatus: ConnectionStatus = {
  status: 'disconnected',
  reconnectAttempts: 0,
  ping: 0,
};

export const useMultiplayerStore = create<MultiplayerStore>((set, get) => ({
  socket: null,
  connectionStatus: initialConnectionStatus,
  currentRoom: null,
  gameState: null,
  myPlayerId: null,
  playerName: 'Guest',
  chatMessages: [],
  unreadMessageCount: 0,
  matchmakingStatus: 'idle',
  estimatedWaitTime: null,
  currentMode: null,
  botOpponent: null,
  lastChallengeMessage: null,

  connect: async () => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'], timeout: 10000 });

    socket.on('connect', () => {
      set({ connectionStatus: { ...initialConnectionStatus, status: 'connected', lastConnected: new Date(), ping: 50 } });
    });
    socket.on('connected', (payload: SocketEventData['connected']) => {
      set({ myPlayerId: payload?.playerId || socket.id });
    });
    socket.on('disconnect', (reason) => {
      set({ connectionStatus: { ...get().connectionStatus, status: 'disconnected', error: String(reason) } });
    });
    socket.on('connect_error', (error) => {
      set({ connectionStatus: { ...get().connectionStatus, status: 'error', error: error.message } });
    });

    socket.on('matchFound', (data: SocketEventData['matchFound']) => {
      console.log('Match found event received:', data);
      set({ currentRoom: data.room, matchmakingStatus: 'found', estimatedWaitTime: null });
    });
    socket.on('botMatchReady', (data: { room: GameRoom; gameState?: TrutGameState }) => {
      set({
        currentRoom: data.room,
        gameState: data.gameState || null,
        matchmakingStatus: 'idle',
        currentMode: 'bot1v1',
        botOpponent: data.room.players.find((p) => p.isBot) ? { id: data.room.players.find((p) => p.isBot)!.id, isBot: true } : null,
      });
    });
    socket.on('matchmakingStatus', (data: SocketEventData['matchmakingStatus']) => {
      console.log('Matchmaking status update:', data);
      set({
        matchmakingStatus: data.status as 'searching' || 'searching',
        estimatedWaitTime: data.estimatedWaitTime || null
      });
    });
    socket.on('matchmakingCancelled', () => {
      set({ matchmakingStatus: 'cancelled', estimatedWaitTime: null });
    });
    socket.on('gameStart', (data: SocketEventData['gameStart']) => {
      // Use server state as single source of truth - no optimistic updates
      set({
        currentRoom: data.room || get().currentRoom,
        gameState: data.gameState || null,
        matchmakingStatus: 'idle',
        estimatedWaitTime: null,
        currentMode: data.room?.gameMode === 'bot1v1' ? 'bot1v1' : get().currentMode,
        botOpponent: data.room?.players.find((p) => p.isBot) ? { id: data.room.players.find((p) => p.isBot)!.id, isBot: true } : null,
      });
    });
    socket.on('cardPlayed', (data: SocketEventData['cardPlayed']) => {
      // Use server state as single source of truth - no optimistic updates
      set({ gameState: data.gameState || get().gameState });
    });
    socket.on('trutCalled', (data: SocketEventData['trutCalled']) => {
      // Use server state as single source of truth - no optimistic updates
      set({ gameState: data.gameState || get().gameState });
    });
    socket.on('challengeResponse', (data: SocketEventData['challengeResponse']) => {
      // Use server state as single source of truth - no optimistic updates
      set({ 
        gameState: data.gameState || get().gameState,
        lastChallengeMessage: data.message || null
      });
    });
    socket.on('newRound', (data: SocketEventData['newRound']) => {
      console.log('New round started:', data);
      // Use server state as single source of truth - no optimistic updates
      set({ 
        gameState: data.gameState || get().gameState,
        lastChallengeMessage: null // Clear challenge message on new round
      });
    });
    // Add new 2v2 event handlers
    socket.on('brellanCalled', (data: SocketEventData['brellanCalled']) => {
      set({ gameState: data.gameState || get().gameState });
    });
    socket.on('rottenTrick', (data: SocketEventData['rottenTrick']) => {
      set({ gameState: data.gameState || get().gameState });
    });
    socket.on('fortialPhase', (data: SocketEventData['fortialPhase']) => {
      set({ gameState: data.gameState || get().gameState });
    });
    socket.on('gameEnded', (data: SocketEventData['gameEnded']) => {
      set({ gameState: data.gameState || null });
    });
    socket.on('leftRoom', () => {
      set({ currentRoom: null, gameState: null, chatMessages: [], unreadMessageCount: 0, matchmakingStatus: 'idle', estimatedWaitTime: null });
    });
    socket.on('chatMessage', (message: ChatMessage) => {
      set((state) => ({ chatMessages: [...state.chatMessages, message], unreadMessageCount: state.unreadMessageCount + 1 }));
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) socket.disconnect();
    set({ socket: null, connectionStatus: initialConnectionStatus, currentRoom: null, chatMessages: [], unreadMessageCount: 0, matchmakingStatus: 'idle', estimatedWaitTime: null });
  },

  startMatchmaking: (request) => {
    const { socket } = get();
    if (!socket) {
      console.log('Cannot start matchmaking: no socket connection');
      return;
    }
    const name = get().playerName || 'Guest';
    console.log('Starting matchmaking with request:', request);
    set({ matchmakingStatus: 'searching', estimatedWaitTime: null });
    socket.emit('startMatchmaking', {
      gameMode: request.gameMode,
      playerName: name,
      betAmount: request.betAmount,
      teamMode: request.teamMode,
      teamMateId: request.teamMateId,
      botConfig: request.botConfig,
    });
    console.log('Matchmaking start event emitted');
  },

  joinBotMatch: () => {
    const { socket } = get();
    if (!socket) {
      console.warn('Cannot join bot match: no socket connection');
      return;
    }
    const playerName = get().playerName || 'Guest';
    const playerId = get().myPlayerId || socket.id;
    set({ matchmakingStatus: 'searching', currentMode: 'bot1v1' });
    
    // Use the regular matchmaking system for bot games
    socket.emit('startMatchmaking', {
      gameMode: 'bot1v1',
      playerName,
      botConfig: { botStrategyId: 'simple', difficulty: 'easy' },
    });
  },

  cancelMatchmaking: () => {
    const { socket } = get();
    if (!socket) return;
    set({ matchmakingStatus: 'idle', estimatedWaitTime: null });
    socket.emit('cancelMatchmaking');
  },

  leaveGame: () => {
    const { socket, connectionStatus } = get();
    if (!socket || connectionStatus.status !== 'connected') {
      console.warn('Cannot leave game: socket not connected');
      // Still attempt to clean up local state
      set({ currentRoom: null, gameState: null, chatMessages: [], unreadMessageCount: 0, matchmakingStatus: 'idle', estimatedWaitTime: null });
      return false;
    }

    try {
      socket.emit('leaveRoom');
      // Optimistically clean up local state immediately for better UX
      set({
        currentRoom: null,
        gameState: null,
        chatMessages: [],
        unreadMessageCount: 0,
        matchmakingStatus: 'idle',
        estimatedWaitTime: null,
        currentMode: null,
        botOpponent: null,
      });
      return true;
    } catch (error) {
      console.error('Failed to emit leaveRoom:', error);
      // Still clean up local state as fallback
      set({ currentRoom: null, gameState: null, chatMessages: [], unreadMessageCount: 0, matchmakingStatus: 'idle', estimatedWaitTime: null, currentMode: null, botOpponent: null });
      return false;
    }
  },

  sendChatMessage: (message) => {
    const { socket } = get();
    if (!socket) return;
    socket.emit('sendChatMessage', message);
  },

  playCard: (cardId) => {
    const { socket, gameState, myPlayerId } = get();
    if (!socket || !myPlayerId) return;
    const myHand = (gameState?.hands?.[myPlayerId] || []);
    const card = myHand.find((c) => c.id === cardId);
    socket.emit('playCard', { cardId, cardData: card });
  },

  callTrut: () => {
    const { socket } = get();
    if (!socket) return;
    socket.emit('callTrut');
  },

  respondToChallenge: (accept) => {
    const { socket } = get();
    if (!socket) return;
    socket.emit('respondToChallenge', accept);
  },

  callBrelan: (cards) => {
    const { socket } = get();
    if (!socket) return;
    socket.emit('callBrelan', cards);
  },

  startFortialPhase: () => {
    const { socket } = get();
    if (!socket) return;
    socket.emit('startFortialPhase');
  },

  setPlayerName: (name: string) => {
    const trimmed = (name || '').slice(0, 20).trim();
    const finalName = trimmed.length > 0 ? trimmed : 'Guest';
    try {
      if (typeof window !== 'undefined') localStorage.setItem('playerName', finalName);
    } catch {}
    set({ playerName: finalName });
  },
}));