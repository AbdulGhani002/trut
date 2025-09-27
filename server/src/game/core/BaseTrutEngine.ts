import { Card, GameResult, GameRoom, GameMode, Player, TrickCard, TrutGameState } from '../../../../shared/types/game';

export abstract class BaseTrutEngine {
  abstract startGame(room: GameRoom): GameResult<TrutGameState>;

  abstract processCardPlay(
    gameState: TrutGameState,
    playerId: string,
    cardData: Card,
    players: Player[]
  ): GameResult<TrutGameState>;

  abstract processTrutCall(
    gameState: TrutGameState,
    playerId: string,
    players: Player[]
  ): GameResult<TrutGameState>;

  abstract processChallengeResponse(
    gameState: TrutGameState,
    playerId: string,
    accept: boolean,
    players: Player[]
  ): GameResult<TrutGameState>;

  processBrelanCall(
    gameState: TrutGameState,
    playerId: string,
    cards: Card[],
    players: Player[]
  ): GameResult<TrutGameState> {
    if (cards.length !== 3) {
      return { success: false, error: 'Brelan must have exactly 3 cards' };
    }

    const ranks = cards.map(c => c.rank);
    if (new Set(ranks).size !== 1) {
      return { success: false, error: 'Brelan cards must have same rank' };
    }

    const playerHand = gameState.hands[playerId] || [];
    const hasAllCards = cards.every(card => playerHand.some(handCard => handCard.id === card.id));

    if (!hasAllCards) {
      return { success: false, error: 'Player does not have all brelan cards' };
    }

    gameState.hasBrelanned = true;
    gameState.brellanPlayer = playerId;

    return this.processTrutCall(gameState, playerId, players);
  }

  processFortialPhase(gameState: TrutGameState, playerId: string, players: Player[]): GameResult<TrutGameState> {
    return { success: false, error: 'Fortial phase is not available for this game mode' };
  }

  protected createInitialGameState(
    room: GameRoom,
    options: {
      mode: GameMode;
      maxRounds: number;
    }
  ): TrutGameState {
    const deck = this.createAndShuffleDeck();
    const playerIds = room.players.map(p => p.id);
    const hands = this.dealCards(playerIds, deck);

    const dealerIndex = 0;
    const startingPlayerIndex = (dealerIndex + 1) % playerIds.length;

    return {
      currentPlayer: playerIds[startingPlayerIndex],
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
      dealerIndex,
      rottenTricks: [],
      maxRounds: options.maxRounds,
      roundNumber: 1,
      mode: options.mode,
      botState: options.mode === 'bot1v1' ? { enabled: true } : { enabled: false },
    };
  }

  protected createAndShuffleDeck(): Card[] {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
    const ranks = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
    const deck = suits.flatMap(suit =>
      ranks.map(rank => ({
        suit,
        rank,
        id: `${rank}_of_${suit}_${Math.random().toString(36).slice(2, 8)}`
      }))
    );

    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    return deck;
  }

  protected dealCards(playerIds: string[], deck: Card[]): Record<string, Card[]> {
    const hands: Record<string, Card[]> = {};
    playerIds.forEach(id => {
      hands[id] = [];
    });

    for (let round = 0; round < 3; round++) {
      for (const playerId of playerIds) {
        const card = deck.pop();
        if (card) {
          hands[playerId].push(card);
        }
      }
    }

    return hands;
  }

  protected evaluateTrick(gameState: TrutGameState, players: string[]): void {
    const trick = gameState.currentTrick;
    const strengths = this.calculateCardStrengths(trick);
    const maxStrength = Math.max(...strengths.map(s => s.strength));

    const winnersWithMaxStrength = strengths.filter(s => s.strength === maxStrength);

    if (winnersWithMaxStrength.length === 1) {
      const winner = winnersWithMaxStrength[0];
      gameState.tricks.push([...trick]);
      gameState.currentTrick = [];
      gameState.currentPlayer = winner.playerId;
      gameState.turn = (gameState.turn || 0) + 1;
      gameState.trickWinners.push(winner.playerId);
    } else {
      if (!gameState.rottenTricks) gameState.rottenTricks = [];
      gameState.rottenTricks.push([...trick]);

      gameState.tricks.push([...trick]);
      gameState.currentTrick = [];

      const firstHighCardPlayer = winnersWithMaxStrength[0];
      gameState.currentPlayer = firstHighCardPlayer.playerId;
      gameState.turn = (gameState.turn || 0) + 1;
      gameState.trickWinners.push('rotten');
    }
  }

  protected calculateCardStrengths(trick: TrickCard[]): { playerId: string; strength: number }[] {
    const strengthMap: Record<string, number> = {
      '7': 8,
      '8': 7,
      'A': 6,
      'K': 5,
      'Q': 4,
      'J': 3,
      '10': 2,
      '9': 1,
    };

    return trick.map(t => ({
      playerId: t.playerId,
      strength: strengthMap[t.card.rank] || 0,
    }));
  }

  protected convertCannets(scores: TrutGameState['scores']): void {
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

  protected resetRoundState(gameState: TrutGameState): void {
    gameState.trickWinners = [];
    gameState.currentTrick = [];
    gameState.tricks = [];
    gameState.hasPlayerTruted = false;
    gameState.trutingPlayer = undefined;
    gameState.challengeAccepted = false;
    gameState.awaitingChallengeResponse = false;
    gameState.challengeRespondent = undefined;
    gameState.challengeRespondents = undefined;
    gameState.pendingChallengeResponses = undefined;
    gameState.phase = 'playing';
  }

  protected startNewRound(gameState: TrutGameState, players: string[]): void {
    if (this.isGameEnded(gameState)) {
      gameState.gameEnded = true;
      gameState.winner = this.getWinner(gameState);
      return;
    }

    const deck = this.createAndShuffleDeck();
    const hands = this.dealCards(players, deck);

    gameState.hands = hands;
    gameState.deck = deck;

    const currentDealerIndex = gameState.dealerIndex || 0;
    const newDealerIndex = (currentDealerIndex + 1) % players.length;
    gameState.dealerIndex = newDealerIndex;

    const startingPlayerIndex = (newDealerIndex + 1) % players.length;
    gameState.currentPlayer = players[startingPlayerIndex];

    gameState.roundNumber = (gameState.roundNumber || 0) + 1;
    gameState.turn = 1;
  }

  protected isGameEnded(gameState: TrutGameState): boolean {
    return gameState.scores.team1.truts >= 7 || gameState.scores.team2.truts >= 7;
  }

  protected getWinner(gameState: TrutGameState): 'team1' | 'team2' {
    return gameState.scores.team1.truts >= 7 ? 'team1' : 'team2';
  }

  protected findNextNonRottenWinner(trickWinners: (string | 'rotten')[], rottenIndex: number): string | null {
    for (let i = rottenIndex + 1; i < trickWinners.length; i++) {
      if (trickWinners[i] !== 'rotten') {
        return trickWinners[i] as string;
      }
    }

    for (let i = rottenIndex - 1; i >= 0; i--) {
      if (trickWinners[i] !== 'rotten') {
        return trickWinners[i] as string;
      }
    }

    return null;
  }
}

