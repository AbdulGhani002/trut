import { MatchmakingRequest } from '../../../shared/types/game';

export class MatchmakingService {
  // Split queues to isolate modes
  private queue1v1: MatchmakingRequest[] = [];
  private queue2v2: MatchmakingRequest[] = [];

  addToQueue(
    playerId: string, 
    gameMode: '1v1' | '2v2', 
    playerName?: string,
    betAmount?: number,
    teamMode?: 'solo' | 'team',
    teamMateId?: string
  ): MatchmakingRequest {
    // Validate bet amount
    if (betAmount !== undefined && betAmount < 0) {
      throw new Error('Bet amount cannot be negative');
    }

    // Validate team consistency
    if (teamMode === 'team' && !teamMateId) {
      throw new Error('Team mode requires a teammate ID');
    }
    if (teamMateId && teamMode !== 'team') {
      throw new Error('Teammate ID provided but not in team mode');
    }
    // Ensure player is not in any queue already (reconnects, reloads, etc.)
    this.removeFromQueue(playerId);
    const request: MatchmakingRequest = { 
      playerId, 
      gameMode, 
      playerName, 
      timestamp: new Date(),
      betAmount,
      teamMode,
      teamMateId
    };
    if (gameMode === '1v1') {
      this.queue1v1.push(request);
    } else {
      this.queue2v2.push(request);
    }
    console.log(
      `Player ${playerName || playerId} added to matchmaking queue for ${gameMode}` +
      `${betAmount !== undefined ? ` (bet: ${betAmount})` : ''}` +
      `${teamMode ? ` (mode: ${teamMode})` : ''}`
    );
    
    // Debug: Show current queue state for the relevant mode
    if (gameMode === '2v2') {
      console.log(`2v2 Queue now has ${this.queue2v2.length} players:`,
        this.queue2v2.map(req => `${req.playerName || req.playerId}(bet:${req.betAmount ?? 'n/a'},mode:${req.teamMode})`).join(', ')
      );
    } else {
      console.log(`1v1 Queue now has ${this.queue1v1.length} players:`,
        this.queue1v1.map(req => `${req.playerName || req.playerId}`).join(', ')
      );
    }
    
    return request;
  }

  removeFromQueue(playerId: string): boolean {
    const initialTotal = this.queue1v1.length + this.queue2v2.length;
    this.queue1v1 = this.queue1v1.filter(req => req.playerId !== playerId);
    this.queue2v2 = this.queue2v2.filter(req => req.playerId !== playerId);
    return (this.queue1v1.length + this.queue2v2.length) < initialTotal;
  }

  findMatch(gameMode: '1v1' | '2v2', betAmount?: number): MatchmakingRequest[] | null {
    if (gameMode === '1v1') {
      return this.find1v1Match();
    } else {
      return this.find2v2Match(betAmount);
    }
  }

  private find1v1Match(): MatchmakingRequest[] | null {
    if (this.queue1v1.length >= 2) {
      const matched = this.queue1v1.slice(0, 2);
      // consume matched
      const matchedIds = new Set(matched.map(m => m.playerId));
      this.queue1v1 = this.queue1v1.filter(r => !matchedIds.has(r.playerId));
      console.log(`1v1 Match found: ${matched.map(m => m.playerId).join(' vs ')}`);
      return matched;
    }
    return null;
  }

  private find2v2Match(betAmount?: number): MatchmakingRequest[] | null {
    // Solo queue: pick first 4 players
    const FIXED_2V2_BET = 300;
    const soloQueue = this.queue2v2.filter(req => req.teamMode === 'solo');

    console.log(`2v2 Match check: Found ${soloQueue.length}/4 players in solo queue`);
    if (soloQueue.length >= 4) {
      const matched = soloQueue.slice(0, 4);
      const matchedIds = new Set(matched.map(m => m.playerId));
      this.queue2v2 = this.queue2v2.filter(r => !matchedIds.has(r.playerId));
      console.log(`🎮 2v2 Solo match found (fixed bet: ${FIXED_2V2_BET}): ${matched.map(m => m.playerName || m.playerId).join(', ')}`);
      return matched;
    }

    // TODO: Add team-based matchmaking (teams of 2 looking for opponents)
    return null;
  }

  getQueue(): MatchmakingRequest[] {
    return [...this.queue1v1, ...this.queue2v2];
  }

