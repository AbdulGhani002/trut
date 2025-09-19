import { GameRoom, TrutGameState, Card, TrickCard, TeamScores, GameEvent, GameResult } from '../../../shared/types/game';

export class TrutGameEngine {
  
  startGame(room: GameRoom): GameResult<TrutGameState> {
    if (room.players.length < room.maxPlayers) {
      return { success: false, error: 'Not enough players' };
    }

    const gameState = this.createInitialGameState(room);
    room.gameState = gameState;
    room.status = 'playing';
    
    console.log(`Game started in room ${room.id}`);
    return { success: true, data: gameState };
  }

  processCardPlay(gameState: TrutGameState, playerId: string, cardData: Card): GameResult<TrutGameState> {
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
        this.scoreRound(gameState, players);
        
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

  processTrutCall(gameState: TrutGameState, playerId: string): GameResult<TrutGameState> {
    gameState.phase = 'truting';
    gameState.hasPlayerTruted = true;
    gameState.trutingPlayer = playerId;
    gameState.challengeAccepted = false;
    gameState.awaitingChallengeResponse = true;
    
    // Find the opponent who needs to respond
    const players = Object.keys(gameState.hands);
    const opponent = players.find(p => p !== playerId);
    gameState.challengeRespondent = opponent;
    
    return { success: true, data: gameState };
  }

  processChallengeResponse(gameState: TrutGameState, playerId: string, accept: boolean): GameResult<TrutGameState> {
    gameState.awaitingChallengeResponse = false;
    
    if (accept) {
      // Challenge accepted - continue playing for Long point
      gameState.challengeAccepted = true;
      gameState.phase = 'playing';
    } else {
      // Challenge folded - Truting player gets Small point immediately
      gameState.challengeAccepted = false;
      gameState.phase = 'scoring';
      
      const players = Object.keys(gameState.hands);
      const trutingTeam = this.getTeamForPlayer(players, gameState.trutingPlayer!);
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
      this.startNewRound(gameState, players);
    }
    
    return { success: true, data: gameState };
  }

  private createInitialGameState(room: GameRoom): TrutGameState {
    const deck = this.createAndShuffleDeck();
    const hands = this.dealCards(room.players.map(p => p.id), deck);
    
    return {
      currentPlayer: room.players[0].id,
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
      // Rotten trick (tie)
      const starterPlayer = winnersWithMaxStrength[0];
      gameState.tricks.push([...trick]);
      gameState.currentTrick = [];
      gameState.currentPlayer = starterPlayer.playerId;
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

  private scoreRound(gameState: TrutGameState, players: string[]): void {
    // Count trick winners by team
    let team1Tricks = 0;
    let team2Tricks = 0;
    
    gameState.trickWinners.forEach(winnerId => {
      if (winnerId === 'rotten') return;
      const team = this.getTeamForPlayer(players, winnerId);
      if (team === 1) team1Tricks++;
      else team2Tricks++;
    });

    if (!gameState.hasPlayerTruted) {
      // Normal scoring
      if (team1Tricks > team2Tricks) {
        gameState.scores.team1.cannets++;
      } else if (team2Tricks > team1Tricks) {
        gameState.scores.team2.cannets++;
      }
    } else if (!gameState.challengeAccepted) {
      // Trut was called but folded - already handled in processChallengeResponse
    } else {
      // Trut was accepted - score based on result
      const trutingTeam = this.getTeamForPlayer(players, gameState.trutingPlayer!);
      const trutingWins = trutingTeam === 1 ? team1Tricks : team2Tricks;
      const oppWins = trutingTeam === 1 ? team2Tricks : team1Tricks;
      
      if (trutingWins > oppWins) {
        const teamKey = trutingTeam === 1 ? 'team1' : 'team2';
        const oppKey = trutingTeam === 1 ? 'team2' : 'team1';
        gameState.scores[teamKey].truts++;
        gameState.scores[oppKey].cannets = 0;
      } else if (oppWins > trutingWins) {
        const oppKey = trutingTeam === 1 ? 'team2' : 'team1';
        const teamKey = trutingTeam === 1 ? 'team1' : 'team2';
        gameState.scores[oppKey].truts++;
        gameState.scores[teamKey].cannets = 0;
      }
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
    
    // Alternate starting player each round
    const roundNumber = (gameState.roundNumber || 0) + 1;
    gameState.roundNumber = roundNumber;
    const startingPlayerIndex = (roundNumber - 1) % players.length;
    gameState.currentPlayer = players[startingPlayerIndex];
    gameState.turn = 1;
    
    console.log(`New round ${roundNumber} started, starting player: ${gameState.currentPlayer}`);
  }

  private getTeamForPlayer(players: string[], playerId: string): 1 | 2 {
    const index = players.findIndex(p => p === playerId);
    return index === 0 ? 1 : 2;
  }

  private isGameEnded(gameState: TrutGameState): boolean {
    return gameState.scores.team1.truts >= 7 || gameState.scores.team2.truts >= 7;
  }

  private getWinner(gameState: TrutGameState): 'team1' | 'team2' {
    return gameState.scores.team1.truts >= 7 ? 'team1' : 'team2';
  }
}
