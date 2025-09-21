import { GameRoom, TrutGameState, Card, TrickCard, TeamScores, GameEvent, GameResult, Player } from '../../../shared/types/game';

export class TrutGameEngine {
  
  startGame(room: GameRoom): GameResult<TrutGameState> {
    if (room.players.length < room.maxPlayers) {
      return { success: false, error: 'Not enough players' };
    }

    // Assign teams for 2v2 mode
    if (room.gameMode === '2v2') {
      this.assignTeams(room);
    }

    const gameState = this.createInitialGameState(room);
    room.gameState = gameState;
    room.status = 'playing';
    
    console.log(`Game started in room ${room.id} (${room.gameMode})`);
    return { success: true, data: gameState };
  }

  processCardPlay(gameState: TrutGameState, playerId: string, cardData: Card, roomPlayers?: Player[]): GameResult<TrutGameState> {
    if (gameState.currentPlayer !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    // Remove card from player's hand
    const playerHand = gameState.hands[playerId] || [];
    const cardIndex = playerHand.findIndex(c => c.id === cardData.id);
    if (cardIndex === -1) {
      return { success: false, error: 'Card not in hand' };
    }
    
    playerHand.splice(cardIndex, 1);
    
    // Add card to current trick
    gameState.currentTrick.push({ playerId, card: cardData });
    
    // Get player order for next player calculation
    const players = Object.keys(gameState.hands);
    const currentIndex = players.findIndex(p => p === playerId);
    const nextIndex = (currentIndex + 1) % players.length;
    
    if (gameState.currentTrick.length === players.length) {
      // Trick is complete, evaluate winner
      this.evaluateTrick(gameState, players);
      
      // Check if round is complete (all hands empty)
      const handsEmpty = players.every(p => gameState.hands[p].length === 0);
      if (handsEmpty) {
        this.scoreRound(gameState, players, roomPlayers || []);
        
        // Check for game end
        if (this.isGameEnded(gameState)) {
          gameState.gameEnded = true;
          gameState.winner = this.getWinner(gameState);
          return { success: true, data: gameState };
        }
        
        // Start new round
        this.startNewRound(gameState, players);
        gameState.newRoundStarted = true;
      }
    } else {
      // Move to next player
      gameState.currentPlayer = players[nextIndex];
      gameState.turn = (gameState.turn || 0) + 1;
    }

    return { success: true, data: gameState };
  }

  processTrutCall(gameState: TrutGameState, playerId: string, players: Player[]): GameResult<TrutGameState> {
    gameState.phase = 'truting';
    gameState.hasPlayerTruted = true;
    gameState.trutingPlayer = playerId;
    gameState.challengeAccepted = false;
    gameState.awaitingChallengeResponse = true;
    
    // Find opponents who need to respond (different for 1v1 vs 2v2)
    const trutingPlayer = players.find(p => p.id === playerId);
    if (!trutingPlayer) {
      return { success: false, error: 'Truting player not found' };
    }

    if (players.length === 2) {
      // 1v1 mode
      const opponent = players.find(p => p.id !== playerId);
      gameState.challengeRespondent = opponent?.id;
    } else {
      // 2v2 mode - opponents from other team respond in clockwise order
      const opponents = players.filter(p => p.team !== trutingPlayer.team);
      gameState.challengeRespondents = opponents.map(p => p.id);
      gameState.pendingChallengeResponses = opponents.map(p => ({ playerId: p.id }));
      
      // Find first respondent (clockwise from dealer's left)
      const dealerIndex = gameState.dealerIndex || 0;
      const nextPlayerIndex = (dealerIndex + 1) % players.length;
      let currentRespondent: string | undefined = undefined;
      
      for (let i = 0; i < opponents.length; i++) {
        const checkIndex = (nextPlayerIndex + i) % players.length;
        const checkPlayer = players[checkIndex];
        if (opponents.some(opp => opp.id === checkPlayer.id)) {
          currentRespondent = checkPlayer.id;
          break;
        }
      }
      
      gameState.challengeRespondent = currentRespondent;
    }
    
    return { success: true, data: gameState };
  }

  processChallengeResponse(gameState: TrutGameState, playerId: string, accept: boolean, players: Player[]): GameResult<TrutGameState> {
    // Update pending responses for 2v2
    if (gameState.pendingChallengeResponses) {
      const responseIndex = gameState.pendingChallengeResponses.findIndex(r => r.playerId === playerId);
      if (responseIndex !== -1) {
        gameState.pendingChallengeResponses[responseIndex].response = accept;
      }
    }

    if (accept) {
      // If ANY opponent accepts in 2v2, challenge is accepted
      gameState.challengeAccepted = true;
      gameState.phase = 'playing';
      gameState.awaitingChallengeResponse = false;
    } else {
      // In 2v2, need ALL opponents to fold
      if (players.length === 4) {
        const allResponded = gameState.pendingChallengeResponses?.every(r => r.response !== undefined);
        const anyAccepted = gameState.pendingChallengeResponses?.some(r => r.response === true);
        
        if (anyAccepted) {
          gameState.challengeAccepted = true;
          gameState.phase = 'playing';
          gameState.awaitingChallengeResponse = false;
        } else if (allResponded) {
          // All folded - Truting team gets Small point
          gameState.challengeAccepted = false;
          gameState.phase = 'scoring';
          gameState.awaitingChallengeResponse = false;
          
          const trutingPlayer = players.find(p => p.id === gameState.trutingPlayer);
          const teamKey = trutingPlayer?.team === 'team1' ? 'team1' : 'team2';
          gameState.scores[teamKey].cannets++;
          this.convertCannets(gameState.scores);
          
          // Check for game end
          if (this.isGameEnded(gameState)) {
            gameState.gameEnded = true;
            gameState.winner = this.getWinner(gameState);
            return { success: true, data: gameState };
          }
          
          // Start new round
          this.startNewRound(gameState, players.map(p => p.id));
        } else {
          // Move to next opponent
          const nextRespondent = this.getNextRespondent(gameState, players);
          gameState.challengeRespondent = nextRespondent;
        }
      } else {
        // 1v1 mode - single fold means trut unchallenged
        gameState.challengeAccepted = false;
        gameState.phase = 'scoring';
        gameState.awaitingChallengeResponse = false;
        
        const playerIds = Object.keys(gameState.hands);
        // For 1v1 mode, use simple position-based logic
        const trutingTeam = this.getTeamForPlayer1v1(playerIds, gameState.trutingPlayer!);
        const teamKey = trutingTeam === 1 ? 'team1' : 'team2';
        gameState.scores[teamKey].cannets++;
        this.convertCannets(gameState.scores);
        
        // Check for game end
        if (this.isGameEnded(gameState)) {
          gameState.gameEnded = true;
          gameState.winner = this.getWinner(gameState);
          return { success: true, data: gameState };
        }
        
        // Start new round
        this.startNewRound(gameState, playerIds);
      }
    }
    
    return { success: true, data: gameState };
  }

  private createInitialGameState(room: GameRoom): TrutGameState {
    const deck = this.createAndShuffleDeck();
    const hands = this.dealCards(room.players.map(p => p.id), deck);
    
    const dealerIndex = 0; // First dealer is at index 0
    const startingPlayerIndex = (dealerIndex + 1) % room.players.length; // Player to dealer's left
    
    return {
      currentPlayer: room.players[startingPlayerIndex].id, // Player to dealer's left starts
      turn: 1,
      phase: 'playing',
      scores: { team1: { truts: 0, cannets: 0 }, team2: { truts: 0, cannets: 0 } },
      currentTrick: [],
      tricks: [],
      trickWinners: [],
      hands,
      deck,
      gameStarted: new Date(),
      hasPlayerTruted: false,
      challengeAccepted: false,
      dealerIndex: dealerIndex,
      rottenTricks: [],
      maxRounds: room.gameMode === '2v2' ? 3 : 5, // Best of 3 tricks per round in 2v2
      roundNumber: 1,
    };
  }

  private createAndShuffleDeck(): Card[] {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
    const ranks = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
    const deck = suits.flatMap((suit) => 
      ranks.map((rank) => ({ 
        suit, 
        rank, 
        id: `${rank}_of_${suit}_${Math.random().toString(36).slice(2, 8)}` 
      }))
    );
    
    // Fisher-Yates shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    
    return deck;
  }

  private dealCards(playerIds: string[], deck: Card[]): Record<string, Card[]> {
    const hands: Record<string, Card[]> = {};
    playerIds.forEach(id => hands[id] = []);
    
    // Deal 3 cards to each player
    for (let round = 0; round < 3; round++) {
      for (const playerId of playerIds) {
        const card = deck.pop();
        if (card) hands[playerId].push(card);
      }
    }
    
    return hands;
  }

  private evaluateTrick(gameState: TrutGameState, players: string[]): void {
    const trick = gameState.currentTrick;
    const strengths = this.calculateCardStrengths(trick);
    const maxStrength = Math.max(...strengths.map(s => s.strength));
    
    const winnersWithMaxStrength = strengths.filter(s => s.strength === maxStrength);
    
    if (winnersWithMaxStrength.length === 1) {
      // Clear winner
      const winner = winnersWithMaxStrength[0];
      gameState.tricks.push([...trick]);
      gameState.currentTrick = [];
      gameState.currentPlayer = winner.playerId;
      gameState.turn = (gameState.turn || 0) + 1;
      gameState.trickWinners.push(winner.playerId);
    } else {
      // Rotten trick (tie) - store separately and assign to next trick winner
      if (!gameState.rottenTricks) gameState.rottenTricks = [];
      gameState.rottenTricks.push([...trick]);
      
      gameState.tricks.push([...trick]);
      gameState.currentTrick = [];
      
      // "Who rots, un-rots" - first player who played the highest card leads next trick
      const firstHighCardPlayer = winnersWithMaxStrength[0];
      gameState.currentPlayer = firstHighCardPlayer.playerId;
      gameState.turn = (gameState.turn || 0) + 1;
      gameState.trickWinners.push('rotten');
    }
  }

  private calculateCardStrengths(trick: TrickCard[]): { playerId: string; strength: number }[] {
    // TRUT strength order: 7 > 8 > A > K > Q > J > 10 > 9
    const strengthMap: Record<string, number> = {
      '7': 8, '8': 7, 'A': 6, 'K': 5, 'Q': 4, 'J': 3, '10': 2, '9': 1
    };
    
    return trick.map(t => ({
      playerId: t.playerId,
      strength: strengthMap[t.card.rank] || 0
    }));
  }

  private scoreRound(gameState: TrutGameState, players: string[], roomPlayers: Player[]): void {
    // Count trick winners by team
    let team1Tricks = 0;
    let team2Tricks = 0;
    
    gameState.trickWinners.forEach((winnerId, index) => {
      if (winnerId === 'rotten') {
        // Rotten tricks go to the winner of the next non-rotten trick
        // If this is the last trick and it's rotten, it goes to the last non-rotten winner
        const nextWinner = this.findNextNonRottenWinner(gameState.trickWinners, index);
        if (nextWinner) {
          const team = this.getTeamForPlayer(roomPlayers, nextWinner);
          if (team === 'team1') team1Tricks++;
          else team2Tricks++;
        }
      } else {
        const team = this.getTeamForPlayer(roomPlayers, winnerId);
        if (team === 'team1') team1Tricks++;
        else team2Tricks++;
      }
    });

    if (!gameState.hasPlayerTruted) {
      // Normal scoring - winner gets small token
      if (team1Tricks > team2Tricks) {
        gameState.scores.team1.cannets++;
      } else if (team2Tricks > team1Tricks) {
        gameState.scores.team2.cannets++;
      }
      // Tie = no points
    } else if (!gameState.challengeAccepted) {
      // Trut was called but folded - already handled in processChallengeResponse
    } else {
      // Trut was accepted - winner gets long token, loser loses all small tokens
      const trutingTeam = this.getTeamForPlayer(roomPlayers, gameState.trutingPlayer!);
      const trutingWins = trutingTeam === 'team1' ? team1Tricks : team2Tricks;
      const oppWins = trutingTeam === 'team1' ? team2Tricks : team1Tricks;
      
      if (trutingWins > oppWins) {
        // Truting team wins
        const teamKey = trutingTeam;
        const oppKey = trutingTeam === 'team1' ? 'team2' : 'team1';
        gameState.scores[teamKey].truts++;
        gameState.scores[oppKey].cannets = 0; // Opponent loses all small tokens
      } else if (oppWins > trutingWins) {
        // Opposing team wins
        const oppKey = trutingTeam === 'team1' ? 'team2' : 'team1';
        const teamKey = trutingTeam;
        gameState.scores[oppKey].truts++;
        gameState.scores[teamKey].cannets = 0; // Truting team loses all small tokens
      }
      // Tie - no scoring change
    }

    this.convertCannets(gameState.scores);
    gameState.roundEndedAt = new Date();
    this.resetRoundState(gameState);
  }

  private convertCannets(scores: TeamScores): void {
    (['team1', 'team2'] as const).forEach(teamKey => {
      if (scores[teamKey].cannets >= 3) {
        const conversions = Math.floor(scores[teamKey].cannets / 3);
        scores[teamKey].truts += conversions;
        scores[teamKey].cannets = scores[teamKey].cannets % 3;
        const otherTeam = teamKey === 'team1' ? 'team2' : 'team1';
        scores[otherTeam].cannets = 0;
      }
    });
  }

  private resetRoundState(gameState: TrutGameState): void {
    gameState.trickWinners = [];
    gameState.currentTrick = [];
    gameState.tricks = [];
    gameState.hasPlayerTruted = false;
    gameState.trutingPlayer = undefined;
    gameState.challengeAccepted = false;
    gameState.awaitingChallengeResponse = false;
    gameState.challengeRespondent = undefined;
    gameState.phase = 'playing';
  }

  private startNewRound(gameState: TrutGameState, players: string[]): void {
    if (this.isGameEnded(gameState)) {
      gameState.gameEnded = true;
      gameState.winner = this.getWinner(gameState);
      return;
    }

    // Deal new cards
    const deck = this.createAndShuffleDeck();
    const hands = this.dealCards(players, deck);
    
    gameState.hands = hands;
    gameState.deck = deck;
    
    // 1. Rotate the dealer position clockwise
    const currentDealerIndex = gameState.dealerIndex || 0;
    const newDealerIndex = (currentDealerIndex + 1) % players.length;
    gameState.dealerIndex = newDealerIndex; // Update dealer in game state
    
    // 2. The new starting player is to the left of the new dealer
    const startingPlayerIndex = (newDealerIndex + 1) % players.length;
    gameState.currentPlayer = players[startingPlayerIndex];
    
    // Keep roundNumber for display purposes
    gameState.roundNumber = (gameState.roundNumber || 0) + 1;
    gameState.turn = 1;
    
    console.log(`New round ${gameState.roundNumber} started. New dealer: ${players[newDealerIndex]}. Starting player: ${gameState.currentPlayer}`);
  }

  private getTeamForPlayer(players: Player[], playerId: string): 'team1' | 'team2' {
    // Find the player by ID and return their assigned team property
    const player = players.find(p => p.id === playerId);
    if (!player || !player.team) {
      console.error(`CRITICAL: Could not find player ${playerId} or their team. Awarding point to team2 as safe default.`);
      return 'team2'; // Safe fallback
    }
    return player.team;
  }

  // Legacy method for 1v1 mode
  private getTeamForPlayer1v1(playerIds: string[], playerId: string): 1 | 2 {
    const index = playerIds.findIndex(p => p === playerId);
    return index === 0 ? 1 : 2;
  }

  private isGameEnded(gameState: TrutGameState): boolean {
    return gameState.scores.team1.truts >= 7 || gameState.scores.team2.truts >= 7;
  }

  private getWinner(gameState: TrutGameState): 'team1' | 'team2' {
    return gameState.scores.team1.truts >= 7 ? 'team1' : 'team2';
  }

  // New helper methods for 2v2 functionality

  private assignTeams(room: GameRoom): void {
    // For solo queue, randomly assign teams ensuring partners sit opposite
    if (room.teamMode === 'solo') {
      const shuffledPlayers = [...room.players].sort(() => Math.random() - 0.5);
      shuffledPlayers[0].team = 'team1';
      shuffledPlayers[1].team = 'team2';
      shuffledPlayers[2].team = 'team2';
      shuffledPlayers[3].team = 'team1';
    }
    // For team mode, teams are already assigned when creating the room
  }

  private getNextRespondent(gameState: TrutGameState, players: Player[]): string | undefined {
    if (!gameState.challengeRespondents || !gameState.challengeRespondent) return undefined;
    
    const currentIndex = gameState.challengeRespondents.indexOf(gameState.challengeRespondent);
    const nextIndex = (currentIndex + 1) % gameState.challengeRespondents.length;
    
    // Find next respondent who hasn't responded yet
    for (let i = 0; i < gameState.challengeRespondents.length; i++) {
      const checkIndex = (nextIndex + i) % gameState.challengeRespondents.length;
      const respondentId = gameState.challengeRespondents[checkIndex];
      const hasResponded = gameState.pendingChallengeResponses?.some(r => 
        r.playerId === respondentId && r.response !== undefined
      );
      
      if (!hasResponded) {
        return respondentId;
      }
    }
    
    return undefined;
  }

  private findNextNonRottenWinner(trickWinners: (string | 'rotten')[], rottenIndex: number): string | null {
    // Look forward for next non-rotten winner
    for (let i = rottenIndex + 1; i < trickWinners.length; i++) {
      if (trickWinners[i] !== 'rotten') {
        return trickWinners[i] as string;
      }
    }
    
    // If no forward winner, look backward for last non-rotten winner
    for (let i = rottenIndex - 1; i >= 0; i--) {
      if (trickWinners[i] !== 'rotten') {
        return trickWinners[i] as string;
      }
    }
    
    return null;
  }

  // Brelan (3 of a kind) functionality
  processBrelanCall(
    gameState: TrutGameState,
    playerId: string,
    cards: Card[],
    players: Player[]
  ): GameResult<TrutGameState> {
    // Validate brelan
    if (cards.length !== 3) {
      return { success: false, error: 'Brelan must have exactly 3 cards' };
    }
    
    const ranks = cards.map(c => c.rank);
    if (new Set(ranks).size !== 1) {
      return { success: false, error: 'Brelan cards must have same rank' };
    }
    
    // Verify player has these cards
    const playerHand = gameState.hands[playerId] || [];
    const hasAllCards = cards.every(card => 
      playerHand.some(handCard => handCard.id === card.id)
    );
    
    if (!hasAllCards) {
      return { success: false, error: 'Player does not have all brelan cards' };
    }
    
    // Brelan automatically truts
    gameState.hasBrelanned = true;
    gameState.brellanPlayer = playerId;
    
    // Process as automatic trut using the provided players context
    return this.processTrutCall(gameState, playerId, players);
  }

  // Fortial phase (6 truts + 2 cannets)
  checkForFortialPhase(gameState: TrutGameState, players: Player[]): boolean {
    for (const team of ['team1', 'team2'] as const) {
      if (gameState.scores[team].truts === 6 && gameState.scores[team].cannets >= 2) {
        gameState.isFortialing = true;
        
        // Find dealer's left player from this team
        const dealerIndex = gameState.dealerIndex || 0;
        const leftOfDealerIndex = (dealerIndex + 1) % players.length;
        const leftPlayer = players[leftOfDealerIndex];
        
        if (leftPlayer.team === team) {
          gameState.fortialer = leftPlayer.id;
        } else {
          // Find first player from this team after dealer's left
          for (let i = 1; i < players.length; i++) {
            const checkIndex = (dealerIndex + i) % players.length;
            const checkPlayer = players[checkIndex];
            if (checkPlayer.team === team) {
              gameState.fortialer = checkPlayer.id;
              break;
            }
          }
        }
        
        return true;
      }
    }
    
    return false;
  }

  private getTeamForPlayer2v2(players: Player[], playerId: string): 'team1' | 'team2' | null {
    const player = players.find(p => p.id === playerId);
    return player?.team || null;
  }

  // Process Fortial phase trigger (6 truts + 2 cannets)
  processFortialPhase(gameState: TrutGameState, playerId: string, players: Player[]): GameResult<TrutGameState> {
    const triggered = this.checkForFortialPhase(gameState, players);
    if (!triggered) {
      return { success: false, error: 'Fortial conditions not met' };
    }

    // If a fortialer was determined, optionally ensure they start the next action
    if (gameState.fortialer) {
      gameState.currentPlayer = gameState.fortialer;
    }

    return { success: true, data: gameState };
  }
}
