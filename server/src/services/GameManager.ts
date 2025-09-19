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
  createRoom(hostId: string, hostName: string, gameMode: string, maxPlayers: number = 2): GameRoom {
    return this.roomManager.createRoom(hostId, hostName, gameMode, maxPlayers);
  }

  joinRoom(roomId: string, playerId: string, playerName: string): GameResult<GameRoom> {
    return this.roomManager.joinRoom(roomId, playerId, playerName);
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
  addToMatchmakingQueue(playerId: string, gameMode: string, playerName?: string): MatchmakingRequest {
    return this.matchmakingService.addToQueue(playerId, gameMode, playerName);
  }

  removeFromMatchmakingQueue(playerId: string): boolean {
    return this.matchmakingService.removeFromQueue(playerId);
  }

  findMatch(gameMode: string): MatchmakingRequest[] | null {
    return this.matchmakingService.findMatch(gameMode);
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
        result = this.gameEngine.processCardPlay(room.gameState, playerId, event.data.cardData);
        break;
      case 'trut_called':
        result = this.gameEngine.processTrutCall(room.gameState, playerId);
        break;
      case 'challenge_response':
        result = this.gameEngine.processChallengeResponse(room.gameState, playerId, event.data.accept);
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
}
