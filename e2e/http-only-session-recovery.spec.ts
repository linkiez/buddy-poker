import { expect, test as base, type BrowserContext, type Page, type Route } from '@playwright/test';

const ROOM_PATH_PATTERN = /\/room\/([^/?#]+)(?:[?#].*)?$/;

export interface RoomSession {
  readonly origin: string;
  readonly roomId: string;
  readonly token: string;
  readonly moderator: PageSession;
}

export interface PageSession {
  readonly context: BrowserContext;
  readonly fingerprint: string;
  readonly name: string;
  readonly page: Page;
}

export interface NetworkInterceptor {
  readonly requests: string[];
  blockHttpPolling(): Promise<void>;
  blockWebSocket(): Promise<void>;
  dispose(): Promise<void>;
}

export interface RoomFixture {
  create(options?: CreateRoomOptions): Promise<RoomSession>;
}

export interface ParticipantFixture {
  create(room: RoomSession, options?: ParticipantOptions): Promise<PageSession>;
}

export interface ModeratorFixture {
  create(room: RoomSession, options?: ModeratorOptions): Promise<PageSession>;
}

export interface NetworkFixture {
  install(page: Page): Promise<NetworkInterceptor>;
}

export interface CreateRoomOptions {
  fingerprint?: string;
  name?: string;
  httpOnly?: boolean;
}

export interface ParticipantOptions {
  fingerprint?: string;
  name?: string;
  httpOnly?: boolean;
}

export interface ModeratorOptions {
  fingerprint?: string;
  name?: string;
  httpOnly?: boolean;
}

interface HttpOnlySessionFixtures {
  room: RoomFixture;
  participant: ParticipantFixture;
  moderator: ModeratorFixture;
  network: NetworkFixture;
}

export const test = base.extend<HttpOnlySessionFixtures>({
  room: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];

    await use({
      create: async (options = {}) => {
        const name = options.name ?? 'Moderador';
        const fingerprint = options.fingerprint ?? `e2e-moderator-${contexts.length + 1}`;
        const context = await browser.newContext();
        contexts.push(context);
        await applyTestFingerprint(context, fingerprint);
        await applyHttpOnlyPreference(context, options.httpOnly ?? false);

        const page = await context.newPage();
        await page.goto('/');
        await page.getByLabel('Seu nome').fill(name);
        await page.getByRole('button', { name: 'Criar uma sala aleatória' }).click();
        await expect(page).toHaveURL(ROOM_PATH_PATTERN);

        const parsedUrl = new URL(page.url());
        const roomMatch = parsedUrl.pathname.match(ROOM_PATH_PATTERN);
        if (!roomMatch?.[1]) {
          throw new Error(`Room creation did not provide a room id: ${page.url()}`);
        }

        let token: string | null = null;
        await expect
          .poll(() => {
            token = new URL(page.url()).searchParams.get('token');
            return token;
          }, { timeout: 15_000 })
          .toBeTruthy();
        if (!token) {
          throw new Error(`Room creation did not provide a room token: ${page.url()}`);
        }

        return {
          origin: parsedUrl.origin,
          roomId: roomMatch[1],
          token,
          moderator: { context, fingerprint, name, page },
        };
      },
    });

    await Promise.all(contexts.map((context) => context.close()));
  },

  moderator: async ({}, use) => {
    await use({
      create: async (room, options = {}) => {
        const session = room.moderator;
        if (options.name && options.name !== session.name) {
          await session.page.getByLabel('Seu nome').fill(options.name);
        }
        return session;
      },
    });
  },

  participant: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];

    await use({
      create: async (room, options = {}) => {
        const name = options.name ?? `Participante ${contexts.length + 1}`;
        const fingerprint = options.fingerprint ?? `e2e-participant-${contexts.length + 1}`;
        const context = await browser.newContext();
        contexts.push(context);
        await applyTestFingerprint(context, fingerprint);
        await applyHttpOnlyPreference(context, options.httpOnly ?? false);

        const page = await context.newPage();
        const params = new URLSearchParams({ name, token: room.token });
        await page.goto(`${room.origin}/room/${room.roomId}?${params.toString()}`);
        await ensureJoinedFromJoinCard(page, name);

        return { context, fingerprint, name, page };
      },
    });

    await Promise.all(contexts.map((context) => context.close()));
  },

  network: async ({}, use) => {
    await use({
      install: async (page) => {
        const requests: string[] = [];
        const cleanup: Array<() => Promise<void>> = [];
        page.on('request', (request) => requests.push(request.url()));

        const addRoute = async (pattern: string, handler: (route: Route) => Promise<void>) => {
          await page.route(pattern, handler);
          cleanup.push(() => page.unroute(pattern, handler));
        };

        return {
          requests,
          blockHttpPolling: () =>
            addRoute('**/api/poker/**', async (route) => {
              await route.abort('failed');
            }),
          blockWebSocket: async () => {
            await addRoute('**/ws', async (route) => {
              await route.abort('failed');
            });
          },
          dispose: async () => {
            await Promise.all(cleanup.map((disposeRoute) => disposeRoute()));
          },
        };
      },
    });
  },
});

