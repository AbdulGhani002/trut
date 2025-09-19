import { v4 as uuidv4 } from 'uuid';
import { GameRoom, Player, GameResult } from '../../../shared/types/game';

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private playerToRoom: Map<string, string> = new Map();

  createRoom(hostId: string, hostName: string, gameMode: string, maxPlayers: number = 2): GameRoom {
    const roomId = uuidv4();
    const host: Player = {
      id: hostId,
      name: hostName,
      isReady: false,
      isConnected: true,
      socketId: hostId,
      joinedAt: new Date(),
    };

    const room: GameRoom = {
      id: roomId,
      hostId,
      players: [host],
      maxPlayers,
      gameMode,
      status: 'waiting',
      createdAt: new Date(),
    };

    this.rooms.set(roomId, room);
    this.playerToRoom.set(hostId, roomId);
    console.log(`Room ${roomId} created by ${hostName} for ${gameMode}`);
    return room;
  }

  joinRoom(roomId: string, playerId: string, playerName: string): GameResult<GameRoom> {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: 'Room not found' };
    if (room.players.length >= room.maxPlayers) return { success: false, error: 'Room is full' };
    if (room.status !== 'waiting') return { success: false, error: 'Game already in progress' };

    const player: Player = {
      id: playerId,
      name: playerName,
      isReady: false,
      isConnected: true,
      socketId: playerId,
      joinedAt: new Date(),
    };

    room.players.push(player);
    this.playerToRoom.set(playerId, roomId);
    console.log(`Player ${playerName} joined room ${roomId}`);
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
}
