export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
export type GamePhase = 'playing' | 'truting' | 'scoring';
export type GameStatus = 'waiting' | 'playing' | 'finished';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export interface TrickCard {
  playerId: string;
  card: Card;
}

export interface TeamScores {
  team1: { truts: number; cannets: number };
  team2: { truts: number; cannets: number };
}

export interface Player {
  id: string;
  name: string;
  isReady: boolean;
  isConnected: boolean;
  socketId: string;
  joinedAt: Date;
}

export interface GameRoom {
  id: string;
  hostId: string;
  players: Player[];
  maxPlayers: number;
  gameMode: string;
  status: GameStatus;
  createdAt: Date;
  gameState?: TrutGameState;
}

export interface TrutGameState {
  currentPlayer: string;
  turn: number;
  phase: GamePhase;
  scores: TeamScores;
  currentTrick: TrickCard[];
  tricks: TrickCard[][];
  trickWinners: (string | 'rotten')[];
  hands: Record<string, Card[]>;
  deck: Card[];
  gameStarted: Date;
  hasPlayerTruted: boolean;
  trutingPlayer?: string;
  challengeAccepted: boolean;
  awaitingChallengeResponse?: boolean;
  challengeRespondent?: string;
  roundNumber?: number;
  gameEnded?: boolean;
  winner?: 'team1' | 'team2';
  roundEndedAt?: Date;
  newRoundStarted?: boolean;
}

export interface MatchmakingRequest {
  playerId: string;
  gameMode: string;
  playerName?: string;
  skillLevel?: number;
  timestamp: Date;
}

export interface GameEvent {
  type: 'card_played' | 'trut_called' | 'challenge_response' | 'game_start' | 'game_end' | 'turn_change';
  playerId: string;
  data: any;
  timestamp: Date;
}

export interface GameResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
