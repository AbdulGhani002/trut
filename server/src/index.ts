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
    const { gameMode, playerName } = data || {};
    const playerId = socket.id;
    gameManager.addToMatchmakingQueue(playerId, gameMode || '1v1', playerName || 'Player');
    const match = gameManager.findMatch(gameMode || '1v1');
    if (match && match.length === 2) {
      const [player1, player2] = match;
      const room = gameManager.createRoom(player1.playerId, player1.playerName || 'Player 1', gameMode || '1v1', 2);
      const joinResult = gameManager.joinRoom(room.id, player2.playerId, player2.playerName || 'Player 2');
      if (joinResult.success && joinResult.data) {
        const s1 = io.sockets.sockets.get(player1.playerId);
        const s2 = io.sockets.sockets.get(player2.playerId);
        if (s1 && s2) {
          s1.join(room.id); s2.join(room.id);
          io.to(room.id).emit('matchFound', { room: joinResult.data, message: 'Match found! Game starting soon...' });
          setTimeout(() => {
            const startResult = gameManager.startGame(room.id);
            if (startResult.success) {
              const startedRoom = gameManager.getRoom(room.id)!;
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
                  ps.emit('gameStart', { room: sanitized, gameState: sanitized.gameState, message: 'Game started! Good luck!' });
                }
              });
            }
          }, 1000);
        }
      }
    } else {
      const queueLength = gameManager.getMatchmakingQueue().filter(req => req.gameMode === (gameMode || '1v1')).length;
      const estimatedWaitTime = Math.max(10, Math.min(120, 30 * (2 - queueLength)));
      socket.emit('matchmakingStatus', { 
        status: 'searching', 
        message: 'Looking for an opponent...', 
        estimatedWaitTime,
        playersInQueue: queueLength 
      });
    }
  });

  socket.on('cancelMatchmaking', () => {
    const removed = gameManager.removeFromMatchmakingQueue(socket.id);
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
    } else {
      socket.emit('error', { message: result.error || 'Failed to call trut' });
    }
  });

  socket.on('respondToChallenge', (accept: boolean) => {
    const playerId = socket.id;
    const event: GameEvent = { type: 'challenge_response', playerId, data: { accept }, timestamp: new Date() } as any;
    const result = gameManager.processGameEvent(playerId, event);
    if (result.success && result.data) {
      if (accept) {
        io.to(result.data.id).emit('challengeResponse', { 
          playerId, 
          accept: true, 
          gameState: result.data.gameState,
          message: 'Challenge accepted! Playing for Long Point!'
        });
      } else {
        io.to(result.data.id).emit('challengeResponse', { 
          playerId, 
          accept: false, 
          gameState: result.data.gameState,
          message: 'Challenge folded! Starting new round...'
        });
        // If folded, emit newRound event after a short delay
        setTimeout(() => {
          const updatedRoom = gameManager.getRoom(result.data!.id);
          if (updatedRoom && updatedRoom.gameState) {
            console.log(`Challenge folded - starting new round in room ${result.data!.id}`);
            // Send each player their own hand
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
                console.log(`Sending new round after fold to player ${p.name}, hand size: ${sanitized.gameState.hands[p.id].length}`);
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
    } else {
      socket.emit('error', { message: result.error || 'Failed to respond to challenge' });
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

setInterval(() => {
  const queue = gameManager.getMatchmakingQueue();
  const byMode = queue.reduce((acc: any, req) => { (acc[req.gameMode] ||= []).push(req); return acc; }, {} as Record<string, any[]>);
  
  Object.entries(byMode).forEach(([mode, requests]) => {
    const requestList = requests as any[];
    
    if (requestList.length >= 2) {
      const match = gameManager.findMatch(mode);
      if (match && match.length === 2) {
        const [p1, p2] = match;
        const room = gameManager.createRoom(p1.playerId, p1.playerName || 'Player 1', mode, 2);
        const join = gameManager.joinRoom(room.id, p2.playerId, p2.playerName || 'Player 2');
        if (join.success && join.data) {
          const s1 = io.sockets.sockets.get(p1.playerId);
          const s2 = io.sockets.sockets.get(p2.playerId);
          if (s1 && s2) {
            s1.join(room.id); s2.join(room.id);
            io.to(room.id).emit('matchFound', { room: join.data, message: 'Match found! Get ready to play!' });
            setTimeout(() => {
              const startResult = gameManager.startGame(room.id);
              if (startResult.success) {
                const startedRoom = gameManager.getRoom(room.id)!;
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
                    ps.emit('gameStart', { room: sanitized, gameState: sanitized.gameState, message: 'Game started! Good luck!' });
                  }
                });
              }
            }, 500);
          }
        }
      }
    } else if (requestList.length === 1) {
      // Send status update to waiting player
      const waitingPlayer = requestList[0];
      const waitTime = Math.floor((Date.now() - waitingPlayer.timestamp.getTime()) / 1000);
      const estimatedWaitTime = Math.max(5, 45 - waitTime);
      const socket = io.sockets.sockets.get(waitingPlayer.playerId);
      if (socket) {
        socket.emit('matchmakingStatus', {
          status: 'searching',
          message: 'Still searching for an opponent...',
          estimatedWaitTime,
          playersInQueue: 1,
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