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
  team?: 'team1' | 'team2'; // For 2v2 mode
}

export interface GameRoom {
  id: string;
  hostId: string;
  players: Player[];
  maxPlayers: number;
  gameMode: '1v1' | '2v2';
  status: GameStatus;
  createdAt: Date;
  gameState?: TrutGameState;
  betAmount?: number; // For 2v2 mode
  teamMode?: 'solo' | 'team'; // For 2v2 mode
  prizePool?: number; // For 2v2 mode
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
  challengeRespondents?: string[]; // For 2v2 mode - multiple opponents can respond
  pendingChallengeResponses?: { playerId: string; response?: boolean }[]; // For 2v2 tracking
  roundNumber?: number;
  gameEnded?: boolean;
  winner?: 'team1' | 'team2';
  roundEndedAt?: Date;
  newRoundStarted?: boolean;
  rottenTricks?: TrickCard[][]; // Store rotten tricks separately
  maxRounds?: number; // Total rounds in game (best of 3 tricks per round)
  dealerIndex?: number; // Current dealer for proper dealing rotation
  hasBrelanned?: boolean; // If someone declared brelan
  brellanPlayer?: string; // Who declared brelan
  isFortialing?: boolean; // Special Fortial phase (6 truts + 2 cannets)
  fortialer?: string; // Player who can look at cards first in Fortial
}

export interface MatchmakingRequest {
  playerId: string;
  gameMode: '1v1' | '2v2';
  playerName?: string;
  skillLevel?: number;
  timestamp: Date;
  betAmount?: number; // For 2v2 mode
  teamMode?: 'solo' | 'team'; // For 2v2 mode
  teamMateId?: string; // For team mode
}

export interface GameEvent {
  type: 'card_played' | 'trut_called' | 'challenge_response' | 'game_start' | 'game_end' | 'turn_change' | 'brelan_called' | 'fortial_phase' | 'rotten_trick';
  playerId: string;
  data: any;
  timestamp: Date;
}

export interface GameResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
