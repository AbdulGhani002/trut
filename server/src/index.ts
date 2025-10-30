/* eslint-disable max-depth, prefer-template, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, unicorn/no-array-for-each, unicorn/prefer-optional-chain, @typescript-eslint/prefer-optional-chain */
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import cors from 'cors';
import { GameManager } from './services/GameManager';
import { GameEvent, GameRoom } from '../../shared/types/game';
import mongoose from 'mongoose';
import User from '../../shared/models/User';
import { BotStrategy } from './game/modes/bot1v1/BotStrategy';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors({
  origin: ["http://localhost:3000", "http://localhost:3001"],
  credentials: true
}));
app.use(express.json());

const gameManager = new GameManager();
const botStrategy = new BotStrategy();

// Ensure we open a single Mongo connection in this process
const ensureDb = async () => {
  const ready = mongoose.connection.readyState; // 0=disconnected,1=connected,2=connecting
  if (ready !== 1 && ready !== 2) {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
    await mongoose.connect(process.env.MONGODB_URI);
  }
};

// Deduct tokens for a 2v2 room (server-authoritative). Safe to call multiple times; it guards per-room.
const deductedRoomsGlobal = (global as any);
deductedRoomsGlobal.__deductedRooms = deductedRoomsGlobal.__deductedRooms || new Set<string>();
const deductedRooms: Set<string> = deductedRoomsGlobal.__deductedRooms;

const deductTokensForRoom = async (room: GameRoom): Promise<boolean> => {
  // Only apply to 2v2 paid rooms
  if (room.gameMode !== '2v2') return true;
  if (deductedRooms.has(room.id)) return true;
  // Mark early to avoid re-entrancy
  deductedRooms.add(room.id);
  try {
    await ensureDb();
  } catch (e) {
    console.error('DB connect failed for deduction:', e);
    return false;
  }

  const amount = room.betAmount || 300;
  const humanPlayers = room.players.filter(p => !p.isBot);

  // Verify all human players have enough tokens and identities
  const insufficient: { playerId: string; email?: string }[] = [];
  for (const hp of humanPlayers) {
    try {
      const s = io.sockets.sockets.get(hp.id);
      const identity = s?.data?.identity || {};
      const email = identity?.email;
      if (!email) {
        insufficient.push({ playerId: hp.id, email: undefined });
        continue;
      }
      const user = await User.findOne({ email });
      if (!user || (user.tokens || 0) < amount) {
        insufficient.push({ playerId: hp.id, email });
      }
    } catch (e) {
      console.error('Token deduction verification error:', e);
      insufficient.push({ playerId: hp.id });
    }
  }

  if (insufficient.length > 0) {
    // Notify affected players and abort start
    insufficient.forEach((i) => {
      const sock = io.sockets.sockets.get(i.playerId);
      if (sock) {
        sock.emit('matchmakingRejected', { reason: i.email ? 'insufficient_tokens' : 'not_authenticated', amount });
      }
    });
    console.warn(`Aborting game ${room.id} start: ${insufficient.length} players lacking funds/identity`);
    return false;
  }

  // Deduct tokens now that everyone has funds
  for (const hp of humanPlayers) {
    try {
      const s = io.sockets.sockets.get(hp.id);
      const identity = s?.data?.identity || {};
      const email = identity?.email;
      if (!email) {
        // Shouldn't happen due to verification above
        continue;
      }
      const user = await User.findOne({ email });
      if (user) {
        user.tokens = (user.tokens || 0) - amount;
        await user.save();
        console.log(`💳 Deducted ${amount} tokens from ${email} for game start (${room.id})`);
      }
    } catch (e) {
      console.error('Token deduction error during apply:', e);
      // On error, abort (note: partial deductions may have occurred)
      return false;
    }
  }

  return true;
};

