import { MatchmakingRequest } from '../../../shared/types/game';

export class MatchmakingService {
  private matchmakingQueue: MatchmakingRequest[] = [];

  addToQueue(playerId: string, gameMode: string, playerName?: string): MatchmakingRequest {
    this.removeFromQueue(playerId);
    const request: MatchmakingRequest = { 
      playerId, 
      gameMode, 
      playerName, 
      timestamp: new Date() 
    };
    this.matchmakingQueue.push(request);
    console.log(`Player ${playerName || playerId} added to matchmaking queue for ${gameMode}`);
    return request;
  }

  removeFromQueue(playerId: string): boolean {
    const initialLength = this.matchmakingQueue.length;
    this.matchmakingQueue = this.matchmakingQueue.filter(req => req.playerId !== playerId);
    return this.matchmakingQueue.length < initialLength;
  }

  findMatch(gameMode: string): MatchmakingRequest[] | null {
    const candidates = this.matchmakingQueue.filter(req => req.gameMode === gameMode);
    if (candidates.length >= 2) {
      const matched = candidates.slice(0, 2);
      matched.forEach(req => this.removeFromQueue(req.playerId));
      console.log(`Match found for ${gameMode}: ${matched.map(m => m.playerId).join(' vs ')}`);
      return matched;
    }
    return null;
  }

  getQueue(): MatchmakingRequest[] {
    return [...this.matchmakingQueue];
  }

  getQueueByMode(gameMode: string): MatchmakingRequest[] {
    return this.matchmakingQueue.filter(req => req.gameMode === gameMode);
  }
}
