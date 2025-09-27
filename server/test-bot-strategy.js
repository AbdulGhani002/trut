// Simple test to verify bot strategy works
const { BotStrategy } = require('./dist/game/modes/bot1v1/BotStrategy');

// Mock game state for testing
const mockGameState = {
  scores: {
    team1: { truts: 2, cannets: 1 },
    team2: { truts: 1, cannets: 2 }
  },
  hands: {
    'bot-player': [
      { id: '1', suit: 'hearts', rank: 'A' },
      { id: '2', suit: 'spades', rank: 'K' },
      { id: '3', suit: 'clubs', rank: 'Q' }
    ],
    'human-player': [
      { id: '4', suit: 'diamonds', rank: 'J' },
      { id: '5', suit: 'hearts', rank: '10' }
    ]
  }
};

const mockBot = {
  id: 'bot-player',
  name: 'Bot',
  team: 'team1',
  isBot: true,
  botProfile: { difficulty: 'normal' }
};

const mockHuman = {
  id: 'human-player', 
  name: 'Human',
  team: 'team2',
  isBot: false
};

const strategy = new BotStrategy();

console.log('Testing bot strategy...');
console.log('Game state: Bot winning 2-1, Bot has strong hand (A,K,Q), Human has weak hand (J,10)');

// Test multiple decisions
for (let i = 0; i < 10; i++) {
  const decision = strategy.shouldAcceptChallenge(mockGameState, mockBot, mockHuman, 'normal');
  console.log(`Decision ${i + 1}: ${decision ? 'ACCEPT' : 'REJECT'}`);
}
