"use client";
import { useRouter } from "next/navigation";

export default function TutorialPage() {
  const router = useRouter();

  return (
    <div className="px-6 py-10 md:py-14">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <button
            onClick={() => router.back()}
            className="mb-4 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition text-white/80 text-sm"
          >
            ← Back to Dashboard
          </button>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-2">TRUT Tutorial</h1>
          <p className="text-white/60">Learn how to play the classic card game</p>
        </div>

        {/* Tutorial Content */}
        <div className="glass-panel p-6 md:p-8 space-y-8">
          
          {/* Game Overview */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="text-3xl" aria-hidden>🎯</span>{' '}
              What is TRUT?
            </h2>
            <div className="text-white/80 space-y-3">
              <p>
                TRUT is a strategic card game that combines elements of bluffing, psychology, and tactical play. 
                The goal is to win tricks by playing the highest card, but the twist is that you can challenge 
                your opponent&apos;s claims with a &quot;TRUT&quot; call.
              </p>
              <p>
                The game uses a 32-card deck (7, 8, 9, 10, J, Q, K, A in all four suits) and can be played 
                in 1v1 or 2v2 team formats.
              </p>
            </div>
          </section>

          {/* Card Values */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="text-3xl" aria-hidden>🃏</span>{' '}
              Card Values & Strength
            </h2>
            <div className="text-white/80 space-y-3">
              <p>Cards are ranked by strength from highest to lowest:</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                {[
                  { rank: '7', strength: 'Highest (8 points)' },
                  { rank: '8', strength: '7 points' },
                  { rank: 'A', strength: '6 points' },
                  { rank: 'K', strength: '5 points' },
                  { rank: 'Q', strength: '4 points' },
                  { rank: 'J', strength: '3 points' },
                  { rank: '10', strength: '2 points' },
                  { rank: '9', strength: 'Lowest (1 point)' }
                ].map((card) => (
                  <div key={card.rank} className="bg-white/5 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-white">{card.rank}</div>
                    <div className="text-xs text-white/60">{card.strength}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Basic Gameplay */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="text-3xl" aria-hidden>🎮</span>{' '}
              How to Play
            </h2>
            <div className="text-white/80 space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">1. Starting the Game</h3>
                <p>Each player receives cards from a shuffled deck. Players take turns playing one card at a time to form a &quot;trick&quot;.</p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">2. Playing Cards</h3>
                <p>On your turn, select a card from your hand to play. The card with the highest strength wins the trick.</p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">3. Winning Tricks</h3>
                <p>The player who plays the highest card wins the trick and becomes the next player to lead. If there&apos;s a tie (same rank), it becomes a &quot;rotten trick&quot; and no one wins.</p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">4. TRUT Calls</h3>
                <p>At any point, you can call &quot;TRUT&quot; to challenge your opponent. This forces them to either accept the challenge (play for the trick) or fold (give up the trick).</p>
              </div>
            </div>
          </section>

          {/* Scoring */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="text-3xl" aria-hidden>📊</span>{' '}
              Scoring System
            </h2>
            <div className="text-white/80 space-y-3">
              <p>The game is played in rounds. Each round consists of multiple tricks until all cards are played.</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Truts:</strong> Tricks won by your team</li>
                <li><strong>Cannets:</strong> Tricks won by the opponent team</li>
                <li><strong>Rotten Tricks:</strong> Tied tricks that no one wins</li>
                <li><strong>Brelan:</strong> Special bonus for playing three cards of the same rank</li>
              </ul>
              <p>The team with the most truts at the end of the round wins that round. The first team to win enough rounds wins the game.</p>
            </div>
          </section>

          {/* Strategy Tips */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="text-3xl" aria-hidden>🧠</span>{' '}
              Strategy Tips
            </h2>
            <div className="text-white/80 space-y-3">
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Bluffing:</strong> Sometimes play lower cards to make your opponent think you have better ones</li>
                <li><strong>Card Counting:</strong> Keep track of which cards have been played to predict what your opponent might have</li>
                <li><strong>TRUT Timing:</strong> Use TRUT calls strategically - don&apos;t waste them on obvious wins</li>
                <li><strong>Team Play (2v2):</strong> Coordinate with your teammate and communicate through your plays</li>
                <li><strong>Save High Cards:</strong> Don&apos;t always play your strongest cards immediately</li>
              </ul>
            </div>
          </section>

          {/* Game Modes */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <span className="text-3xl" aria-hidden>🎯</span>{' '}
              Game Modes
            </h2>
            <div className="text-white/80 space-y-4">
              <div className="bg-white/5 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-2">🤖 You vs Bot</h3>
                <p>Practice against an AI opponent. Perfect for learning the rules and developing your strategy. Free to play!</p>
              </div>
              
              <div className="bg-white/5 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-2">👥 2v2 Realtime</h3>
                <p>Team up with a friend or play solo queue against other players. Costs 300 tokens to enter. Win tokens by playing well!</p>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