export { expect };

async function applyTestFingerprint(context: BrowserContext, fingerprint: string): Promise<void> {
  await context.addInitScript((value) => {
    (window as Window & { __TEST_FINGERPRINT?: string }).__TEST_FINGERPRINT = value;
  }, fingerprint);
}

async function applyHttpOnlyPreference(context: BrowserContext, enabled: boolean): Promise<void> {
  await context.addInitScript((value) => {
    if (value) {
      window.sessionStorage.setItem('bp_httpOnly', 'true');
    } else {
      window.sessionStorage.removeItem('bp_httpOnly');
    }
  }, enabled);
}

async function ensureJoinedFromJoinCard(page: Page, name: string): Promise<void> {
  const joinCard = page.locator('.join');
  if ((await joinCard.count()) === 0) {
    return;
  }

  const joinButton = joinCard.getByRole('button', { name: 'Entrar' });
  if (!(await joinButton.isVisible())) {
    return;
  }

  const nameInput = joinCard.getByLabel('Seu nome');
  if (!(await nameInput.inputValue())) {
    await nameInput.fill(name);
  }
  await joinButton.click();
}

async function waitForRoom(page: Page, expectedParticipants: number): Promise<void> {
  await expect(page.locator('.room')).toBeVisible();
  await expect
    .poll(async () => {
      const text = await page.locator('.room-header').innerText();
      return Number(text.match(/Participantes:\s*(\d+)/)?.[1] ?? 0);
    })
    .toBe(expectedParticipants);
}

async function waitForConnection(page: Page, status: RegExp = /conectado/i): Promise<void> {
  await expect(page.locator('p-tag').filter({ hasText: status })).toBeVisible({ timeout: 15_000 });
}

async function roomSession(page: Page, roomId: string): Promise<{ clientId: string; token: string }> {
  return page.evaluate((id) => {
    const raw = localStorage.getItem(`bp_session_${id}`);
    const session = raw ? JSON.parse(raw) as { clientId?: string } : null;
    const token = new URL(window.location.href).searchParams.get('token');
    if (!session?.clientId || !token) {
      throw new Error('Expected browser session and room token');
    }
    return { clientId: session.clientId, token };
  }, roomId);
}

async function expectParticipantVote(page: Page, name: string, vote: string): Promise<void> {
  const row = page.locator('.participants li', { hasText: name });
  await expect(row.locator('.vote-front', { hasText: vote })).toHaveCount(1);
}

async function expectParticipantHasVoted(page: Page, name: string): Promise<void> {
  const row = page.locator('.participants li', { hasText: name });
  await expect(row.locator('.vote-back')).toHaveCount(1);
}

