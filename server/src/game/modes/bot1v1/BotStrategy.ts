import { TrutGameState, Player, BotDifficulty } from '../../../../../shared/types/game';

export class BotStrategy {
  private baseAcceptanceRates = {
    easy: 0.7,    // 70% chance to accept
    normal: 0.5,  // 50% chance to accept  
    hard: 0.3     // 30% chance to accept
  };

  shouldAcceptChallenge(
    gameState: TrutGameState,
    botPlayer: Player,
    humanPlayer: Player,
    difficulty: BotDifficulty = 'normal'
  ): boolean {
    // Start with base rate
    let acceptanceRate = this.baseAcceptanceRates[difficulty];
    
    // Apply strategic modifiers
    acceptanceRate += this.getScoreModifier(gameState, botPlayer, humanPlayer);
    acceptanceRate += this.getRoundProgressModifier(gameState);
    acceptanceRate += this.getHandStrengthModifier(gameState, botPlayer);
    
    // Clamp between 0 and 1
    acceptanceRate = Math.max(0, Math.min(1, acceptanceRate));
    
    // Final random decision
    const shouldAccept = Math.random() < acceptanceRate;
    
    console.log(`Bot Decision: Base=${this.baseAcceptanceRates[difficulty]}, Final=${acceptanceRate.toFixed(2)}, Decision=${shouldAccept ? 'ACCEPT' : 'REJECT'}`);
    
    return shouldAccept;
  }

  private getScoreModifier(gameState: TrutGameState, botPlayer: Player, humanPlayer: Player): number {
    const botTeam = botPlayer.team || 'team1';
    const humanTeam = humanPlayer.team || 'team2';
    
    const botScore = gameState.scores[botTeam];
    const humanScore = gameState.scores[humanTeam];
    
    const scoreDiff = botScore.truts - humanScore.truts;
    
    // If bot is losing badly, more likely to accept (desperate)
    if (scoreDiff <= -2) {
      return 0.3; // +30% more likely to accept
    }
    
    // If bot is losing by 1, slightly more likely to accept
    if (scoreDiff === -1) {
      return 0.15; // +15% more likely to accept
    }
    
    // If bot is winning comfortably, less likely to accept (conservative)
    if (scoreDiff >= 2) {
      return -0.2; // -20% less likely to accept
    }
    
    // If bot is winning by 1, slightly less likely to accept
    if (scoreDiff === 1) {
      return -0.1; // -10% less likely to accept
    }
    
    // Even score
    return 0;
  }

  private getRoundProgressModifier(gameState: TrutGameState): number {
    // Count cards left in current round
    const totalCards = Object.values(gameState.hands).reduce((sum, hand) => sum + hand.length, 0);
    
    // Early in round (more cards left) - more conservative
    if (totalCards > 4) {
      return -0.15; // -15% less likely to accept
    }
    
    // Late in round (few cards left) - more aggressive
    if (totalCards <= 2) {
      return 0.25; // +25% more likely to accept
    }
    
    // Mid round
    return 0;
  }

  private getHandStrengthModifier(gameState: TrutGameState, botPlayer: Player): number {
    const botHand = gameState.hands[botPlayer.id] || [];
    
    if (botHand.length === 0) return 0;
    
    // Simple hand strength calculation based on card ranks
    const strengthMap: Record<string, number> = {
      '7': 8, '8': 7, 'A': 6, 'K': 5, 'Q': 4, 'J': 3, '10': 2, '9': 1
    };
    
    const handStrength = botHand.reduce((sum, card) => sum + (strengthMap[card.rank] || 0), 0);
    const averageStrength = handStrength / botHand.length;
    
    // Normalize to 0-1 scale (max possible average is 8)
    const normalizedStrength = averageStrength / 8;
    
    // If bot has strong cards, more likely to accept
    if (normalizedStrength > 0.7) {
      return 0.2; // +20% more likely to accept
    }
    
    // If bot has weak cards, less likely to accept
    if (normalizedStrength < 0.3) {
      return -0.25; // -25% less likely to accept
    }
    
    // Average hand strength
    return 0;
  }
}
