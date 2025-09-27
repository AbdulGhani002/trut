import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { GameManager } from './services/GameManager';
import { GameEvent } from '../../shared/types/game';

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

// Helper: if it's the bot's turn in a bot1v1 room, auto-play a card
const maybeScheduleBotMove = (roomId: string) => {
  const room = gameManager.getRoom(roomId);
  if (!room || room.gameMode !== 'bot1v1' || !room.gameState) return;
  const bot = room.players.find(p => p.isBot);
  if (!bot) return;
  if (room.gameState.gameEnded) return;
  if (room.gameState.currentPlayer !== bot.id) return;

  // Phase 1: after a short delay, emit a preview state showing the bot's card on table
  setTimeout(() => {
    const currentRoom = gameManager.getRoom(roomId);
    if (!currentRoom || !currentRoom.gameState) return;
    if (currentRoom.gameState.currentPlayer !== bot.id) return;
    const botHand = currentRoom.gameState.hands[bot.id] || [];
    if (botHand.length === 0) return;
    const cardToPlay = botHand[0];

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
            const r = gameManager.getRoom(roomAfter.id);
            if (r && r.gameState) {
              if (r.gameState.gameEnded) {
                io.to(r.id).emit('gameEnded', {
                  gameState: r.gameState,
                  winner: r.gameState.winner,
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
          }, 200);
        } else {
          maybeScheduleBotMove(updated.id);
        }
      }
    }, 1200);
  }, 200);
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

  socket.on('startMatchmaking', (data) => {
    const { gameMode, playerName, betAmount, teamMode, teamMateId, botConfig } = data || {};
    const playerId = socket.id;

    console.log(`Player ${playerId} starting matchmaking for ${gameMode} (bet: ${betAmount}, mode: ${teamMode})`);

    // Add to queue with 2v2 support
    try {
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

          setTimeout(() => {
            console.log(`(Immediate) Starting game in room ${room.id}`);
            const startResult = gameManager.startGame(room.id);
            if (startResult.success) {
              const startedRoom = gameManager.getRoom(room.id)!;
              console.log(`(Immediate) Game started successfully in room ${room.id}, sending to ${startedRoom.players.length} players`);
              // If bot1v1, schedule bot move when it's bot's turn
              if (startedRoom.gameMode === 'bot1v1') {
                maybeScheduleBotMove(startedRoom.id);
              }
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
            } else {
              console.log(`(Immediate) Failed to start game in room ${room.id}: ${startResult.error}`);
            }
          }, 500);
        });
      }
    } else {
      // 1v1 immediate match check (existing logic)
      const match = gameManager.findMatch(gameMode || 'bot1v1', betAmount);
      if (match && match.length >= 1) {
        console.log(`${gameMode === 'bot1v1' ? 'Bot' : '1v1'} match found immediately for player ${playerId}`);
        const matchResult = gameManager.createMatchFromQueue(match, betAmount);
        if (matchResult.success && matchResult.data) {
          const room = matchResult.data;

          // Join all matched players to socket room
          match.forEach(player => {
            const playerSocket = io.sockets.sockets.get(player.playerId);
            if (playerSocket) {
              playerSocket.join(room.id);
            }
          });

          io.to(room.id).emit('matchFound', {
            room,
            message: `${gameMode === '2v2' ? '2v2' : 'Bot 1v1'} match found! Game starting soon...`
          });

          setTimeout(() => {
            const startResult = gameManager.startGame(room.id);
            if (startResult.success) {
              const startedRoom = gameManager.getRoom(room.id)!;
              if (startedRoom.gameMode === 'bot1v1') {
                maybeScheduleBotMove(startedRoom.id);
              }
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
                }
              });
            }
          }, 1000);
        }
      } else {
        // Send queue status for 1v1
        const queueLength = gameManager.getMatchmakingQueue().filter(req => req.gameMode === 'bot1v1').length;
        const estimatedWaitTime = Math.max(10, Math.min(120, 30 * (2 - queueLength)));
        socket.emit('matchmakingStatus', {
          status: 'searching',
          message: 'Looking for an opponent...',
          estimatedWaitTime,
          playersInQueue: queueLength
        });
      }
    }
  });

  socket.on('cancelMatchmaking', () => {
    const removed = gameManager.removeFromMatchmakingQueue(socket.id);
    console.log(`[MM] cancelMatchmaking from ${socket.id} -> removed=${removed}`);
    if (removed) socket.emit('matchmakingCancelled', { message: 'Matchmaking cancelled' });
  });

  socket.on('setReady', (isReady: boolean) => {
    const result = gameManager.setPlayerReady(socket.id, isReady);
    if (result.success && result.data) {
      io.to(result.data.id).emit('playerReadyChange', { playerId: socket.id, isReady, room: result.data });
      if (result.data.players.every(p => p.isReady)) {
        const sr = gameManager.startGame(result.data.id);
        if (sr.success) io.to(result.data.id).emit('gameStart', { room: result.data, message: 'Game started! Good luck!' });
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

      // If bot game and it's now bot's turn, schedule bot move
      const r = gameManager.getRoom(result.data.id);
      if (r && r.gameMode === 'bot1v1') {
        maybeScheduleBotMove(r.id);
      }

      // Check if GameManager started a new round
      const room = result.data;
      if (room.gameState?.newRoundStarted) {
        // Clear the flag
        room.gameState.newRoundStarted = false;
        
        setTimeout(() => {
          const updatedRoom = gameManager.getRoom(room.id);
          if (updatedRoom && updatedRoom.gameState) {
            if (updatedRoom.gameState.gameEnded) {
              // Game finished
              io.to(room.id).emit('gameEnded', {
                gameState: updatedRoom.gameState,
                winner: updatedRoom.gameState.winner,
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
        if (bot && room.gameState.challengeRespondent === bot.id) {
          setTimeout(() => {
            // Bot always accepts challenges for now (can be made smarter later)
            const botEvent: GameEvent = { 
              type: 'challenge_response', 
              playerId: bot.id, 
              data: { accept: true }, 
              timestamp: new Date() 
            } as any;
            
            const botResult = gameManager.processGameEvent(bot.id, botEvent);
            if (botResult.success && botResult.data) {
              io.to(room.id).emit('challengeResponse', {
                playerId: bot.id,
                accept: true,
                gameState: botResult.data.gameState,
                message: 'Bot accepted the challenge! Playing for Long Point!'
              });
            }
          }, 1500); // 1.5 second delay for bot to "think"
        }
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
      } else {
        // Check if this was a 2v2 game and more responses are needed
        if (room.gameMode === '2v2' && gameState.awaitingChallengeResponse) {
          const nextRespondent = gameState.challengeRespondent;
          io.to(room.id).emit('challengeResponse', { 
            playerId, 
            accept: false, 
            gameState,
            message: `${playerId} folded. Waiting for ${nextRespondent} to respond...`
          });
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
          }, 400);
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

    setTimeout(() => {
      console.log(`Starting game in room ${room.id}`);
      const startResult = gameManager.startGame(room.id);
      if (startResult.success) {
        const startedRoom = gameManager.getRoom(room.id)!;
        console.log(`Game started successfully in room ${room.id}, sending to ${startedRoom.players.length} players`);
        if (startedRoom.gameMode === 'bot1v1') {
          maybeScheduleBotMove(startedRoom.id);
        }
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

  // Send status updates to waiting players
  const queue = gameManager.getMatchmakingQueue();
  const waitingPlayers = queue.filter(req => {
    const waitTime = Math.floor((Date.now() - req.timestamp.getTime()) / 1000);
    return waitTime > 5; // Only send updates after 5 seconds
  });

  console.log(`Sending status updates to ${waitingPlayers.length} waiting players`);

  waitingPlayers.forEach(waitingPlayer => {
    const waitTime = Math.floor((Date.now() - waitingPlayer.timestamp.getTime()) / 1000);
    const socket = io.sockets.sockets.get(waitingPlayer.playerId);
    if (socket) {
      if (waitingPlayer.gameMode === '2v2') {
        const queueStatus = gameManager.get2v2QueueStatus(300);
        socket.emit('matchmakingStatus', {
          status: 'searching',
          message: `Still searching for ${waitingPlayer.teamMode === 'solo' ? 'players' : 'team opponents'}...`,
          estimatedWaitTime: queueStatus.estimatedWaitTime,
          playersInQueue: queueStatus.playersInQueue,
          waitTime
        });
      } else {
        const queueLength = queue.filter(req => req.gameMode === 'bot1v1').length;
        const estimatedWaitTime = Math.max(5, 45 - waitTime);
        socket.emit('matchmakingStatus', {
          status: 'searching',
          message: 'Still searching for an opponent...',
          estimatedWaitTime,
          playersInQueue: queueLength,
          waitTime
        });
      }
    }
  });
}, 3000);

const PORT = process.env.PORT || 4001;
httpServer.listen(PORT, () => {
  console.log(`TRUT Multiplayer Server running on port ${PORT}`);
});