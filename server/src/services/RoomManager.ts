import { v4 as uuidv4 } from 'uuid';
import { GameRoom, Player, GameResult, GameMode, BotRoomConfig } from '../../../shared/types/game';

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private playerToRoom: Map<string, string> = new Map();

  createRoom(
    hostId: string,
    hostName: string,
    gameMode: GameMode,
    maxPlayers?: number,
    betAmount?: number,
    teamMode?: 'solo' | 'team',
    botConfig?: BotRoomConfig
  ): GameRoom {
    const roomId = uuidv4();
    const actualMaxPlayers = maxPlayers || (gameMode === '2v2' ? 4 : 2);
    
    const host: Player = {
      id: hostId,
      name: hostName,
      isReady: false,
      isConnected: true,
      socketId: hostId,
      joinedAt: new Date(),
      team: gameMode === '2v2' ? 'team1' : 'team1',
    };

    const room: GameRoom = {
      id: roomId,
      hostId,
      players: [host],
      maxPlayers: actualMaxPlayers,
      gameMode,
      status: 'waiting',
      createdAt: new Date(),
      betAmount: gameMode === '2v2' ? betAmount : undefined,
      teamMode: gameMode === '2v2' ? teamMode : undefined,
      // Prize pool reflects human contributions (bots don't pay bets)
      prizePool: gameMode === '2v2' && betAmount ? betAmount * 4 : undefined,
      isBotRoom: gameMode === 'bot1v1',
      botConfig: botConfig,
    };

    if (gameMode === 'bot1v1') {
      const botPlayer: Player = {
        id: botConfig?.botStrategyId ? `bot-${botConfig.botStrategyId}-${roomId}` : `bot-${roomId}`,
        name: botConfig?.displayName || 'Trut Bot',
        isReady: true,
        isConnected: true,
        socketId: `bot-${roomId}`,
        joinedAt: new Date(),
        team: 'team2',
        isBot: true,
        botProfile: botConfig
          ? {
              strategyId: botConfig.botStrategyId,
              difficulty: botConfig.difficulty,
              displayName: botConfig.displayName || 'Trut Bot',
            }
          : {
              strategyId: 'simple',
              difficulty: 'easy',
              displayName: 'Trut Bot',
            },
      };

      host.team = 'team1';
      host.isReady = true;

      room.players.push(botPlayer);
      room.maxPlayers = 2;

      this.playerToRoom.set(botPlayer.id, roomId);
    }

    this.rooms.set(roomId, room);
    this.playerToRoom.set(hostId, roomId);
    console.log(`Room ${roomId} created by ${hostName} for ${gameMode} (bet: ${betAmount}, mode: ${teamMode})`);
    return room;
  }

  joinRoom(roomId: string, playerId: string, playerName: string, preferredTeam?: 'team1' | 'team2'): GameResult<GameRoom> {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: 'Room not found' };
    if (room.gameMode === 'bot1v1') {
      return { success: false, error: 'Cannot join bot-only room' };
    }
    if (room.players.length >= room.maxPlayers) return { success: false, error: 'Room is full' };
    if (room.status !== 'waiting') return { success: false, error: 'Game already in progress' };

    let assignedTeam: 'team1' | 'team2' | undefined = undefined;
    
    // Assign team for 2v2 mode
    if (room.gameMode === '2v2') {
      if (room.teamMode === 'team' && preferredTeam) {
        // For team mode, try to assign to preferred team if space available
        const teamPlayers = room.players.filter(p => p.team === preferredTeam);
        if (teamPlayers.length < 2) {
          assignedTeam = preferredTeam;
        } else {
          return { success: false, error: 'Preferred team is full' };
        }
      } else {
        // Auto-assign team (solo queue or no preference)
        const team1Count = room.players.filter(p => p.team === 'team1').length;
        const team2Count = room.players.filter(p => p.team === 'team2').length;
        assignedTeam = team1Count <= team2Count ? 'team1' : 'team2';
      }
    }

    const player: Player = {
      id: playerId,
      name: playerName,
      isReady: false,
      isConnected: true,
      socketId: playerId,
      joinedAt: new Date(),
      team: assignedTeam,
    };

    room.players.push(player);
    this.playerToRoom.set(playerId, roomId);
    console.log(`Player ${playerName} joined room ${roomId} (team: ${assignedTeam})`);
    return { success: true, data: room };
  }

  leaveRoom(playerId: string): { success: boolean; roomId?: string; shouldCloseRoom?: boolean } {
    const roomId = this.playerToRoom.get(playerId);
    if (!roomId) return { success: false };

    const room = this.rooms.get(roomId);
    if (!room) return { success: false };

    room.players = room.players.filter(p => p.id !== playerId);
    this.playerToRoom.delete(playerId);
    console.log(`Player ${playerId} left room ${roomId}`);

    if (room.players.length === 0 || playerId === room.hostId) {
      this.rooms.delete(roomId);
      room.players.forEach(p => this.playerToRoom.delete(p.id));
      console.log(`Room ${roomId} closed`);
      return { success: true, roomId, shouldCloseRoom: true };
    }

    if (playerId === room.hostId && room.players.length > 0) {
      room.hostId = room.players[0].id;
      console.log(`New host assigned in room ${roomId}: ${room.hostId}`);
    }

    return { success: true, roomId };
  }

  setPlayerReady(playerId: string, isReady: boolean): GameResult<GameRoom> {
    const roomId = this.playerToRoom.get(playerId);
    if (!roomId) return { success: false, error: 'Player not in any room' };
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: 'Room not found' };
    const player = room.players.find(p => p.id === playerId);
    if (!player) return { success: false, error: 'Player not in room' };
    player.isReady = isReady;
    return { success: true, data: room };
  }

  handlePlayerDisconnect(playerId: string): { roomId?: string; shouldCloseRoom?: boolean } {
    const roomId = this.playerToRoom.get(playerId);
    if (roomId) {
      const room = this.rooms.get(roomId);
      if (room) {
        const player = room.players.find(p => p.id === playerId);
        if (player) player.isConnected = false;
      }
    }
    return this.leaveRoom(playerId);
  }

  getRoom(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId);
  }

  getPlayerRoom(playerId: string): GameRoom | undefined {
    const roomId = this.playerToRoom.get(playerId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  getAllRooms(): GameRoom[] {
    return Array.from(this.rooms.values());
  }

  updateRoom(roomId: string, room: GameRoom): void {
    this.rooms.set(roomId, room);
  }

  // 2v2 specific methods

  createTeamRoom(
    hostId: string, 
    hostName: string, 
    teammateId: string, 
    teammateName: string,
    betAmount: number
  ): GameRoom {
    const room = this.createRoom(hostId, hostName, '2v2', 4, betAmount, 'team');
    
    // Add teammate to team1
    const teammate: Player = {
      id: teammateId,
      name: teammateName,
      isReady: false,
      isConnected: true,
      socketId: teammateId,
      joinedAt: new Date(),
      team: 'team1',
    };
    
    room.players.push(teammate);
    this.playerToRoom.set(teammateId, room.id);
    
    console.log(`Team room ${room.id} created with ${hostName} and ${teammateName}`);
    return room;
  }

  getAvailable2v2Rooms(betAmount: number): GameRoom[] {
    return Array.from(this.rooms.values()).filter(room => 
      room.gameMode === '2v2' &&
      room.status === 'waiting' &&
      room.players.length < room.maxPlayers &&
      room.betAmount === betAmount &&
      room.teamMode === 'solo'
    );
  }

  isRoomReadyToStart(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    
    return room.players.length === room.maxPlayers && 
           room.players.every(p => p.isReady) &&
           room.status === 'waiting';
  }

  validateTeamBalance(room: GameRoom): boolean {
    if (room.gameMode !== '2v2') return true;
    
    const team1Players = room.players.filter(p => p.team === 'team1');
    const team2Players = room.players.filter(p => p.team === 'team2');
    
    return team1Players.length === 2 && team2Players.length === 2;
  }

  // Prize distribution for 2v2
  calculatePrizeDistribution(room: GameRoom, winningTeam: 'team1' | 'team2'): { [playerId: string]: number } {
    if (room.gameMode !== '2v2' || !room.prizePool) return {};

    // Only humans receive tokens. Split prizePool among human winners only.
    const humanWinners = room.players.filter(p => p.team === winningTeam && !p.isBot);
    const humanCount = humanWinners.length;
    if (humanCount === 0) return {};

    const prizePerHuman = Math.floor(room.prizePool / humanCount);
    const distribution: { [playerId: string]: number } = {};
    for (const player of humanWinners) {
      distribution[player.id] = prizePerHuman;
    }
    return distribution;
  }
}
