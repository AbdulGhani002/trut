import { BaseTrutEngine } from '../../core/BaseTrutEngine';
import { Card, GameResult, GameRoom, Player, TeamScores, TrutGameState } from '../../../../../shared/types/game';

export class Trut2v2Engine extends BaseTrutEngine {
  startGame(room: GameRoom): GameResult<TrutGameState> {
    // Allow starting with bots if humans are fewer than max players
    if (room.players.length < 4) {
      console.log(`Starting 2v2 with ${room.players.length} players (bots may be present)`);
    }

  this.assignTeams(room);

    const gameState = this.createInitialGameState(room, {
      mode: '2v2',
      maxRounds: 3,
    });

    room.gameState = gameState;
    room.status = 'playing';

    return { success: true, data: gameState };
  }

  processCardPlay(gameState: TrutGameState, playerId: string, cardData: Card, players: Player[]): GameResult<TrutGameState> {
    if (gameState.currentPlayer !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    const playerHand = gameState.hands[playerId] || [];
    const cardIndex = playerHand.findIndex(c => c.id === cardData.id);
    if (cardIndex === -1) {
      return { success: false, error: 'Card not in hand' };
    }

    playerHand.splice(cardIndex, 1);
    gameState.currentTrick.push({ playerId, card: cardData });

    const participants = Object.keys(gameState.hands);
    const currentIndex = participants.findIndex(p => p === playerId);
    const nextIndex = (currentIndex + 1) % participants.length;

    if (gameState.currentTrick.length === participants.length) {
      this.evaluateTrick(gameState, participants);

      const handsEmpty = participants.every(p => gameState.hands[p].length === 0);
      if (handsEmpty) {
        this.scoreRound(gameState, players);

        if (this.isGameEnded(gameState)) {
          gameState.gameEnded = true;
          gameState.winner = this.getWinner(gameState);
          return { success: true, data: gameState };
        }

        this.startNewRound(gameState, participants);
        gameState.newRoundStarted = true;
      }
    } else {
      gameState.currentPlayer = participants[nextIndex];
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

    const trutingPlayer = players.find(p => p.id === playerId);
    if (!trutingPlayer) {
      return { success: false, error: 'Truting player not found' };
    }

    const opponents = players.filter(p => p.team !== trutingPlayer.team);
    gameState.challengeRespondents = opponents.map(p => p.id);
    gameState.pendingChallengeResponses = opponents.map(p => ({ playerId: p.id }));

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

    return { success: true, data: gameState };
  }

  processChallengeResponse(
    gameState: TrutGameState,
    playerId: string,
    accept: boolean,
    players: Player[]
  ): GameResult<TrutGameState> {
    if (gameState.pendingChallengeResponses) {
      const responseIndex = gameState.pendingChallengeResponses.findIndex(r => r.playerId === playerId);
      if (responseIndex !== -1) {
        gameState.pendingChallengeResponses[responseIndex].response = accept;
      }
    }

    if (accept) {
      gameState.challengeAccepted = true;
      gameState.phase = 'playing';
      gameState.awaitingChallengeResponse = false;
      return { success: true, data: gameState };
    }

    const allResponded = gameState.pendingChallengeResponses?.every(r => r.response !== undefined);
    const anyAccepted = gameState.pendingChallengeResponses?.some(r => r.response === true);

    if (anyAccepted) {
      gameState.challengeAccepted = true;
      gameState.phase = 'playing';
      gameState.awaitingChallengeResponse = false;
      return { success: true, data: gameState };
    }

    if (allResponded) {
      gameState.challengeAccepted = false;
      gameState.phase = 'scoring';
      gameState.awaitingChallengeResponse = false;

      const trutingPlayer = players.find(p => p.id === gameState.trutingPlayer);
      if (!trutingPlayer || !trutingPlayer.team) {
        return { success: false, error: 'Truting team not found' };
      }

      // When challenge is folded, truting team gets a cannet
      gameState.scores[trutingPlayer.team].cannets++;
      this.convertCannets(gameState.scores);
      gameState.roundEndedAt = new Date();
      this.resetRoundState(gameState);

      if (this.isGameEnded(gameState)) {
        gameState.gameEnded = true;
        gameState.winner = this.getWinner(gameState);
        return { success: true, data: gameState };
      }

      // Only start a new round (deal new cards) if all hands are empty
      const participants = players.map(p => p.id);
      const handsEmpty = participants.every(p => (gameState.hands[p] || []).length === 0);
      if (handsEmpty) {
        this.startNewRound(gameState, participants);
        gameState.newRoundStarted = true;
      }
      // Otherwise, just continue with current hands (no new cards)
      return { success: true, data: gameState };
    }

    const nextRespondent = this.getNextRespondent(gameState);
    gameState.challengeRespondent = nextRespondent;

    return { success: true, data: gameState };
  }

  processFortialPhase(gameState: TrutGameState, playerId: string, players: Player[]): GameResult<TrutGameState> {
    const triggered = this.checkForFortialPhase(gameState, players);
    if (!triggered) {
      return { success: false, error: 'Fortial conditions not met' };
    }

    if (gameState.fortialer) {
      gameState.currentPlayer = gameState.fortialer;
    }

    return { success: true, data: gameState };
  }

  private scoreRound(gameState: TrutGameState, players: Player[]): void {
    let team1Tricks = 0;
    let team2Tricks = 0;

    gameState.trickWinners.forEach((winnerId, index) => {
      if (winnerId === 'rotten') {
        const nextWinner = this.findNextNonRottenWinner(gameState.trickWinners, index);
        if (nextWinner) {
          const team = this.getTeamForPlayer(players, nextWinner);
          if (team === 'team1') team1Tricks++;
          else team2Tricks++;
        }
      } else {
        const team = this.getTeamForPlayer(players, winnerId);
        if (team === 'team1') team1Tricks++;
        else team2Tricks++;
      }
    });

    if (!gameState.hasPlayerTruted) {
      if (team1Tricks > team2Tricks) {
        gameState.scores.team1.cannets++;
      } else if (team2Tricks > team1Tricks) {
        gameState.scores.team2.cannets++;
      }
    } else if (gameState.challengeAccepted) {
      const trutingTeam = this.getTeamForPlayer(players, gameState.trutingPlayer!);
      const trutingWins = trutingTeam === 'team1' ? team1Tricks : team2Tricks;
      const oppWins = trutingTeam === 'team1' ? team2Tricks : team1Tricks;

      if (trutingWins > oppWins) {
        const teamKey = trutingTeam;
        const oppKey = teamKey === 'team1' ? 'team2' : 'team1';
        gameState.scores[teamKey].truts++;
        gameState.scores[oppKey].cannets = 0;
      } else if (oppWins > trutingWins) {
        const oppKey = trutingTeam === 'team1' ? 'team2' : 'team1';
        const teamKey = trutingTeam;
        gameState.scores[oppKey].truts++;
        gameState.scores[teamKey].cannets = 0;
      }
    }

    this.convertCannets(gameState.scores);
    gameState.roundEndedAt = new Date();
    this.resetRoundState(gameState);
  }

  private assignTeams(room: GameRoom): void {
    if (room.teamMode === 'solo') {
      const shuffledPlayers = [...room.players].sort(() => Math.random() - 0.5);
      // Alternating seating: Team1, Team2, Team1, Team2
      // This prevents teammates from playing consecutively
      shuffledPlayers[0].team = 'team1';
      shuffledPlayers[1].team = 'team2';
      shuffledPlayers[2].team = 'team1';
      shuffledPlayers[3].team = 'team2';
      
      // Log team assignment for debugging
      console.log('🎯 Team assignment (alternating seating):');
      shuffledPlayers.forEach((player, index) => {
        console.log(`  Position ${index + 1}: ${player.name} (${player.team})`);
      });
      console.log('✅ Turn order will be: Team1 → Team2 → Team1 → Team2');
      
      // Validate alternating seating
      const isValid = this.validateAlternatingSeating(shuffledPlayers);
      console.log(`🔍 Alternating seating validation: ${isValid ? '✅ VALID' : '❌ INVALID'}`);
    }
  }

  private validateAlternatingSeating(players: Player[]): boolean {
    // Check if teams alternate (no consecutive teammates)
    for (let i = 0; i < players.length - 1; i++) {
      if (players[i].team === players[i + 1].team) {
        console.log(`❌ Consecutive teammates found: ${players[i].name} (${players[i].team}) and ${players[i + 1].name} (${players[i + 1].team})`);
        return false;
      }
    }
    return true;
  }

  private getTeamForPlayer(players: Player[], playerId: string): 'team1' | 'team2' {
    const player = players.find(p => p.id === playerId);
    if (!player || !player.team) {
      return 'team2';
    }
    return player.team;
  }

  private getNextRespondent(gameState: TrutGameState): string | undefined {
    if (!gameState.challengeRespondents || !gameState.challengeRespondent) return undefined;

    const currentIndex = gameState.challengeRespondents.indexOf(gameState.challengeRespondent);
    const nextIndex = (currentIndex + 1) % gameState.challengeRespondents.length;

    for (let i = 0; i < gameState.challengeRespondents.length; i++) {
      const checkIndex = (nextIndex + i) % gameState.challengeRespondents.length;
      const respondentId = gameState.challengeRespondents[checkIndex];
      const hasResponded = gameState.pendingChallengeResponses?.some(r => r.playerId === respondentId && r.response !== undefined);

      if (!hasResponded) {
        return respondentId;
      }
    }

    return undefined;
  }

  private checkForFortialPhase(gameState: TrutGameState, players: Player[]): boolean {
    for (const team of ['team1', 'team2'] as const) {
      if (gameState.scores[team].truts === 6 && gameState.scores[team].cannets >= 2) {
        gameState.isFortialing = true;

        const dealerIndex = gameState.dealerIndex || 0;
        const leftOfDealerIndex = (dealerIndex + 1) % players.length;
        const leftPlayer = players[leftOfDealerIndex];

        if (leftPlayer.team === team) {
          gameState.fortialer = leftPlayer.id;
        } else {
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
}

