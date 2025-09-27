import { GameRoom, Player, MatchmakingRequest, GameEvent, GameResult, GameMode, BotRoomConfig } from '../../../shared/types/game';
import { RoomManager } from './RoomManager';
import { MatchmakingService } from './MatchmakingService';
import { TrutBotEngine } from '../game/modes/bot1v1/TrutBotEngine';
import { Trut2v2Engine } from '../game/modes/2v2/Trut2v2Engine';
import { BaseTrutEngine } from '../game/core/BaseTrutEngine';

export class GameManager {
  private roomManager: RoomManager;
  private matchmakingService: MatchmakingService;
  private engines: Map<GameMode, BaseTrutEngine>;

  constructor() {
    this.roomManager = new RoomManager();
    this.matchmakingService = new MatchmakingService();
    this.engines = new Map<GameMode, BaseTrutEngine>([
      ['bot1v1', new TrutBotEngine()],
      ['2v2', new Trut2v2Engine()],
    ]);
  }

  // Room Management Methods
  createRoom(
    hostId: string, 
    hostName: string, 
    gameMode: GameMode,
    maxPlayers?: number,
    betAmount?: number,
    teamMode?: 'solo' | 'team',
    botConfig?: BotRoomConfig
  ): GameRoom {
    return this.roomManager.createRoom(hostId, hostName, gameMode, maxPlayers, betAmount, teamMode, botConfig);
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
    gameMode: GameMode,
    playerName?: string,
    betAmount?: number,
    teamMode?: 'solo' | 'team',
    teamMateId?: string,
    botConfig?: BotRoomConfig
  ): MatchmakingRequest {
    return this.matchmakingService.addToQueue(playerId, gameMode, playerName, betAmount, teamMode, teamMateId, botConfig);
  }

  removeFromMatchmakingQueue(playerId: string): boolean {
    return this.matchmakingService.removeFromQueue(playerId);
  }

  findMatch(gameMode: GameMode, betAmount?: number): MatchmakingRequest[] | null {
    return this.matchmakingService.findMatch(gameMode, betAmount);
  }

  getMatchmakingQueue(): MatchmakingRequest[] {
    return this.matchmakingService.getQueue();
  }

  // Game Logic Methods
  startGame(roomId: string): GameResult<void> {
    const room = this.roomManager.getRoom(roomId);
    if (!room) return { success: false, error: 'Room not found' };

    const engine = this.engines.get(room.gameMode);
    if (!engine) {
      return { success: false, error: `No engine available for mode ${room.gameMode}` };
    }

    const result = engine.startGame(room);
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

    const engine = this.engines.get(room.gameMode);
    if (!engine) {
      return { success: false, error: `No engine for mode ${room.gameMode}` };
    }

    switch (event.type) {
      case 'card_played':
        result = engine.processCardPlay(room.gameState, playerId, event.data.cardData, room.players);
        break;
      case 'trut_called':
        result = engine.processTrutCall(room.gameState, playerId, room.players);
        break;
      case 'challenge_response':
        result = engine.processChallengeResponse(room.gameState, playerId, event.data.accept, room.players);
        break;
      case 'brelan_called':
        result = engine.processBrelanCall(room.gameState, playerId, event.data.cards, room.players);
        break;
      case 'fortial_phase':
        result = engine.processFortialPhase(room.gameState, playerId, room.players);
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

    if (gameMode === '2v2' && matchedPlayers.length !== 4) {
      return { success: false, error: `Expected 4 players for ${gameMode}, got ${matchedPlayers.length}` };
    }
    const host = matchedPlayers[0];
    
    if (gameMode === 'bot1v1') {
      const room = this.createRoom(
        host.playerId,
        host.playerName || 'Host',
        'bot1v1',
        2,
        undefined,
        undefined,
        host.botConfig || { botStrategyId: 'simple', difficulty: 'easy' }
      );
      return { success: true, data: room };
    }

    const room = this.createRoom(
      host.playerId,
      host.playerName || 'Host',
      gameMode,
      4,
      300,
      host.teamMode
    );

    for (let i = 1; i < matchedPlayers.length; i++) {
      const player = matchedPlayers[i];
      const joinResult = this.joinRoom(room.id, player.playerId, player.playerName || `Player${i + 1}`);
      if (!joinResult.success) {
        return { success: false, error: `Failed to add player ${player.playerId}` };
      }
    }

    matchedPlayers.forEach(player => {
      this.setPlayerReady(player.playerId, true);
    });

    return { success: true, data: room };
  }

  getEstimatedWaitTime(gameMode: GameMode, betAmount?: number): number {
    return this.matchmakingService.getEstimatedWaitTime(gameMode, betAmount);
  }

  get2v2QueueStatus(betAmount: number): { playersInQueue: number; estimatedWaitTime: number } {
    const queue = this.matchmakingService.get2v2QueueByBetAmount(betAmount);
    return {
      playersInQueue: queue.length,
      estimatedWaitTime: this.getEstimatedWaitTime('2v2', betAmount)
    };
  }

  processAllMatchmaking(): { gameMode: GameMode; room: GameRoom; betAmount?: number }[] {
    const matches = this.matchmakingService.checkForMatches();
    const createdGames: { gameMode: GameMode; room: GameRoom; betAmount?: number }[] = [];

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
