import { create } from 'zustand';
import { Socket, io } from 'socket.io-client';
import type { GameRoom, TrutGameState, MatchmakingRequest } from '../../../shared/types/game';
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

  connect: () => Promise<void>;
  disconnect: () => void;

  startMatchmaking: (request: MatchmakingRequest) => void;
  cancelMatchmaking: () => void;
  leaveGame: () => boolean;

  sendChatMessage: (message: string) => void;
  playCard: (cardId: string) => void;
  callTrut: () => void;
  respondToChallenge: (accept: boolean) => void;
  setPlayerName: (name: string) => void;
}

interface SocketEventData {
  connected: { playerId: string; message: string; timestamp: Date };
  matchFound: { room: GameRoom };
  matchmakingStatus: { 
    status?: string; 
    estimatedWaitTime?: number | null; 
  };
  gameStart: { room?: GameRoom; gameState?: TrutGameState };
  cardPlayed: { gameState?: TrutGameState };
  trutCalled: { 
    playerId: string; 
    gameState?: TrutGameState; 
  };
  challengeResponse: { 
    accept: boolean; 
    gameState?: TrutGameState; 
  };
  newRound: { 
    gameState?: TrutGameState; 
    scores?: TrutGameState['scores']; 
  };
  gameEnded: { gameState?: TrutGameState };
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
      set({ currentRoom: data.room, matchmakingStatus: 'found', estimatedWaitTime: null });
    });
    socket.on('matchmakingStatus', (data: SocketEventData['matchmakingStatus']) => {
      console.log('Matchmaking status:', data);
      set({ 
        matchmakingStatus: data.status as 'searching' || 'searching',
        estimatedWaitTime: data.estimatedWaitTime || null
      });
    });
    socket.on('matchmakingCancelled', () => {
      set({ matchmakingStatus: 'cancelled', estimatedWaitTime: null });
    });
    socket.on('gameStart', (data: SocketEventData['gameStart']) => {
      set({ currentRoom: data.room || get().currentRoom, gameState: data.gameState || null });
    });
    socket.on('cardPlayed', (data: SocketEventData['cardPlayed']) => {
      // Immediate update for responsive gameplay
      set({ gameState: data.gameState || get().gameState });
    });
    socket.on('trutCalled', (data: SocketEventData['trutCalled']) => {
      const gs = { 
        ...(get().gameState || {}), 
        phase: 'truting' as const, 
        hasPlayerTruted: true, 
        trutingPlayer: data.playerId,
        awaitingChallengeResponse: data.gameState?.awaitingChallengeResponse || false,
        challengeRespondent: data.gameState?.challengeRespondent
      } as TrutGameState;
      set({ gameState: gs });
    });
    socket.on('challengeResponse', (data: SocketEventData['challengeResponse']) => {
      const gs = { 
        ...(get().gameState || {}), 
        phase: data.accept ? 'playing' as const : 'scoring' as const, 
        challengeAccepted: !!data.accept,
        awaitingChallengeResponse: false
      } as TrutGameState;
      set({ gameState: gs });
    });
    socket.on('newRound', (data: SocketEventData['newRound']) => {
      console.log('New round started:', data);
      // Ensure we update the game state with new hands and reset phase
      const newGameState = {
        ...(data.gameState || {}),
        scores: data.scores || data.gameState?.scores,
        phase: 'playing' as const, // Explicitly reset phase to playing
        awaitingChallengeResponse: false,
        challengeAccepted: false,
        hasPlayerTruted: false,
        trutingPlayer: undefined,
        challengeRespondent: undefined
      } as TrutGameState;
      console.log('Setting new game state with hands:', newGameState.hands);
      set({ gameState: newGameState });
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
    if (!socket) return;
    const name = get().playerName || 'Guest';
    set({ matchmakingStatus: 'searching', estimatedWaitTime: null });
    socket.emit('startMatchmaking', { gameMode: request.gameMode, playerName: name });
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
      set({ currentRoom: null, gameState: null, chatMessages: [], unreadMessageCount: 0, matchmakingStatus: 'idle', estimatedWaitTime: null });
      return true;
    } catch (error) {
      console.error('Failed to emit leaveRoom:', error);
      // Still clean up local state as fallback
      set({ currentRoom: null, gameState: null, chatMessages: [], unreadMessageCount: 0, matchmakingStatus: 'idle', estimatedWaitTime: null });
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

  setPlayerName: (name: string) => {
    const trimmed = (name || '').slice(0, 20).trim();
    const finalName = trimmed.length > 0 ? trimmed : 'Guest';
    try {
      if (typeof window !== 'undefined') localStorage.setItem('playerName', finalName);
    } catch {}
    set({ playerName: finalName });
  },
}));