// Helper: if it's a bot's turn, auto-play a card (works for bot1v1 and 2v2 with bots)
const maybeScheduleBotMove = (roomId: string) => {
  const room = gameManager.getRoom(roomId);
  if (!room || !room.gameState) return;
  if (room.gameState.gameEnded) return;
  if (room.gameState.phase !== 'playing') return;
  // find the bot whose turn it is
  const bot = room.players.find(p => p.isBot && p.id === room.gameState!.currentPlayer);
  if (!bot) return;

  // Phase 1: after a short delay, emit a preview state showing the bot's card on table
  console.log(`🤖 Scheduling bot move in room ${roomId} for ${bot.name} (${bot.id}), mode=${room.gameMode}`);
  setTimeout(() => {
  const currentRoom = gameManager.getRoom(roomId);
  if (!currentRoom || !currentRoom.gameState) return;
  if (currentRoom.gameState.phase !== 'playing') return;
  if (currentRoom.gameState.currentPlayer !== bot.id) return;
    const botHand = currentRoom.gameState.hands[bot.id] || [];
    if (botHand.length === 0) return;
    const cardToPlay = botHand[0];
    console.log(`🤖 ${bot.name} (${bot.id}) preview playing ${cardToPlay.rank} of ${cardToPlay.suit}`);

    // Emit preview with the card visible on table before resolution
    const previewState = {
      ...currentRoom.gameState,
      currentTrick: [
        ...(currentRoom.gameState.currentTrick || []),
        { playerId: bot.id, card: cardToPlay }
      ],
      hands: {
        ...currentRoom.gameState.hands,
        [bot.id]: (currentRoom.gameState.hands[bot.id] || []).filter(c => c.id !== cardToPlay.id)
      }
    } as any;

    io.to(currentRoom.id).emit('cardPlayed', {
      playerId: bot.id,
      cardId: cardToPlay.id,
      cardData: cardToPlay,
      gameState: previewState,
      nextPlayer: currentRoom.gameState.currentPlayer
    });

    // Phase 2: after 1.2s, actually process the move (evaluates trick, advances turn)
    setTimeout(() => {
      const latestRoom = gameManager.getRoom(roomId);
      if (!latestRoom || !latestRoom.gameState) return;
      if (latestRoom.gameState.phase !== 'playing') return;
      // If state already advanced, skip
      if (latestRoom.gameState.currentPlayer !== bot.id) return;

      const event: GameEvent = {
        type: 'card_played',
        playerId: bot.id,
        data: { cardId: cardToPlay.id, cardData: cardToPlay },
        timestamp: new Date()
      } as any;

      const result = gameManager.processGameEvent(bot.id, event);
      if (result.success && result.data && result.data.gameState) {
        const updated = result.data;
        console.log(`🤖 ${bot.name} (${bot.id}) played ${cardToPlay.rank} of ${cardToPlay.suit}; next player: ${updated.gameState!.currentPlayer}`);
        io.to(updated.id).emit('cardPlayed', {
          playerId: bot.id,
          cardId: cardToPlay.id,
          cardData: cardToPlay,
          gameState: updated.gameState!,
          nextPlayer: updated.gameState!.currentPlayer
        });

        const roomAfter = updated;
        if (roomAfter.gameState?.newRoundStarted) {
          roomAfter.gameState.newRoundStarted = false;
          setTimeout(() => {
            (async () => {
              const r = gameManager.getRoom(roomAfter.id);
              if (r && r.gameState) {
                if (r.gameState.gameEnded) {
                  const prizeDistribution = gameManager.distributePrizes(r.id);
                  // Update user stats: gamesPlayed, wins, losses and credit prize tokens
                  await ensureDb();
                  const winningTeam = r.gameState.winner;
                  for (const player of r.players) {
                    const ps = io.sockets.sockets.get(player.id);
                    const identity = ps?.data?.identity || {};
                    const email = identity?.email;
                    if (!player.isBot && email) {
                      const user = await User.findOne({ email });
                      if (user) {
                        user.gamesPlayed = (user.gamesPlayed || 0) + 1;
                        if (player.team === winningTeam) {
                          user.wins = (user.wins || 0) + 1;
                        } else {
                          user.losses = (user.losses || 0) + 1;
                        }
                        // Credit prize if applicable
                        const credit = prizeDistribution[player.id] || 0;
                        if (credit > 0) {
                          user.tokens = (user.tokens || 0) + credit;
                          console.log(`💰 Credited ${credit} tokens to ${email} for game ${r.id}`);
                        }
                        await user.save();
                      }
                    }
                  }
                  io.to(r.id).emit('gameEnded', {
                    gameState: r.gameState,
                    winner: r.gameState.winner,
                    prizeDistribution,
                    message: 'Game finished!'
                  });
                } else {
                  r.players.forEach((p) => {
                    const ps = io.sockets.sockets.get(p.id);
                    if (ps) {
                      const sanitized = {
                        ...r,
                        gameState: {
                          ...r.gameState!,
                          hands: {
                            [p.id]: r.gameState!.hands[p.id] || [],
                            ...Object.fromEntries(
                              r.players
                                .filter(x => x.id !== p.id)
                                .map(x => [x.id, (r.gameState!.hands[x.id] || []).length])
                            )
                          }
                        }
                      } as any;
                      ps.emit('newRound', {
                        room: sanitized,
                        gameState: sanitized.gameState,
                        message: 'New round started!',
                        scores: r.gameState!.scores
                      });
                    }
                  });
                  maybeScheduleBotMove(r.id);
                }
              }
            })();
          }, 200);
        } else {
          maybeScheduleBotMove(updated.id);
        }
      }
    }, 1200);
  }, 200);
};

