import { GameRoom, TrutGameState, Card, TeamScores } from './game';

export interface ServerToClientEvents {
  connected: (data: { message: string; playerId: string; timestamp: Date }) => void;
  matchFound: (data: { room: GameRoom; message: string }) => void;
  matchmakingStatus: (data: {
    status: string;
    message: string;
    estimatedWaitTime?: number;
    playersInQueue?: number;
    waitTime?: number;
  }) => void;
  matchmakingCancelled: (data: { message: string }) => void;
  gameStart: (data: { room: GameRoom; gameState: TrutGameState; message: string }) => void;
  cardPlayed: (data: {
    playerId: string;
    cardId: string;
    cardData: Card;
    gameState: TrutGameState;
    nextPlayer: string;
  }) => void;
  trutCalled: (data: {
    playerId: string;
    gameState: TrutGameState;
    message: string;
  }) => void;
  challengeResponse: (data: {
    playerId: string;
    accept: boolean;
    gameState: TrutGameState;
    message: string;
  }) => void;
  newRound: (data: {
    room: GameRoom;
    gameState: TrutGameState;
    message: string;
    scores: TeamScores;
  }) => void;
  gameEnded: (data: {
    gameState: TrutGameState;
    winner: 'team1' | 'team2';
    message: string;
  }) => void;
  leftRoom: (data: { message: string }) => void;
  playerLeft: (data: { playerId: string; message: string }) => void;
  playerDisconnected: (data: { playerId: string; message: string }) => void;
  playerReadyChange: (data: { playerId: string; isReady: boolean; room: GameRoom }) => void;
  chatMessage: (message: ChatMessage) => void;
  roomInfo: (room: GameRoom) => void;
  error: (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  startMatchmaking: (data: { gameMode: string; playerName: string }) => void;
  cancelMatchmaking: () => void;
  setReady: (isReady: boolean) => void;
  playCard: (data: { cardId: string; cardData: Card }) => void;
  callTrut: () => void;
  respondToChallenge: (accept: boolean) => void;
  leaveRoom: () => void;
  sendChatMessage: (message: string) => void;
  getRoomInfo: () => void;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName?: string;
  message: string;
  timestamp: Date;
  type: 'player' | 'system';
}
