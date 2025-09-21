import { GameRoom, Player, MatchmakingRequest, GameEvent, GameResult } from '../../../shared/types/game';
import { RoomManager } from './RoomManager';
import { MatchmakingService } from './MatchmakingService';
import { TrutGameEngine } from '../game/TrutGameEngine';

export class GameManager {
  private roomManager: RoomManager;
  private matchmakingService: MatchmakingService;
  private gameEngine: TrutGameEngine;

  constructor() {
    this.roomManager = new RoomManager();
    this.matchmakingService = new MatchmakingService();
    this.gameEngine = new TrutGameEngine();
  }

  // Room Management Methods
  createRoom(
    hostId: string, 
    hostName: string, 
    gameMode: '1v1' | '2v2', 
    maxPlayers?: number,
    betAmount?: number,
    teamMode?: 'solo' | 'team'
  ): GameRoom {
    return this.roomManager.createRoom(hostId, hostName, gameMode, maxPlayers, betAmount, teamMode);
  }

  joinRoom(roomId: string, playerId: string, playerName: string, preferredTeam?: 'team1' | 'team2'): GameResult<GameRoom> {
    return this.roomManager.joinRoom(roomId, playerId, playerName, preferredTeam);
  }

  leaveRoom(playerId: string): { success: boolean; roomId?: string; shouldCloseRoom?: boolean } {
    return this.roomManager.leaveRoom(playerId);
  }

  setPlayerReady(playerId: string, isReady: boolean): GameResult<GameRoom> {
    return this.roomManager.setPlayerReady(playerId, isReady);
  }

  handlePlayerDisconnect(playerId: string): { roomId?: string; shouldCloseRoom?: boolean } {
    return this.roomManager.handlePlayerDisconnect(playerId);
  }

  getRoom(roomId: string): GameRoom | undefined {
    return this.roomManager.getRoom(roomId);
  }

  getPlayerRoom(playerId: string): GameRoom | undefined {
    return this.roomManager.getPlayerRoom(playerId);
  }

  getAllRooms(): GameRoom[] {
    return this.roomManager.getAllRooms();
  }

  // Matchmaking Methods
  addToMatchmakingQueue(
    playerId: string, 
    gameMode: '1v1' | '2v2', 
    playerName?: string,
    betAmount?: number,
    teamMode?: 'solo' | 'team',
    teamMateId?: string
  ): MatchmakingRequest {
    return this.matchmakingService.addToQueue(playerId, gameMode, playerName, betAmount, teamMode, teamMateId);
  }

  removeFromMatchmakingQueue(playerId: string): boolean {
    return this.matchmakingService.removeFromQueue(playerId);
  }

  findMatch(gameMode: '1v1' | '2v2', betAmount?: number): MatchmakingRequest[] | null {
    return this.matchmakingService.findMatch(gameMode, betAmount);
  }

  getMatchmakingQueue(): MatchmakingRequest[] {
    return this.matchmakingService.getQueue();
  }

  // Game Logic Methods
  startGame(roomId: string): GameResult<void> {
    const room = this.roomManager.getRoom(roomId);
    if (!room) return { success: false, error: 'Room not found' };

    const result = this.gameEngine.startGame(room);
    if (result.success) {
      this.roomManager.updateRoom(roomId, room);
      return { success: true };
    }
    return { success: false, error: result.error };
  }

  processGameEvent(playerId: string, event: GameEvent): GameResult<GameRoom> {
    const room = this.roomManager.getPlayerRoom(playerId);
    if (!room) return { success: false, error: 'Player not in any room' };
    if (room.status !== 'playing') return { success: false, error: 'Game not in progress' };
    if (!room.gameState) return { success: false, error: 'Game state not found' };

    let result: GameResult<any>;

    switch (event.type) {
      case 'card_played':
        result = this.gameEngine.processCardPlay(room.gameState, playerId, event.data.cardData, room.players);
        break;
      case 'trut_called':
        result = this.gameEngine.processTrutCall(room.gameState, playerId, room.players);
        break;
      case 'challenge_response':
        result = this.gameEngine.processChallengeResponse(room.gameState, playerId, event.data.accept, room.players);
        break;
      case 'brelan_called':
        result = this.gameEngine.processBrelanCall(room.gameState, playerId, event.data.cards, room.players);
        break;
      case 'fortial_phase':
        result = this.gameEngine.processFortialPhase(room.gameState, playerId, room.players);
        break;
      default:
        return { success: false, error: 'Unknown event type' };
    }

    if (result.success) {
      room.gameState = result.data;
      
      // Check if game ended
      if (room.gameState?.gameEnded) {
        room.status = 'finished';
      }
      
      this.roomManager.updateRoom(room.id, room);
      return { success: true, data: room };
    }

    return { success: false, error: result.error };
  }