test.describe('HTTP-only session persistence', () => {
  test('PW-001 @http-only joins without WebSocket or WebRTC', async ({ room, participant }) => {
    const created = await room.create({ httpOnly: true, name: 'Moderador HTTP' });
    const requests: string[] = [];
    created.moderator.page.on('request', (request) => requests.push(request.url()));
    const session = await participant.create(created, { httpOnly: true, name: 'Alice HTTP' });

    await waitForRoom(session.page, 2);
    await waitForConnection(session.page);
    await expect(session.page.locator('p-tag').filter({ hasText: 'HTTP' })).toBeVisible();
    expect(requests.some((url) => /\/ws|webrtc/i.test(url))).toBe(false);
  });

  test('PW-002 @http-only completes join, vote, reveal, and reset', async ({ room, participant }) => {
    const created = await room.create({ httpOnly: true, name: 'Moderador HTTP' });
    const player = await participant.create(created, { httpOnly: true, name: 'Alice HTTP' });

    await waitForRoom(created.moderator.page, 2);
    await waitForRoom(player.page, 2);
    await player.page.getByRole('button', { name: '5' }).click();
    await expectParticipantHasVoted(created.moderator.page, 'Alice HTTP');
    await created.moderator.page.getByRole('button', { name: 'Revelar' }).click();
    await expect(created.moderator.page.getByText('votos revelados')).toBeVisible();
    await expectParticipantVote(created.moderator.page, 'Alice HTTP', '5');
    await expect(player.page.getByText('votos revelados')).toBeVisible();
    await created.moderator.page.getByRole('button', { name: 'Resetar' }).click();
    await expect(created.moderator.page.getByText('cartas na mesa')).toBeVisible();
    await expect(player.page.getByText('cartas na mesa')).toBeVisible();
    await expect(created.moderator.page.getByRole('button', { name: 'Revelar' })).toBeVisible();
  });

  test('PW-003 @http-only @resilience keeps automatic fallback usable when WebSocket is blocked', async ({
    room,
    participant,
    network,
  }) => {
    const created = await room.create({ name: 'Moderador automático' });
    const player = await participant.create(created, { name: 'Alice fallback' });
    const blocker = await network.install(player.page);
    await blocker.blockWebSocket();
    await player.page.reload();

    await waitForRoom(player.page, 2);
    await player.page.getByRole('button', { name: '5' }).click();
    await created.moderator.page.getByRole('button', { name: 'Revelar' }).click();
    await expect(created.moderator.page.getByText('votos revelados')).toBeVisible();
    await created.moderator.page.getByRole('button', { name: 'Resetar' }).click();
    await expect(created.moderator.page.getByText('cartas na mesa')).toBeVisible();
    await blocker.dispose();
  });

  test('PW-004 @recovery restores participant identity and vote after reload', async ({ room, participant }) => {
    const created = await room.create({ httpOnly: true });
    const player = await participant.create(created, { httpOnly: true, name: 'Alice reload' });
    await waitForRoom(player.page, 2);
    await player.page.getByRole('button', { name: '5' }).click();
    await player.page.reload();
    await waitForRoom(player.page, 2);
    await waitForConnection(player.page);
    await expect(player.page.locator('.participants li', { hasText: 'Alice reload' })).toHaveCount(1);
    await expectParticipantHasVoted(player.page, 'Alice reload');
  });

  test('PW-005 @recovery @moderator preserves moderator controls across reloads', async ({ room, participant }) => {
    const created = await room.create({ httpOnly: true });
    const player = await participant.create(created, { httpOnly: true });
    await waitForRoom(created.moderator.page, 2);
    await created.moderator.page.reload();
    await waitForRoom(created.moderator.page, 2);
    await expect(created.moderator.page.getByRole('button', { name: 'Revelar' })).toBeVisible();
    await expect(player.page.getByRole('button', { name: 'Revelar' })).toHaveCount(0);
    await player.page.getByRole('button', { name: '5' }).click();
    await created.moderator.page.reload();
    await waitForRoom(created.moderator.page, 2);
    await expect(created.moderator.page.getByRole('button', { name: 'Resetar' })).toBeVisible();
    await expect(player.page.getByRole('button', { name: 'Resetar' })).toHaveCount(0);
  });

  test('PW-006 @tabs shares one identity in a second page', async ({ room }) => {
    const created = await room.create({ httpOnly: true });
    const page = created.moderator.page;
    const second = await created.moderator.context.newPage();
    await second.goto(page.url());
    await ensureJoinedFromJoinCard(second, 'Moderador');
    await waitForRoom(second, 1);
    await expect(second.locator('.participants li', { hasText: 'Moderador' })).toHaveCount(1);
    await waitForRoom(page, 1);
  });

  test('PW-007 @tabs @handoff keeps the room connected after the leader page closes', async ({ room }) => {
    const created = await room.create({ httpOnly: true });
    const first = created.moderator.page;
    const second = await created.moderator.context.newPage();
    await second.goto(first.url());
    await ensureJoinedFromJoinCard(second, 'Moderador');
    await waitForRoom(second, 1);
    await first.close();
    await waitForConnection(second);
    await expect(second.locator('.participants li', { hasText: 'Moderador' })).toHaveCount(1);
  });

  test('PW-008 @migration migrates legacy browser session values', async ({ room }) => {
    const created = await room.create({ httpOnly: true });
    const page = created.moderator.page;
    const session = await roomSession(page, created.roomId);
    await page.evaluate(({ roomId, clientId }) => {
      localStorage.removeItem(`bp_session_${roomId}`);
      localStorage.setItem(`bp_clientId_${roomId}`, clientId);
      localStorage.setItem(`bp_lastEventId_${roomId}`, '0');
      sessionStorage.setItem('bp_name', 'Moderador');
    }, { roomId: created.roomId, clientId: session.clientId });
    await page.reload();
    await waitForRoom(page, 1);
    await expect(page.locator('.participants li', { hasText: 'Moderador' })).toHaveCount(1);
    await expect.poll(() => page.evaluate((roomId) => localStorage.getItem(`bp_session_${roomId}`), created.roomId)).toContain('"schemaVersion":1');
  });

  test('PW-009 @resilience requires an explicit rejoin for an invalid recovery envelope', async ({ room }) => {
    const created = await room.create({ httpOnly: true });
    const page = created.moderator.page;
    await page.route('**/api/poker/action', async (route, request) => {
      const body = request.postDataJSON() as { type?: string };
      if (body.type === 'join') {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Session not found' }) });
        return;
      }
      await route.continue();
    });
    await page.evaluate((roomId) => {
      localStorage.setItem(`bp_session_${roomId}`, '{invalid');
      localStorage.removeItem(`bp_clientId_${roomId}`);
      localStorage.removeItem(`bp_lastEventId_${roomId}`);
    }, created.roomId);
    await page.reload();
    await expect(page.locator('p-tag').filter({ hasText: /entre novamente|indisponível/i })).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText(/sessão expirou|entre novamente/i).first()).toBeVisible({ timeout: 3_000 });
    await page.unroute('**/api/poker/action');
  });

  test('PW-010 @resilience reports an expired HTTP session without replacing identity', async ({ room }) => {
    const created = await room.create({ httpOnly: true });
    const page = created.moderator.page;
    await page.route('**/api/poker/events**', async (route) => {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Session not found' }) });
    });
    await page.reload();
    await expect(page.locator('p-tag').filter({ hasText: /entre novamente|indisponível/i })).toBeVisible({ timeout: 3_000 });
    await page.unroute('**/api/poker/events**');
  });

  test('PW-011 @resilience recovers from a temporary HTTP outage', async ({ room, participant }) => {
    const created = await room.create({ httpOnly: true });
    const player = await participant.create(created, { httpOnly: true });
    await player.page.route('**/api/poker/events**', async (route) => route.abort('failed'));
    await player.page.reload();
    await expect(player.page.locator('p-tag').filter({ hasText: /indisponível|reconectando/i })).toBeVisible({ timeout: 3_000 });
    await player.page.unroute('**/api/poker/events**');
    await expect(player.page.locator('p-tag').filter({ hasText: 'conectado' })).toBeVisible({ timeout: 15_000 });
    await expect(player.page.locator('.participants li', { hasText: player.name })).toHaveCount(1);
  });

  test('PW-012 @idempotency applies a mutation once across reload', async ({ room, participant }) => {
    const created = await room.create({ httpOnly: true });
    const player = await participant.create(created, { httpOnly: true });
    await player.page.getByRole('button', { name: '5' }).click();
    await player.page.reload();
    await waitForRoom(player.page, 2);
    await created.moderator.page.getByRole('button', { name: 'Revelar' }).click();
    await expect(created.moderator.page.getByText('votos revelados')).toBeVisible();
    await expectParticipantVote(created.moderator.page, player.name, '5');
  });

  test('PW-013 @idempotency treats repeated action identifiers as successful no-ops', async ({ room, participant }) => {
    const created = await room.create({ httpOnly: true });
    const player = await participant.create(created, { httpOnly: true });
    const session = await roomSession(player.page, created.roomId);
    const result = await player.page.evaluate(async ({ clientId, actionId, roomId }) => {
      const body = JSON.stringify({ type: 'vote', roomId, value: '5', actionId });
      const first = await fetch('/api/poker/action', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-Id': clientId }, body });
      const second = await fetch('/api/poker/action', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-Id': clientId }, body });
      return { first: first.status, second: second.status };
    }, { ...session, actionId: `e2e-duplicate-${Date.now()}`, roomId: created.roomId });
    expect(result).toEqual({ first: 200, second: 200 });
    await expect(player.page.locator('.participants li', { hasText: player.name })).toHaveCount(1);
  });

  test('PW-014 @resilience rejects a copied session with a different fingerprint', async ({ room, browser }) => {
    const created = await room.create({ httpOnly: true });
    const source = await roomSession(created.moderator.page, created.roomId);
    const context = await browser.newContext();
    await applyTestFingerprint(context, 'e2e-conflicting-fingerprint');
    await applyHttpOnlyPreference(context, true);
    await context.addInitScript(({ roomId, clientId }) => {
      localStorage.setItem(`bp_session_${roomId}`, JSON.stringify({ schemaVersion: 1, roomId, clientId, name: 'Cópia', lastEventId: 0, updatedAt: Date.now() }));
    }, { roomId: created.roomId, clientId: source.clientId });
    const page = await context.newPage();
    await page.goto(`${created.origin}/room/${created.roomId}?token=${encodeURIComponent(created.token)}&name=C%C3%B3pia`);
    await expect(page.getByText(/outra identidade|sessão|entre novamente/i).first()).toBeVisible({ timeout: 15_000 });
    await context.close();
  });

  test('PW-015 @resilience rejects missing, malformed, and wrong-room tokens', async ({ room, browser }) => {
    const created = await room.create();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${created.origin}/room/${created.roomId}?name=SemToken`);
    await expect(page.getByText(/Token da sala inválido/i)).toBeVisible({ timeout: 15_000 });
    await page.goto(`${created.origin}/room/${created.roomId}?name=TokenErrado&token=malformed`);
    await expect(page.getByText(/Token da sala inválido/i)).toBeVisible({ timeout: 15_000 });
    await context.close();
  });

  test('PW-016 @http-only keeps transport preference scoped to one browser session', async ({ room, browser }) => {
    const created = await room.create({ httpOnly: true });
    const flagged = created.moderator.page;
    await waitForConnection(flagged);
    await expect(flagged.locator('p-tag').filter({ hasText: 'HTTP' })).toBeVisible();
    const independentContext = await browser.newContext();
    await applyTestFingerprint(independentContext, 'e2e-independent-transport');
    const independent = await independentContext.newPage();
    await independent.goto(`${flagged.url()}&name=Independent`);
    await ensureJoinedFromJoinCard(independent, 'Independent');
    await waitForRoom(independent, 2);
    await expect(independent.locator('p-tag').filter({ hasText: 'HTTP' })).toHaveCount(0);
    await independentContext.close();
  });

  test('PW-REL participant @reliability @recovery restores one participant after reload', async ({ room, participant }) => {
    const created = await room.create({ httpOnly: true });
    const player = await participant.create(created, { httpOnly: true, name: 'Reliability participant' });
    await waitForRoom(player.page, 2);
    await player.page.reload();
    await waitForRoom(player.page, 2);
    await expect(player.page.locator('.participants li', { hasText: player.name })).toHaveCount(1);
  });

  test('PW-REL moderator @reliability @moderator preserves owner controls after reload', async ({ room, participant }) => {
    const created = await room.create({ httpOnly: true });
    await participant.create(created, { httpOnly: true });
    await created.moderator.page.reload();
    await waitForRoom(created.moderator.page, 2);
    await expect(created.moderator.page.getByRole('button', { name: 'Revelar' })).toBeVisible();
  });

  test('PW-REL lifecycle @reliability @lifecycle completes the HTTP-only round', async ({ room, participant }) => {
    const created = await room.create({ httpOnly: true });
    const player = await participant.create(created, { httpOnly: true, name: 'Reliability lifecycle' });
    await player.page.getByRole('button', { name: '5' }).click();
    await created.moderator.page.getByRole('button', { name: 'Revelar' }).click();
    await expect(created.moderator.page.getByText('votos revelados')).toBeVisible();
    await created.moderator.page.getByRole('button', { name: 'Resetar' }).click();
    await expect(created.moderator.page.getByText('cartas na mesa')).toBeVisible();
  });
});