  getQueueByMode(gameMode: '1v1' | '2v2'): MatchmakingRequest[] {
    return gameMode === '1v1' ? [...this.queue1v1] : [...this.queue2v2];
  }

  // 2v2 specific methods

  get2v2QueueByBetAmount(betAmount: number): MatchmakingRequest[] {
    // All 2v2 games use fixed bet amount of 300 - ignore betAmount parameter
    return this.queue2v2.filter(req => req.teamMode === 'solo');
  }

  getEstimatedWaitTime(gameMode: '1v1' | '2v2', betAmount?: number): number {
    if (gameMode === '1v1') {
      const queue = this.queue1v1;
      return queue.length >= 1 ? 30 : 120; // Seconds
    } else {
      const queue = this.get2v2QueueByBetAmount(300); // Fixed bet amount for 2v2
      const playersNeeded = 4 - queue.length;
      return playersNeeded <= 0 ? 10 : playersNeeded * 45; // Seconds per player needed
    }
  }

  canCreateTeamMatch(teamRequests: MatchmakingRequest[]): boolean {
    // Check if we have complete teams (2 players each) ready to match
    const teamGroups = new Map<string, MatchmakingRequest[]>();
    
    teamRequests.forEach(req => {
      if (req.teamMateId) {
        const teamKey = [req.playerId, req.teamMateId].sort().join('-');
        if (!teamGroups.has(teamKey)) {
          teamGroups.set(teamKey, []);
        }
        teamGroups.get(teamKey)!.push(req);
      }
    });

    // Check if we have at least 2 complete teams
    const completeTeams = Array.from(teamGroups.values()).filter(team => team.length === 2);
    return completeTeams.length >= 2;
  }

  findTeamMatch(betAmount: number): MatchmakingRequest[] | null {
    // All 2v2 games use fixed bet amount of 300 - ignore betAmount parameter
    const teamRequests = this.queue2v2.filter(req => req.teamMode === 'team');

    // Group by team (playerId + teamMateId sorted)
    const teamGroups = new Map<string, MatchmakingRequest[]>();
    teamRequests.forEach(req => {
      if (req.teamMateId) {
        const teamKey = [req.playerId, req.teamMateId].sort().join('-');
        if (!teamGroups.has(teamKey)) {
          teamGroups.set(teamKey, []);
        }
        teamGroups.get(teamKey)!.push(req);
      }
    });

    // Select first two complete teams
    const completeTeams = Array.from(teamGroups.values()).filter(team => team.length === 2);
    if (completeTeams.length >= 2) {
      const matched = [...completeTeams[0], ...completeTeams[1]];
      const matchedIds = new Set(matched.map(m => m.playerId));
      this.queue2v2 = this.queue2v2.filter(r => !matchedIds.has(r.playerId));
      console.log(`2v2 Team match found (fixed bet: 300): ${matched.map(m => m.playerId).join(', ')}`);
      return matched;
    }

    return null;
  }

  // Check all possible matches periodically
  checkForMatches(): { gameMode: '1v1' | '2v2'; matches: MatchmakingRequest[]; betAmount?: number }[] {
    const foundMatches: { gameMode: '1v1' | '2v2'; matches: MatchmakingRequest[]; betAmount?: number }[] = [];

    // Check 1v1
    const match1v1 = this.find1v1Match();
    if (match1v1) {
      foundMatches.push({ gameMode: '1v1', matches: match1v1 });
    }

    // Check 2v2 - all games use fixed bet amount of 300
    const has2v2Players = this.queue2v2.length > 0;
    console.log(`Periodic check: Has 2v2 players: ${has2v2Players}, 1v1 queue: ${this.queue1v1.length}, 2v2 queue: ${this.queue2v2.length}`);
    if (has2v2Players) {
      const FIXED_2V2_BET = 300;
      
      const match2v2Solo = this.find2v2Match(FIXED_2V2_BET);
      if (match2v2Solo) {
        console.log(`✅ Found 2v2 solo match with ${match2v2Solo.length} players`);
        foundMatches.push({ gameMode: '2v2', matches: match2v2Solo, betAmount: FIXED_2V2_BET });
      }

      const match2v2Team = this.findTeamMatch(FIXED_2V2_BET);
      if (match2v2Team) {
        console.log(`✅ Found 2v2 team match with ${match2v2Team.length} players`);
        foundMatches.push({ gameMode: '2v2', matches: match2v2Team, betAmount: FIXED_2V2_BET });
      }
    }

    return foundMatches;
  }
}
