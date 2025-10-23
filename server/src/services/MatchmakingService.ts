import { MatchmakingRequest, GameMode, BotRoomConfig } from '../../../shared/types/game';

export class MatchmakingService {
  private queue: MatchmakingRequest[] = []; // General queue for bot games and other modes
  private queue2v2: MatchmakingRequest[] = [];

  addToQueue(
    playerId: string, 
    gameMode: GameMode, 
    playerName?: string,
    betAmount?: number,
    teamMode?: 'solo' | 'team',
    teamMateId?: string,
    botConfig?: BotRoomConfig
  ): MatchmakingRequest {
    // Validate bet amount
    if (betAmount !== undefined && betAmount < 0) {
      throw new Error('Bet amount cannot be negative');
    }

    // Validate team consistency
    if (gameMode === '2v2' && teamMode === 'team' && !teamMateId) {
      throw new Error('Team mode requires a teammate ID');
    }
    if (gameMode === '2v2' && teamMateId && teamMode !== 'team') {
      throw new Error('Teammate ID provided but not in team mode');
    }
    if (gameMode === 'bot1v1' && !botConfig) {
      throw new Error('Bot config required for bot mode');
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
      teamMateId,
      botConfig
    };
    if (gameMode === '2v2') {
      this.queue2v2.push(request);
    } else if (gameMode === 'bot1v1') {
      this.queue.push(request);
    } else {
      console.warn(`Matchmaking requested for ${gameMode}, which does not use queues. Returning request only.`);
    }
    console.log(
      `Player ${playerName || playerId} added to matchmaking queue for ${gameMode}` +
      `${betAmount !== undefined ? ` (bet: ${betAmount})` : ''}` +
      `${teamMode ? ` (mode: ${teamMode})` : ''}`
    );
    
    if (gameMode === '2v2') {
      console.log(`2v2 Queue now has ${this.queue2v2.length} players:`,
        this.queue2v2.map(req => `${req.playerName || req.playerId}(bet:${req.betAmount ?? 'n/a'},mode:${req.teamMode})`).join(', ')
      );
    }
    
    return request;
  }

  removeFromQueue(playerId: string): boolean {
    const initialTotal2v2 = this.queue2v2.length;
    const initialTotal = this.queue.length;
    this.queue2v2 = this.queue2v2.filter(req => req.playerId !== playerId);
    this.queue = this.queue.filter(req => req.playerId !== playerId);
    return this.queue2v2.length < initialTotal2v2 || this.queue.length < initialTotal;
  }

  findMatch(gameMode: GameMode, betAmount?: number): MatchmakingRequest[] | null {
    if (gameMode === '2v2') {
      return this.find2v2Match(betAmount);
    }
    if (gameMode === 'bot1v1') {
      return this.findBotMatch();
    }
    return null;
  }

  private findBotMatch(): MatchmakingRequest[] | null {
    // For bot games, immediately match any player in the queue
    const botQueue = this.queue.filter(req => req.gameMode === 'bot1v1');
    if (botQueue.length > 0) {
      const matched = botQueue.slice(0, 1); // Take first player
      const matchedIds = new Set(matched.map(m => m.playerId));
      this.queue = this.queue.filter(r => !matchedIds.has(r.playerId));
      console.log(`Bot match found: ${matched.length} player matched`);
      return matched;
    }
    return null;
  }

  private find2v2Match(betAmount?: number): MatchmakingRequest[] | null {
    // Solo queue: pick first 4 players
    const FIXED_2V2_BET = 300;
  const PARTIAL_FILL_WAIT_MS = 15_000; // wait 15s before filling with bots
    const soloQueue = this.queue2v2.filter(req => req.teamMode === 'solo');

    console.log(`2v2 Match check: Found ${soloQueue.length}/4 players in solo queue`);
    if (soloQueue.length >= 4) {
      const matched = soloQueue.slice(0, 4);
      const matchedIds = new Set(matched.map(m => m.playerId));
      this.queue2v2 = this.queue2v2.filter(r => !matchedIds.has(r.playerId));
      console.log(`🎮 2v2 Solo match found (fixed bet: ${FIXED_2V2_BET}): ${matched.map(m => m.playerName || m.playerId).join(', ')}`);
      return matched;
    }

    // Not enough players: after a wait threshold, match whoever is waiting and fill with bots later
    if (soloQueue.length > 0) {
      const now = Date.now();
      const oldest = soloQueue.reduce((min, r) => r.timestamp < min.timestamp ? r : min, soloQueue[0]);
      const waitedMs = now - oldest.timestamp.getTime();
      if (waitedMs >= PARTIAL_FILL_WAIT_MS) {
        const matched = soloQueue.slice(0, 4);
        const matchedIds = new Set(matched.map(m => m.playerId));
        this.queue2v2 = this.queue2v2.filter(r => !matchedIds.has(r.playerId));
        console.log(`🤖 2v2 partial match after wait (${Math.floor(waitedMs/1000)}s): ${matched.map(m => m.playerName || m.playerId).join(', ')}`);
        return matched;
      } else {
        const remaining = Math.ceil((PARTIAL_FILL_WAIT_MS - waitedMs) / 1000);
        console.log(`⏳ Waiting ${remaining}s more before bot-fill for 2v2 (players in queue: ${soloQueue.length})`);
      }
    }

    // TODO: Add team-based matchmaking (teams of 2 looking for opponents)
    return null;
  }

  getQueue(): MatchmakingRequest[] {
    return [...this.queue, ...this.queue2v2];
  }

  getQueueByMode(gameMode: GameMode): MatchmakingRequest[] {
    if (gameMode === '2v2') return [...this.queue2v2];
    if (gameMode === 'bot1v1') return [...this.queue];
    return [];
  }

  // 2v2 specific methods

  get2v2QueueByBetAmount(betAmount: number): MatchmakingRequest[] {
    // All 2v2 games use fixed bet amount of 300 - ignore betAmount parameter
    return this.queue2v2.filter(req => req.teamMode === 'solo');
  }

  getEstimatedWaitTime(gameMode: GameMode, betAmount?: number): number {
    if (gameMode === '2v2') {
      const queue = this.get2v2QueueByBetAmount(300);
      const playersNeeded = 4 - queue.length;
      return playersNeeded <= 0 ? 10 : playersNeeded * 45;
    }
    return 0;
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
  checkForMatches(): { gameMode: GameMode; matches: MatchmakingRequest[]; betAmount?: number }[] {
    const foundMatches: { gameMode: GameMode; matches: MatchmakingRequest[]; betAmount?: number }[] = [];

    // Check for bot games first (immediate match)
    const botMatch = this.findBotMatch();
    if (botMatch) {
      console.log(`✅ Found bot match with ${botMatch.length} player`);
      foundMatches.push({ gameMode: 'bot1v1', matches: botMatch });
    }

    const has2v2Players = this.queue2v2.length > 0;
    console.log(`Periodic check: Has 2v2 players: ${has2v2Players}, 2v2 queue: ${this.queue2v2.length}`);
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
