import {
    AngularNodeAppEngine,
    createNodeRequestHandler,
    isMainModule,
    writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';

import { assertModeratorAction } from './poker-permissions';
import { parsePokerWsMessageFromClient } from './poker-ws-protocol';
import { createRateLimiter } from './rate-limit';
import { createLazyRedisClientRoomPersistence } from './redis-room-persistence';
import { createInMemoryRoomPersistence, type RoomPersistence } from './room-persistence';
import { isTokenAllowed } from './room-token';
import { appendRoundHistory, type PokerRoundHistoryEntry } from './round-history';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

type PokerParticipantState = {
  id: string;
  name: string;
  vote: string | null;
};

type PokerRoomState = {
  roomId: string;
  ownerId: string | null;
  token: string;
  reveal: boolean;
  rounds: PokerRoundHistoryEntry[];
  participants: Map<string, PokerParticipantState>;
  sockets: Map<string, WebSocket>;
};

type PokerConnectionState = {
  currentRoom: PokerRoomState | null;
  clientId: string | null;
};

const rooms = new Map<string, PokerRoomState>();
const socketAlive = new WeakMap<WebSocket, boolean>();

const roomTtlSeconds = (() => {
  const raw = process.env['ROOM_TTL_SECONDS'];
  if (!raw) {
    return 86_400;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 86_400;
  }

  return Math.floor(parsed);
})();

const roomKeyPrefix = process.env['REDIS_KEY_PREFIX'] ?? 'buddy-poker:room:';
const redisUrl = process.env['REDIS_URL'];
const redisPasswordRaw = process.env['REDIS_PASSWORD'];
const redisPassword = redisPasswordRaw?.trim() ? redisPasswordRaw : undefined;

const roomPersistence: RoomPersistence = redisUrl
  ? createLazyRedisClientRoomPersistence({
      redisUrl,
      redisPassword,
      keyPrefix: roomKeyPrefix,
      defaultTtlSeconds: roomTtlSeconds,
    })
  : createInMemoryRoomPersistence();

function normalizeRoomId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, '-')
    .slice(0, 32);
}

