import { BaseTrutEngine } from '../../core/BaseTrutEngine';
import { Card, GameResult, GameRoom, Player, TrutGameState } from '../../../../../shared/types/game';

export class TrutBotEngine extends BaseTrutEngine {
  startGame(room: GameRoom): GameResult<TrutGameState> {
    if (room.players.length !== 2) {
      return { success: false, error: 'Bot mode requires exactly one human and one bot' };
    }

    const gameState = this.createInitialGameState(room, {
      mode: 'bot1v1',
      maxRounds: 5,
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
        this.scoreRound(gameState, participants, players);

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

    const opponent = players.find(p => p.id !== playerId);
    gameState.challengeRespondent = opponent?.id;

    return { success: true, data: gameState };
  }

  processChallengeResponse(
    gameState: TrutGameState,
    playerId: string,
    accept: boolean,
    players: Player[]
  ): GameResult<TrutGameState> {
    if (accept) {
      gameState.challengeAccepted = true;
      gameState.phase = 'playing';
      gameState.awaitingChallengeResponse = false;
      return { success: true, data: gameState };
    }

    gameState.challengeAccepted = false;
    gameState.phase = 'scoring';
    gameState.awaitingChallengeResponse = false;

    const playerIds = Object.keys(gameState.hands);
    const trutingTeam = this.getTeamForPlayer(players, gameState.trutingPlayer!);
    const teamKey = trutingTeam;
    gameState.scores[teamKey].cannets++;
    this.convertCannets(gameState.scores);

    if (this.isGameEnded(gameState)) {
      gameState.gameEnded = true;
      gameState.winner = this.getWinner(gameState);
      return { success: true, data: gameState };
    }

    this.startNewRound(gameState, playerIds);
    return { success: true, data: gameState };
  }

  private scoreRound(gameState: TrutGameState, playerIds: string[], players: Player[]): void {
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

  private getTeamForPlayer(players: Player[], playerId: string): 'team1' | 'team2' {
    const player = players.find(p => p.id === playerId);
    return player?.team === 'team2' ? 'team2' : 'team1';
  }
}