// In 2v2, if a bot is asked to respond to TRUT, schedule an auto response
const maybeScheduleBotChallengeResponse2v2 = (roomId: string) => {
  const room = gameManager.getRoom(roomId);
  if (!room || room.gameMode !== '2v2' || !room.gameState) return;
  const gs = room.gameState;
  if (!gs.awaitingChallengeResponse || !gs.challengeRespondent) return;
  const bot = room.players.find(p => p.isBot && p.id === gs.challengeRespondent);
  if (!bot) return;

  const humanOpponent = room.players.find(p => !p.isBot && p.team !== (bot.team || 'team1'));
  const shouldAccept = humanOpponent
    ? botStrategy.shouldAcceptChallenge(gs, bot, humanOpponent, bot.botProfile?.difficulty || 'normal')
    : Math.random() < 0.5;

  setTimeout(() => {
    const latest = gameManager.getRoom(roomId);
    if (!latest || !latest.gameState) return;
    if (!latest.gameState.awaitingChallengeResponse || latest.gameState.challengeRespondent !== bot.id) return;

    const botEvent: GameEvent = { type: 'challenge_response', playerId: bot.id, data: { accept: shouldAccept }, timestamp: new Date() } as any;
    const res = gameManager.processGameEvent(bot.id, botEvent);
    if (res.success && res.data) {
      io.to(roomId).emit('challengeResponse', {
        playerId: bot.id,
        accept: shouldAccept,
        gameState: res.data.gameState,
        message: shouldAccept ? `${bot.name} accepted the challenge!` : `${bot.name} folded.`
      });

      // If still awaiting another response and it's another bot, schedule again; else resume bot moves
      const after = gameManager.getRoom(roomId);
      if (after?.gameState?.awaitingChallengeResponse) {
        maybeScheduleBotChallengeResponse2v2(roomId);
      } else {
        maybeScheduleBotMove(roomId);
      }
    }
  }, 1200);
};

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    activeRooms: gameManager.getAllRooms().length,
    playersInQueue: gameManager.getMatchmakingQueue().length
  });
});

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Capture identity from client auth payload (populated by NextAuth session on client)
  const { userId, email, username, name } = (socket.handshake.auth || {}) as any;
  (socket.data as any).identity = { userId, email, username, name };

  socket.on('startMatchmaking', async (data) => {
    const { gameMode, playerName, betAmount, teamMode, teamMateId, botConfig } = data || {};
    const playerId = socket.id;

    console.log(`Player ${playerId} starting matchmaking for ${gameMode} (bet: ${betAmount}, mode: ${teamMode})`);

    // Add to queue with 2v2 support
    try {
      // If joining 2v2 ensure the player is authenticated and has enough tokens to cover the bet (default 300)
      if (gameMode === '2v2') {
        const amountRequired = betAmount || 300;

        // If no DB configured, allow queueing for local/dev so bots can fill in later.
        if (!process.env.MONGODB_URI) {
          console.warn('MONGODB_URI not set — skipping token verification for 2v2 (dev mode).');
        } else {
          try {
            await ensureDb();
          } catch (e) {
            console.error('DB connect failed while verifying tokens for 2v2:', e);
            socket.emit('matchmakingRejected', { reason: 'db_unavailable' });
            return;
          }

          const identity = (socket.data as any).identity || {};
          const email = identity.email;
          if (!email) {
            socket.emit('matchmakingRejected', { reason: 'not_authenticated' });
            return;
          }

          try {
            const user = await User.findOne({ email });
            if (!user || (user.tokens || 0) < amountRequired) {
              socket.emit('matchmakingRejected', { reason: 'insufficient_tokens', amount: amountRequired });
              return;
            }
          } catch (e) {
            console.error('Error while checking user tokens for 2v2 matchmaking:', e);
            socket.emit('matchmakingRejected', { reason: 'db_error' });
            return;
          }
        }
      }

      gameManager.addToMatchmakingQueue(
        playerId,
        gameMode || 'bot1v1',
        playerName || 'Player',
        betAmount,
        teamMode,
        teamMateId,
        botConfig
      );
    } catch (err: any) {
      socket.emit('error', { message: err?.message || 'Invalid matchmaking request' });
      return;
    }

    // For 2v2, check for matches periodically instead of immediately
    // This gives all players time to join the queue
    if (gameMode === '2v2') {
      console.log(`2v2 matchmaking started for player ${playerId}, checking for matches...`);
      const queueStatus = gameManager.get2v2QueueStatus(300);
      socket.emit('matchmakingStatus', {
        status: 'searching',
        message: `Looking for ${teamMode === 'solo' ? 'players' : 'team opponents'}...`,
        estimatedWaitTime: queueStatus.estimatedWaitTime,
        playersInQueue: queueStatus.playersInQueue
      });

      // Trigger a match check immediately for 2v2 to speed up matchmaking
      const matches = gameManager.processAllMatchmaking();
      if (matches.length > 0) {
        console.log(`Found ${matches.length} matches during immediate check`);
        matches.forEach(({ gameMode: gm, room, betAmount }) => {
          console.log(`(Immediate) Creating game for ${gm} in room ${room.id} with ${room.players.length} players`);
          // Join all matched players to socket room
          room.players.forEach(player => {
            const playerSocket = io.sockets.sockets.get(player.id);
            if (playerSocket) {
              playerSocket.join(room.id);
              console.log(`(Immediate) Player ${player.id} joined room ${room.id}`);
            } else {
              console.log(`(Immediate) Warning: Player ${player.id} socket not found for room join`);
            }
          });

          io.to(room.id).emit('matchFound', {
            room,
            message: `${gm === '2v2' ? '2v2' : 'Bot 1v1'} match found! Get ready to play!`
          });

          setTimeout(async () => {
            console.log(`(Immediate) Starting game in room ${room.id}`);
            const startResult = gameManager.startGame(room.id);
            if (startResult.success) {
              const startedRoom = gameManager.getRoom(room.id)!;
              console.log(`(Immediate) Game started successfully in room ${room.id}, sending to ${startedRoom.players.length} players`);
              const ok = await deductTokensForRoom(startedRoom);

              if (!ok) {
                console.log(`(Immediate) Aborting gameStart for room ${startedRoom.id} due to token deduction failure`);
                // Notify all players in this room that the match was cancelled
                startedRoom.players.forEach((p) => {
                  const ps = io.sockets.sockets.get(p.id);
                  if (ps) {
                    ps.leave(startedRoom.id);
                    ps.emit('matchmakingRejected', { reason: 'insufficient_tokens_or_auth' });
                  }
                });
              } else {
                // Schedule bot move if it's a bot's turn (any mode)
                maybeScheduleBotMove(startedRoom.id);

                startedRoom.players.forEach((p) => {
                  const ps = io.sockets.sockets.get(p.id);
                  if (ps && startedRoom.gameState) {
                    const sanitized = {
                      ...startedRoom,
                      gameState: {
                        ...startedRoom.gameState,
                        hands: {
                          [p.id]: startedRoom.gameState.hands[p.id],
                          ...Object.fromEntries(
                            startedRoom.players
                              .filter(x => x.id !== p.id)
                              .map(x => [x.id, startedRoom.gameState!.hands[x.id].length])
                          )
                        }
                      }
                    } as any;
                    ps.emit('gameStart', {
                      room: sanitized,
                      gameState: sanitized.gameState,
                      message: 'Game started! Good luck!'
                    });
                    console.log(`(Immediate) Sent gameStart to player ${p.name} (${p.id})`);
                  } else {
                    console.log(`(Immediate) Warning: Could not send gameStart to player ${p.id} (socket: ${!!ps}, gameState: ${!!startedRoom.gameState})`);
                  }
                });
              }
            } else {
              console.log(`(Immediate) Failed to start game in room ${room.id}: ${startResult.error}`);
            }
          }, 500);
        });
      }
    } else {
      // Bot 1v1 mode - create room immediately
      if (gameMode === 'bot1v1') {
        console.log(`Creating bot1v1 room for player ${playerId}`);
        const matchResult = gameManager.createMatchFromQueue([{
          playerId,
          gameMode: 'bot1v1',
          playerName: playerName || 'Player',
          timestamp: new Date(),
          botConfig: botConfig || { botStrategyId: 'simple', difficulty: 'easy' }
        }], betAmount);
        
        if (matchResult.success && matchResult.data) {
          const room = matchResult.data;
          socket.join(room.id);
          
          io.to(room.id).emit('matchFound', {
            room,
            message: 'Bot match found! Game starting soon...'
          });

          setTimeout(async () => {
            const startResult = gameManager.startGame(room.id);
            if (startResult.success) {
              const startedRoom = gameManager.getRoom(room.id)!;
              const ok2 = await deductTokensForRoom(startedRoom);

              if (!ok2) {
                console.log(`Failed to deduct tokens for room ${room.id} on setReady flow; cancelling start`);
                startedRoom.players.forEach((p) => {
                  const ps = io.sockets.sockets.get(p.id);
                  if (ps) {
                    ps.leave(startedRoom.id);
                    ps.emit('matchmakingRejected', { reason: 'insufficient_tokens_or_auth' });
                  }
                });
              } else {
                maybeScheduleBotMove(startedRoom.id);

                startedRoom.players.forEach((p) => {
                  const ps = io.sockets.sockets.get(p.id);
                  if (ps && startedRoom.gameState) {
                    const sanitized = {
                      ...startedRoom,
                      gameState: {
                        ...startedRoom.gameState,
                        hands: {
                          [p.id]: startedRoom.gameState.hands[p.id],
                          ...Object.fromEntries(
                            startedRoom.players
                              .filter(x => x.id !== p.id)
                              .map(x => [x.id, startedRoom.gameState!.hands[x.id].length])
                          )
                        }
                      }
                    } as any;
                    ps.emit('gameStart', {
                      room: sanitized,
                      gameState: sanitized.gameState,
                      message: 'Game started! Good luck!'
                    });
                  } else {
                    console.log(`Warning: Could not send gameStart to player ${p.id} (socket: ${!!ps}, gameState: ${!!startedRoom.gameState})`);
                  }
                });
              }
            } else {
              console.log(`Failed to start game in room ${room.id}: ${startResult.error}`);
            }
          }, 1000);
        }
      }
    }
  });

  socket.on('cancelMatchmaking', () => {
    const removed = gameManager.removeFromMatchmakingQueue(socket.id);
    console.log(`[MM] cancelMatchmaking from ${socket.id} -> removed=${removed}`);
    if (removed) socket.emit('matchmakingCancelled', { message: 'Matchmaking cancelled' });
  });

  socket.on('setReady', async (isReady: boolean) => {
    const result = gameManager.setPlayerReady(socket.id, isReady);
    if (result.success && result.data) {
      io.to(result.data.id).emit('playerReadyChange', { playerId: socket.id, isReady, room: result.data });
      if (result.data.players.every(p => p.isReady)) {
        const sr = gameManager.startGame(result.data.id);
        if (sr.success) {
          const startedRoom = gameManager.getRoom(result.data.id)!;
          const ok = await deductTokensForRoom(startedRoom);
          if (!ok) {
            console.log(`Aborting start for room ${startedRoom.id} due to token deduction failure (setReady flow)`);
            startedRoom.players.forEach((p) => {
              const ps = io.sockets.sockets.get(p.id);
              if (ps) {
                ps.leave(startedRoom.id);
                ps.emit('matchmakingRejected', { reason: 'insufficient_tokens_or_auth' });
              }
            });
          } else {
            io.to(result.data.id).emit('gameStart', { room: result.data, message: 'Game started! Good luck!' });
          }
        }
      }
    } else {
      socket.emit('error', { message: result.error || 'Failed to update ready status' });
    }
  });

  socket.on('playCard', (data) => {
    const { cardId, cardData } = data || {};
    const playerId = socket.id;
    const event: GameEvent = { type: 'card_played', playerId, data: { cardId, cardData }, timestamp: new Date() } as any;
    const result = gameManager.processGameEvent(playerId, event);
    
    if (result.success && result.data) {
      // Send card played event immediately
      io.to(result.data.id).emit('cardPlayed', {
        playerId,
        cardId,
        cardData,
        gameState: result.data.gameState,
        nextPlayer: result.data.gameState?.currentPlayer
      });

      // If it's now a bot's turn (any mode), schedule bot move
      const r = gameManager.getRoom(result.data.id);
      if (r) {
        maybeScheduleBotMove(r.id);
      }

      // Check if GameManager started a new round
      const room = result.data;
      if (room.gameState?.newRoundStarted) {
        // Clear the flag
        room.gameState.newRoundStarted = false;
        
  setTimeout(async () => {
          const updatedRoom = gameManager.getRoom(room.id);
            if (updatedRoom && updatedRoom.gameState) {
            if (updatedRoom.gameState.gameEnded) {
              // Game finished
              const prizeDistribution = gameManager.distributePrizes(room.id);
              // Credit prizes to human players (if any)
              try {
                await ensureDb();
                for (const [playerId, amount] of Object.entries(prizeDistribution)) {
                  if (!amount || amount <= 0) continue;
                  const ps = io.sockets.sockets.get(playerId);
                  const identity = ps?.data?.identity || {};
                  const email = identity?.email;
                  if (email) {
                    const user = await User.findOne({ email });
                    if (user) {
                      user.tokens = (user.tokens || 0) + amount;
                      await user.save();
                      console.log(`💰 Credited ${amount} tokens to ${email} for room ${room.id}`);
                    }
                  }
                }
              } catch (e) {
                console.error('Error crediting prize distribution:', e);
              }

              io.to(room.id).emit('gameEnded', {
                gameState: updatedRoom.gameState,
                winner: updatedRoom.gameState.winner,
                prizeDistribution,
                message: 'Game finished!'
              });
            } else {
              // New round started - send each player their new hand
              console.log(`Starting new round in room ${room.id}`);
              updatedRoom.players.forEach((p) => {
                const ps = io.sockets.sockets.get(p.id);
                if (ps) {
                  const sanitized = {
                    ...updatedRoom,
                    gameState: {
                      ...updatedRoom.gameState!,
                      hands: {
                        [p.id]: updatedRoom.gameState!.hands[p.id] || [],
                        ...Object.fromEntries(
                          updatedRoom.players
                            .filter(x => x.id !== p.id)
                            .map(x => [x.id, (updatedRoom.gameState!.hands[x.id] || []).length])
                        )
                      }
                    }
                  } as any;
                  console.log(`Sending new round to player ${p.name}, hand size: ${sanitized.gameState.hands[p.id].length}`);
                  ps.emit('newRound', { 
                    room: sanitized, 
                    gameState: sanitized.gameState, 
                    message: 'New round started!',
                    scores: updatedRoom.gameState!.scores
                  });
                }
              });
            }
          }
        }, 200); // Short delay to show trick result
      }
    } else {
      socket.emit('error', { message: result.error || 'Failed to play card' });
    }
  });

  socket.on('callTrut', () => {
    const playerId = socket.id;
    const event: GameEvent = { type: 'trut_called', playerId, data: {}, timestamp: new Date() } as any;
    const result = gameManager.processGameEvent(playerId, event);
    if (result.success && result.data) {
      io.to(result.data.id).emit('trutCalled', { 
        playerId, 
        gameState: result.data.gameState,
        message: 'TRUT called! Opponent must accept or fold.'
      });

      // If this is a bot game, schedule bot's challenge response
      const room = result.data;
      if (room.gameMode === 'bot1v1' && room.gameState?.awaitingChallengeResponse) {
        const bot = room.players.find(p => p.isBot);
        const human = room.players.find(p => !p.isBot);
        if (bot && human && room.gameState.challengeRespondent === bot.id) {
          setTimeout(() => {
            // Use bot strategy to decide whether to accept or reject
            const shouldAccept = botStrategy.shouldAcceptChallenge(
              room.gameState!,
              bot,
              human,
              bot.botProfile?.difficulty || 'normal'
            );
            
            const botEvent: GameEvent = { 
              type: 'challenge_response', 
              playerId: bot.id, 
              data: { accept: shouldAccept }, 
              timestamp: new Date() 
            } as any;
            
            const botResult = gameManager.processGameEvent(bot.id, botEvent);
            if (botResult.success && botResult.data) {
              const message = shouldAccept 
                ? 'Bot accepted the challenge! Playing for Long Point!'
                : 'Bot folded! Starting new round...';
                
              io.to(room.id).emit('challengeResponse', {
                playerId: bot.id,
                accept: shouldAccept,
                gameState: botResult.data.gameState,
                message
              });
            }
          }, 1500); // 1.5 second delay for bot to "think"
        }
      } else if (room.gameMode === '2v2' && room.gameState?.awaitingChallengeResponse) {
        // 2v2: if the current respondent is a bot, schedule auto response
        maybeScheduleBotChallengeResponse2v2(room.id);
      }
    } else {
      socket.emit('error', { message: result.error || 'Failed to call trut' });
    }
  });

  socket.on('respondToChallenge', (accept: boolean) => {
    const playerId = socket.id;
    const event: GameEvent = { type: 'challenge_response', playerId, data: { accept }, timestamp: new Date() } as any;
    const result = gameManager.processGameEvent(playerId, event);
    if (result.success && result.data) {
      const room = result.data;
      const gameState = room.gameState!;
      
      if (accept) {
        io.to(room.id).emit('challengeResponse', { 
          playerId, 
          accept: true, 
          gameState,
          message: 'Challenge accepted! Playing for Long Point!'
        });
        // Resume play; if it's a bot's turn now, schedule their move
        maybeScheduleBotMove(room.id);
      } else {
        // Check if this was a 2v2 game and more responses are needed
        if (room.gameMode === '2v2' && gameState.awaitingChallengeResponse) {
          const nextRespondent = gameState.challengeRespondent;
          const currentPlayerName = room.players.find(p => p.id === playerId)?.name || 'Player';
          const nextRespondentName = room.players.find(p => p.id === nextRespondent)?.name || 'Player';
          io.to(room.id).emit('challengeResponse', { 
            playerId, 
            accept: false, 
            gameState,
            message: `${currentPlayerName} folded. Waiting for ${nextRespondentName} to respond...`
          });
          // If next respondent is a bot, schedule their response
          maybeScheduleBotChallengeResponse2v2(room.id);
        } else {
          // All opponents folded or 1v1 fold
          io.to(room.id).emit('challengeResponse', { 
            playerId, 
            accept: false, 
            gameState,
            message: 'Challenge folded! Starting new round...'
          });
          
          // Start new round after short delay
          setTimeout(() => {
            const updatedRoom = gameManager.getRoom(room.id);
            if (updatedRoom && updatedRoom.gameState) {
              console.log(`Challenge folded - starting new round in room ${room.id}`);
              updatedRoom.players.forEach((p) => {
                const ps = io.sockets.sockets.get(p.id);
                if (ps) {
                  const sanitized = {
                    ...updatedRoom,
                    gameState: {
                      ...updatedRoom.gameState!,
                      hands: {
                        [p.id]: updatedRoom.gameState!.hands[p.id] || [],
                        ...Object.fromEntries(
                          updatedRoom.players
                            .filter(x => x.id !== p.id)
                            .map(x => [x.id, (updatedRoom.gameState!.hands[x.id] || []).length])
                        )
                      }
                    }
                  } as any;
                  ps.emit('newRound', { 
                    room: sanitized, 
                    gameState: sanitized.gameState, 
                    message: 'New round started!',
                    scores: updatedRoom.gameState!.scores
                  });
                }
              });
            }
          }, 1200);
        }
      }
    } else {
      socket.emit('error', { message: result.error || 'Failed to respond to challenge' });
    }
  });

  // New 2v2 specific events
  socket.on('callBrelan', (cards) => {
    const playerId = socket.id;
    const event: GameEvent = { type: 'brelan_called', playerId, data: { cards }, timestamp: new Date() } as any;
    const result = gameManager.processGameEvent(playerId, event);
    if (result.success && result.data) {
      io.to(result.data.id).emit('brellanCalled', { 
        playerId, 
        cards,
        gameState: result.data.gameState,
        message: 'BRELAN called! (3 of a kind = automatic TRUT)'
      });
    } else {
      socket.emit('error', { message: result.error || 'Failed to call brelan' });
    }
  });

  socket.on('startFortialPhase', () => {
    const playerId = socket.id;
    const event: GameEvent = { type: 'fortial_phase', playerId, data: {}, timestamp: new Date() } as any;
    const result = gameManager.processGameEvent(playerId, event);
    if (result.success && result.data) {
      io.to(result.data.id).emit('fortialPhase', { 
        playerId, 
        gameState: result.data.gameState,
        message: 'Fortial phase! (6 truts + 2 cannets)'
      });
    } else {
      socket.emit('error', { message: result.error || 'Failed to start fortial phase' });
    }
  });

  socket.on('leaveRoom', () => {
    const result = gameManager.leaveRoom(socket.id);
    if (result.success && result.roomId) {
      socket.leave(result.roomId);
      if (!result.shouldCloseRoom) {
        socket.to(result.roomId).emit('playerLeft', { playerId: socket.id, message: 'A player has left the game' });
      }
      socket.emit('leftRoom', { message: 'Successfully left the room' });
    }
  });

  socket.on('sendChatMessage', (message: string) => {
    const room = gameManager.getPlayerRoom(socket.id);
    if (room) {
      const chatMessage = { id: `msg-${Date.now()}`, playerId: socket.id, message, timestamp: new Date(), type: 'player' };
      io.to(room.id).emit('chatMessage', chatMessage);
    }
  });

  socket.on('getRoomInfo', () => {
    const room = gameManager.getPlayerRoom(socket.id);
    if (room) socket.emit('roomInfo', room);
    else socket.emit('error', { message: 'Not in any room' });
  });

  socket.on('disconnect', (reason) => {
    console.log(`Player disconnected: ${socket.id} (${reason})`);
    const result = gameManager.handlePlayerDisconnect(socket.id);
    if (result.roomId && !result.shouldCloseRoom) {
      socket.to(result.roomId).emit('playerDisconnected', { playerId: socket.id, message: 'A player has disconnected' });
    }
  });

  socket.emit('connected', { message: 'Connected to TRUT multiplayer server', playerId: socket.id, timestamp: new Date() });
});