  // 2v2 specific methods

  createMatchFromQueue(matchedPlayers: MatchmakingRequest[], betAmount?: number): GameResult<GameRoom> {
    if (matchedPlayers.length === 0) {
      return { success: false, error: 'No players provided for match' };
    }

    const gameMode = matchedPlayers[0].gameMode;

    // Validate that all players share the same game mode
    const allSameMode = matchedPlayers.every(p => p.gameMode === gameMode);
    if (!allSameMode) {
      return { success: false, error: 'Players have inconsistent game modes' };
    }

    // Validate expected number of players for the mode
    const expectedCount = gameMode === '2v2' ? 4 : 2;
    if (matchedPlayers.length !== expectedCount) {
      return { success: false, error: `Expected ${expectedCount} players for ${gameMode}, got ${matchedPlayers.length}` };
    }
    const host = matchedPlayers[0];
    
    const room = this.createRoom(
      host.playerId, 
      host.playerName || 'Host', 
      gameMode,
      gameMode === '2v2' ? 4 : 2,
      gameMode === '2v2' ? 300 : betAmount, // Fixed bet amount for 2v2
      host.teamMode
    );

    // Add remaining players
    for (let i = 1; i < matchedPlayers.length; i++) {
      const player = matchedPlayers[i];
      const joinResult = this.joinRoom(room.id, player.playerId, player.playerName || `Player${i + 1}`);
      if (!joinResult.success) {
        return { success: false, error: `Failed to add player ${player.playerId}` };
      }
    }

    // Auto-ready all players in matchmade games
    matchedPlayers.forEach(player => {
      this.setPlayerReady(player.playerId, true);
    });

    return { success: true, data: room };
  }

  getEstimatedWaitTime(gameMode: '1v1' | '2v2', betAmount?: number): number {
    return this.matchmakingService.getEstimatedWaitTime(gameMode, betAmount);
  }

  get2v2QueueStatus(betAmount: number): { playersInQueue: number; estimatedWaitTime: number } {
    const queue = this.matchmakingService.get2v2QueueByBetAmount(betAmount);
    return {
      playersInQueue: queue.length,
      estimatedWaitTime: this.getEstimatedWaitTime('2v2', betAmount)
    };
  }

  processAllMatchmaking(): { gameMode: '1v1' | '2v2'; room: GameRoom; betAmount?: number }[] {
    const matches = this.matchmakingService.checkForMatches();
    const createdGames: { gameMode: '1v1' | '2v2'; room: GameRoom; betAmount?: number }[] = [];

    matches.forEach(match => {
      const roomResult = this.createMatchFromQueue(match.matches, match.betAmount);
      if (roomResult.success && roomResult.data) {
        createdGames.push({
          gameMode: match.gameMode,
          room: roomResult.data,
          betAmount: match.betAmount
        });
      }
    });

    return createdGames;
  }

  // Prize distribution for completed 2v2 games
  distributePrizes(roomId: string): { [playerId: string]: number } {
    const room = this.getRoom(roomId);
    if (!room || !room.gameState?.winner) return {};

    return this.roomManager.calculatePrizeDistribution(room, room.gameState.winner);
  }

  // Team creation for 2v2
  createTeamRoom(
    hostId: string, 
    hostName: string, 
    teammateId: string, 
    teammateName: string,
    betAmount: number
  ): GameRoom {
    return this.roomManager.createTeamRoom(hostId, hostName, teammateId, teammateName, betAmount);
  }
}