function normalizeName(input: string): string {
  return input.trim().slice(0, 32);
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function getOrCreateRoom(roomIdRaw: string): Promise<PokerRoomState> {
  const roomId = normalizeRoomId(roomIdRaw);
  const existing = rooms.get(roomId);
  if (existing) {
    return existing;
  }

  const persisted = await roomPersistence.get(roomId).catch(() => null);

  const token = persisted?.token ?? `${generateId()}${generateId()}`;
  const rounds = persisted?.rounds ?? [];

  const room: PokerRoomState = {
    roomId,
    ownerId: null,
    token,
    reveal: false,
    rounds,
    participants: new Map(),
    sockets: new Map(),
  };
  rooms.set(roomId, room);

  void roomPersistence
    .set(roomId, { token: room.token, rounds: room.rounds }, { ttlSeconds: roomTtlSeconds })
    .catch(() => undefined);

  return room;
}

function sendError(socket: WebSocket, message: string): void {
  if (socket.readyState !== socket.OPEN) {
    return;
  }

  socket.send(JSON.stringify({ type: 'error', message }));
}

function broadcastRoomState(room: PokerRoomState): void {
  const participants = Array.from(room.participants.values()).map((p) => ({
    id: p.id,
    name: p.name,
    hasVoted: p.vote !== null,
    vote: room.reveal ? p.vote : null,
  }));

  const payload = JSON.stringify({
    type: 'state',
    roomId: room.roomId,
    ownerId: room.ownerId,
    reveal: room.reveal,
    participants,
  });

  for (const socket of room.sockets.values()) {
    if (socket.readyState === socket.OPEN) {
      socket.send(payload);
    }
  }
}

function removeClientFromRoom(room: PokerRoomState, clientId: string): void {
  room.participants.delete(clientId);
  room.sockets.delete(clientId);

  if (room.ownerId === clientId) {
    room.ownerId = room.participants.keys().next().value ?? null;
  }

  if (room.participants.size === 0) {
    rooms.delete(room.roomId);
    void roomPersistence.delete(room.roomId).catch(() => undefined);
    return;
  }

  broadcastRoomState(room);
  broadcastRoomStateHttp(room);
}

async function handleJoinMessage(
  state: PokerConnectionState,
  socket: WebSocket,
  msg: { roomId: string; name: string; token?: string },
): Promise<void> {
  const room = await getOrCreateRoom(msg.roomId);
  const name = normalizeName(msg.name);
  if (!name) {
    return;
  }

  const isFirstJoin = room.participants.size === 0 && room.ownerId === null;
  const tokenAllowed = isTokenAllowed({
    roomToken: room.token,
    providedToken: msg.token,
    allowMissing: isFirstJoin,
  });

  if (!tokenAllowed) {
    sendError(socket, 'Token da sala inválido. Peça o link correto para o moderador.');
    return;
  }

  if (state.currentRoom && state.clientId) {
    removeClientFromRoom(state.currentRoom, state.clientId);
  }

  const clientId = generateId();
  state.clientId = clientId;
  state.currentRoom = room;

  room.participants.set(clientId, { id: clientId, name, vote: null });
  room.sockets.set(clientId, socket);

  if (!room.ownerId) {
    room.ownerId = clientId;
  }

  socket.send(
    JSON.stringify({
      type: 'joined',
      clientId,
      roomId: room.roomId,
      ...(isFirstJoin ? { token: room.token } : {}),
    }),
  );

  void roomPersistence
    .set(room.roomId, { token: room.token, rounds: room.rounds }, { ttlSeconds: roomTtlSeconds })
    .catch(() => undefined);

  broadcastRoomState(room);
  broadcastRoomStateHttp(room);
}

function handleVoteMessage(
  state: PokerConnectionState,
  msg: { value: string },
): void {
  if (!state.currentRoom || !state.clientId) {
    return;
  }

  const participant = state.currentRoom.participants.get(state.clientId);
  if (!participant) {
    return;
  }

  if (state.currentRoom.reveal) {
    return;
  }

  participant.vote = msg.value.slice(0, 8);
  state.currentRoom.participants.set(state.clientId, participant);
  broadcastRoomState(state.currentRoom);
  broadcastRoomStateHttp(state.currentRoom);
}

function handleRevealMessage(state: PokerConnectionState, socket: WebSocket): void {
  if (!state.currentRoom || !state.clientId) {
    return;
  }

  const guard = assertModeratorAction({
    ownerId: state.currentRoom.ownerId,
    clientId: state.clientId,
    action: 'reveal',
  });

  if (!guard.ok) {
    sendError(socket, guard.message);
    return;
  }

  state.currentRoom.reveal = true;
  broadcastRoomState(state.currentRoom);
  broadcastRoomStateHttp(state.currentRoom);
}

function handleResetMessage(state: PokerConnectionState, socket: WebSocket): void {
  if (!state.currentRoom || !state.clientId) {
    return;
  }

  const guard = assertModeratorAction({
    ownerId: state.currentRoom.ownerId,
    clientId: state.clientId,
    action: 'reset',
  });

  if (!guard.ok) {
    sendError(socket, guard.message);
    return;
  }

  state.currentRoom.rounds = appendRoundHistory({
    reveal: state.currentRoom.reveal,
    participants: state.currentRoom.participants.values(),
    history: state.currentRoom.rounds,
    maxRounds: 20,
  });

  void roomPersistence
    .set(
      state.currentRoom.roomId,
      { token: state.currentRoom.token, rounds: state.currentRoom.rounds },
      { ttlSeconds: roomTtlSeconds },
    )
    .catch(() => undefined);

  state.currentRoom.reveal = false;
  for (const p of state.currentRoom.participants.values()) {
    p.vote = null;
  }
  broadcastRoomState(state.currentRoom);
  broadcastRoomStateHttp(state.currentRoom);
}

// HTTP Fallback Support
type HttpClientSession = {
  clientId: string;
  roomId: string;
  name: string;
  room: PokerRoomState;
  lastEventId: number;
  createdAt: number;
};

const httpSessions = new Map<string, HttpClientSession>();
const eventQueue = new Map<string, Array<{ id: number; message: unknown }>>();
let globalEventId = 0;

function getHttpSession(clientId: string): HttpClientSession | null {
  return httpSessions.get(clientId) ?? null;
}

function createHttpSession(
  clientId: string,
  roomId: string,
  name: string,
  room: PokerRoomState,
): HttpClientSession {
  const session: HttpClientSession = {
    clientId,
    roomId,
    name,
    room,
    lastEventId: globalEventId,
    createdAt: Date.now(),
  };
  httpSessions.set(clientId, session);
  eventQueue.set(clientId, []);
  return session;
}

function queueEventForHttpClient(clientId: string, message: unknown): void {
  const queue = eventQueue.get(clientId);
  if (!queue) {
    return;
  }

  globalEventId += 1;
  queue.push({ id: globalEventId, message });

  // Keep only last 100 events per client
  if (queue.length > 100) {
    queue.shift();
  }
}

function broadcastRoomStateHttp(room: PokerRoomState): void {
  const participants = Array.from(room.participants.values()).map((p) => ({
    id: p.id,
    name: p.name,
    hasVoted: p.vote !== null,
    vote: room.reveal ? p.vote : null,
  }));

  const message = {
    type: 'state',
    roomId: room.roomId,
    ownerId: room.ownerId,
    reveal: room.reveal,
    participants,
  };

  // Queue for all HTTP clients in this room
  for (const [clientId, session] of httpSessions.entries()) {
    if (session.roomId === room.roomId) {
      queueEventForHttpClient(clientId, message);
    }
  }
}

// Clean up old HTTP sessions periodically
const httpSessionTtlMs = 5 * 60 * 1000; // 5 minutes
const httpCleanupIntervalMs = 60_000; // 1 minute
setInterval(() => {
  const now = Date.now();
  for (const [clientId, session] of httpSessions.entries()) {
    if (now - session.createdAt > httpSessionTtlMs) {
      httpSessions.delete(clientId);
      eventQueue.delete(clientId);
    }
  }
}, httpCleanupIntervalMs);

// Middleware to parse JSON
app.use(express.json());

/**
 * HTTP Fallback - Action endpoint
 */
app.post('/api/poker/action', async (req, res) => {
  try {
    const msg = req.body;
    const existingClientId = req.headers['x-client-id'] as string | undefined;

    if (msg.type === 'join') {
      const room = await getOrCreateRoom(msg.roomId);
      const name = normalizeName(msg.name);
      if (!name) {
        res.status(400).json({ error: 'Invalid name' });
        return;
      }

      const isFirstJoin = room.participants.size === 0 && room.ownerId === null;
      const tokenAllowed = isTokenAllowed({
        roomToken: room.token,
        providedToken: msg.token,
        allowMissing: isFirstJoin,
      });

      if (!tokenAllowed) {
        res.status(403).json({ error: 'Token da sala inválido. Peça o link correto para o moderador.' });
        return;
      }

      const clientId = existingClientId ?? generateId();
      
      room.participants.set(clientId, { id: clientId, name, vote: null });

      if (!room.ownerId) {
        room.ownerId = clientId;
      }

      const session = createHttpSession(clientId, room.roomId, name, room);

      type JoinResponse = {
        clientId: string;
        message: {
          type: 'joined';
          clientId: string;
          roomId: string;
          token?: string;
        };
      };

      const response: JoinResponse = {
        clientId,
        message: {
          type: 'joined',
          clientId,
          roomId: room.roomId,
          ...(isFirstJoin ? { token: room.token } : {}),
        },
      };

      res.json(response);

      void roomPersistence
        .set(room.roomId, { token: room.token, rounds: room.rounds }, { ttlSeconds: roomTtlSeconds })
        .catch(() => undefined);

      broadcastRoomState(room);
      broadcastRoomStateHttp(room);
      return;
    }

    // For other actions, require existing session
    if (!existingClientId) {
      res.status(401).json({ error: 'Client ID required' });
      return;
    }

    const session = getHttpSession(existingClientId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const room = session.room;
    const participant = room.participants.get(existingClientId);
    if (!participant) {
      res.status(404).json({ error: 'Participant not found' });
      return;
    }

    if (msg.type === 'vote') {
      if (room.reveal) {
        res.json({ message: null });
        return;
      }

      participant.vote = msg.value.slice(0, 8);
      room.participants.set(existingClientId, participant);
      broadcastRoomState(room);
      broadcastRoomStateHttp(room);
      res.json({ message: null });
      return;
    }

    if (msg.type === 'reveal') {
      const guard = assertModeratorAction({
        ownerId: room.ownerId,
        clientId: existingClientId,
        action: 'reveal',
      });

      if (!guard.ok) {
        res.status(403).json({ error: guard.message });
        return;
      }

      room.reveal = true;
      broadcastRoomState(room);
      broadcastRoomStateHttp(room);
      res.json({ message: null });
      return;
    }

    if (msg.type === 'reset') {
      const guard = assertModeratorAction({
        ownerId: room.ownerId,
        clientId: existingClientId,
        action: 'reset',
      });

      if (!guard.ok) {
        res.status(403).json({ error: guard.message });
        return;
      }

      room.rounds = appendRoundHistory({
        reveal: room.reveal,
        participants: room.participants.values(),
        history: room.rounds,
        maxRounds: 20,
      });

      void roomPersistence
        .set(
          room.roomId,
          { token: room.token, rounds: room.rounds },
          { ttlSeconds: roomTtlSeconds },
        )
        .catch(() => undefined);

      room.reveal = false;
      for (const p of room.participants.values()) {
        p.vote = null;
      }
      broadcastRoomState(room);
      broadcastRoomStateHttp(room);
      res.json({ message: null });
      return;
    }

    res.status(400).json({ error: 'Unknown action type' });
  } catch (error) {
    console.error('Error handling action:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * HTTP Fallback - Events endpoint (polling)
 */
app.get('/api/poker/events', (req, res) => {
  try {
    const clientId = req.query['clientId'] as string;
    const lastEventId = Number(req.query['lastEventId'] ?? 0);

    if (!clientId) {
      res.status(400).json({ error: 'Client ID required' });
      return;
    }

    const session = getHttpSession(clientId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Update session timestamp
    session.createdAt = Date.now();

    const queue = eventQueue.get(clientId) ?? [];
    const newEvents = queue.filter((event) => event.id > lastEventId);

    res.json({ events: newEvents });
  } catch (error) {
    console.error('Error handling events:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = Number(process.env['PORT'] ?? 4000);
  if (!Number.isFinite(port)) {
    throw new TypeError('Invalid PORT environment variable');
  }

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  const heartbeatIntervalMs = 30_000;
  const heartbeatInterval = setInterval(() => {
    for (const socket of wss.clients) {
      if (socketAlive.get(socket) === false) {
        socket.terminate();
        continue;
      }

      socketAlive.set(socket, false);
      socket.ping();
    }
  }, heartbeatIntervalMs);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  wss.on('connection', (socket) => {
    socketAlive.set(socket, true);
    socket.on('pong', () => {
      socketAlive.set(socket, true);
    });

    const messageRateLimiter = createRateLimiter({ maxEvents: 40, windowMs: 10_000 });

    const state: PokerConnectionState = { currentRoom: null, clientId: null };

    socket.on('message', (data) => {
      if (!messageRateLimiter.allow()) {
        sendError(socket, 'Muitas mensagens em pouco tempo. Aguarde alguns segundos.');
        return;
      }

      const raw = typeof data === 'string' ? data : data.toString('utf-8');
      const msg = parsePokerWsMessageFromClient(raw);
      if (!msg) {
        return;
      }

      switch (msg.type) {
        case 'join':
          void handleJoinMessage(state, socket, msg);
          return;
        case 'vote':
          handleVoteMessage(state, msg);
          return;
        case 'reveal':
          handleRevealMessage(state, socket);
          return;
        case 'reset':
          handleResetMessage(state, socket);
          return;
        default:
          return;
      }
    });

    socket.on('close', () => {
      socketAlive.delete(socket);
      if (state.currentRoom && state.clientId) {
        removeClientFromRoom(state.currentRoom, state.clientId);
      }
    });
  });

  httpServer.on('error', (error) => {
    throw error;
  });

  httpServer.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
    console.log('WebSocket server listening on ws://localhost:' + port + '/ws');
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