// Enhanced matchmaking interval for 1v1 and 2v2 support
setInterval(() => {
  console.log('Running periodic matchmaking check...');
  const createdGames = gameManager.processAllMatchmaking();
  console.log(`Found ${createdGames.length} matches during periodic check`);

  createdGames.forEach(({ gameMode, room, betAmount }) => {
    console.log(`Creating game for ${gameMode} in room ${room.id} with ${room.players.length} players`);

    // Join all players to socket room
    room.players.forEach(player => {
      const playerSocket = io.sockets.sockets.get(player.id);
      if (playerSocket) {
        playerSocket.join(room.id);
        console.log(`Player ${player.id} joined room ${room.id}`);
      } else {
        console.log(`Warning: Player ${player.id} socket not found for room join`);
      }
    });

    io.to(room.id).emit('matchFound', {
      room,
      message: `${gameMode === '2v2' ? '2v2' : 'Bot 1v1'} match found! Get ready to play!`
    });

    setTimeout(async () => {
      console.log(`Starting game in room ${room.id}`);
      const startResult = gameManager.startGame(room.id);
      if (startResult.success) {
        const startedRoom = gameManager.getRoom(room.id)!;
        console.log(`Game started successfully in room ${room.id}, sending to ${startedRoom.players.length} players`);
        const ok = await deductTokensForRoom(startedRoom);
        if (!ok) {
          console.log(`Aborting gameStart for room ${startedRoom.id} due to token deduction failure (periodic flow)`);
          // Notify all players in this room that the match was cancelled
          startedRoom.players.forEach((p) => {
            const ps = io.sockets.sockets.get(p.id);
            if (ps) {
              ps.leave(startedRoom.id);
              ps.emit('matchmakingRejected', { reason: 'insufficient_tokens_or_auth' });
            }
          });
          return; // skip further processing for this match
        }
        // Schedule bot move if it's a bot's turn (any mode)
        maybeScheduleBotMove(startedRoom.id);
        startedRoom.players.forEach((p) => {
          const ps = io.sockets.sockets.get(p.id);
          if (ps && startedRoom.gameState) {
            const sanitized = {
              ...startedRoom,
              gameState: {
                ...startedRoom.gameState,
                hands: {
                  [p.id]: startedRoom.gameState.hands[p.id],
                  ...Object.fromEntries(
                    startedRoom.players
                      .filter(x => x.id !== p.id)
                      .map(x => [x.id, startedRoom.gameState!.hands[x.id].length])
                  )
                }
              }
            } as any;
            ps.emit('gameStart', {
              room: sanitized,
              gameState: sanitized.gameState,
              message: 'Game started! Good luck!'
            });
            console.log(`Sent gameStart to player ${p.name} (${p.id})`);
          } else {
            console.log(`Warning: Could not send gameStart to player ${p.id} (socket: ${!!ps}, gameState: ${!!startedRoom.gameState})`);
          }
        });
      } else {
        console.log(`Failed to start game in room ${room.id}: ${startResult.error}`);
      }
    }, 500);
  });

  // Send status updates to waiting 2v2 players only
  const queue = gameManager.getMatchmakingQueue();
  const waiting2v2Players = queue.filter(req => {
    const waitTime = Math.floor((Date.now() - req.timestamp.getTime()) / 1000);
    return waitTime > 5 && req.gameMode === '2v2'; // Only send updates after 5 seconds for 2v2
  });

  console.log(`Sending status updates to ${waiting2v2Players.length} waiting 2v2 players`);

  waiting2v2Players.forEach(waitingPlayer => {
    const waitTime = Math.floor((Date.now() - waitingPlayer.timestamp.getTime()) / 1000);
    const socket = io.sockets.sockets.get(waitingPlayer.playerId);
    if (socket) {
      const queueStatus = gameManager.get2v2QueueStatus(300);
      socket.emit('matchmakingStatus', {
        status: 'searching',
        message: `Still searching for ${waitingPlayer.teamMode === 'solo' ? 'players' : 'team opponents'}...`,
        estimatedWaitTime: queueStatus.estimatedWaitTime,
        playersInQueue: queueStatus.playersInQueue,
        waitTime
      });
    }
  });
}, 3000);

const PORT = process.env.PORT || 4001;
httpServer.listen(PORT, () => {
  console.log(`TRUT Multiplayer Server running on port ${PORT}`);
});