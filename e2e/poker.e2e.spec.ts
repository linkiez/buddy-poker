import { expect, test, type BrowserContext, type Page } from '@playwright/test';

function extractRoomIdFromUrl(url: string): string {
  const parsed = new URL(url);
  const match = parsed.pathname.match(/^\/room\/(.+)$/);
  if (!match?.[1]) {
    throw new Error(`Unexpected room URL: ${url}`);
  }
  return match[1];
}

async function applyTestFingerprint(context: BrowserContext, fingerprint: string) {
  await context.addInitScript((fp) => {
    (window as unknown as { __TEST_FINGERPRINT?: string }).__TEST_FINGERPRINT = fp;
  }, fingerprint);
}

async function waitForParticipantCount(page: Page, count: number, timeout = 15000) {
  await page.waitForFunction(
    (expectedCount) => {
      const subtitle = document.querySelector('.subtitle');
      if (!subtitle) return false;
      const text = subtitle.textContent || '';
      const match = text.match(/Participantes:\s*(\d+)/);
      return match && Number.parseInt(match[1], 10) === expectedCount;
    },
    count,
    { timeout }
  );
}

async function ensureJoinedFromJoinCard(page: Page, name: string) {
  const joinCard = page.locator('.join');
  const joinNameInput = joinCard.getByLabel('Seu nome');
  const joinButton = joinCard.getByRole('button', { name: 'Entrar' });

  if ((await joinCard.count()) === 0) {
    return;
  }

  if (!(await joinButton.isVisible())) {
    return;
  }

  const currentName = await joinNameInput.inputValue();
  if (!currentName) {
    await joinNameInput.fill(name);
  }

  await joinButton.click();
}

async function expectParticipantVote(page: Page, name: string, vote: string) {
  const row = page.locator('.participants li', { hasText: name });
  await expect(row.locator('.vote-front', { hasText: vote })).toHaveCount(1);
}

test('can open a room without name and join via form', async ({ page }) => {
  await page.goto('/room/e2e-join-with-form');

  await expect(page.getByRole('heading', { name: /Sala: e2e-join-with-form/ })).toBeVisible();
  await expect(page.getByLabel('Seu nome')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();

  await page.getByLabel('Seu nome').fill('Carol');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await waitForParticipantCount(page, 1);
});

test('moderator can run a round with two participants (WS + SSR)', async ({ browser }) => {
  const aliceContext = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  await applyTestFingerprint(aliceContext, 'e2e-alice');
  const alicePage = await aliceContext.newPage();

  await alicePage.goto('/');
  await alicePage.getByLabel('Seu nome').fill('Alice');
  await alicePage.getByRole('button', { name: 'Criar uma sala aleatória' }).click();
  await expect(alicePage).toHaveURL(/\/room\//);

  const roomOrigin = new URL(alicePage.url()).origin;
  const roomId = extractRoomIdFromUrl(alicePage.url());

  let roomToken: string | null = null;
  await expect
    .poll(() => {
      roomToken = new URL(alicePage.url()).searchParams.get('token');
      return roomToken;
    }, { timeout: 15_000 })
    .toBeTruthy();

  const bobContext = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  await applyTestFingerprint(bobContext, 'e2e-bob');
  const bobPage = await bobContext.newPage();

  const bobParams = new URLSearchParams();
  bobParams.set('name', 'Bob');
  bobParams.set('token', roomToken ?? '');

  await bobPage.goto(`${roomOrigin}/room/${roomId}?${bobParams.toString()}`);

  await ensureJoinedFromJoinCard(bobPage, 'Bob');

  await waitForParticipantCount(bobPage, 2);
  await waitForParticipantCount(alicePage, 2);

  await expect(bobPage.getByRole('button', { name: 'Revelar' })).toHaveCount(0);
  await expect(bobPage.getByRole('button', { name: 'Resetar' })).toHaveCount(0);
  await expect(bobPage.getByText(/Modo participante/)).toBeVisible();

  await alicePage.getByRole('button', { name: 'Copiar link' }).click();
  await expect(alicePage.getByText(/copiado/i)).toBeVisible();

  const clipboardText = await alicePage.evaluate(async () => navigator.clipboard.readText());
  expect(clipboardText).toContain(`/room/${roomId}`);

  await alicePage.getByRole('button', { name: '5' }).click();
  await bobPage.getByRole('button', { name: '8' }).click();

  await alicePage.getByRole('button', { name: 'Revelar' }).click();
  await expect(alicePage.getByText('votos revelados')).toBeVisible();

  await expectParticipantVote(alicePage, 'Alice', '5');
  await expectParticipantVote(alicePage, 'Bob', '8');

  await alicePage.getByRole('button', { name: 'Resetar' }).click();
  await expect(alicePage.getByText('cartas na mesa')).toBeVisible();

  await bobContext.close();
  await aliceContext.close();
});

test('joining an existing room without token is rejected (from 2nd participant on)', async ({ browser }) => {
  const aliceContext = await browser.newContext();
  await applyTestFingerprint(aliceContext, 'e2e-alice');
  const alicePage = await aliceContext.newPage();

  await alicePage.goto('/');
  await alicePage.getByLabel('Seu nome').fill('Alice');
  await alicePage.getByRole('button', { name: 'Criar uma sala aleatória' }).click();
  await expect(alicePage).toHaveURL(/\/room\//);

  const roomOrigin = new URL(alicePage.url()).origin;
  const roomId = extractRoomIdFromUrl(alicePage.url());

  let token: string | null = null;
  await expect
    .poll(() => {
      token = new URL(alicePage.url()).searchParams.get('token');
      return token;
    }, { timeout: 15_000 })
    .toBeTruthy();

  const eveContext = await browser.newContext();
  await applyTestFingerprint(eveContext, 'e2e-eve');
  const evePage = await eveContext.newPage();
  await evePage.goto(`${roomOrigin}/room/${roomId}?name=Eve`);

  await expect(evePage.getByText('Token da sala inválido. Peça o link correto para o moderador.')).toBeVisible({
    timeout: 15_000,
  });

  await eveContext.close();
  await aliceContext.close();
});

test('same user cannot join room with different identity (fingerprint validation)', async ({ browser }) => {
  // Use same browser context to ensure same fingerprint
  const context = await browser.newContext();
  await applyTestFingerprint(context, 'e2e-fixed-fingerprint');
  const alicePage = await context.newPage();

  // Alice creates room
  await alicePage.goto('/');
  await alicePage.getByLabel('Seu nome').fill('Alice');
  await alicePage.getByRole('button', { name: 'Criar uma sala aleatória' }).click();
  await expect(alicePage).toHaveURL(/\/room\//);

  const roomOrigin = new URL(alicePage.url()).origin;
  const roomId = extractRoomIdFromUrl(alicePage.url());

  let token: string | null = null;
  await expect
    .poll(() => {
      token = new URL(alicePage.url()).searchParams.get('token');
      return token;
    }, { timeout: 15_000 })
    .toBeTruthy();

  await waitForParticipantCount(alicePage, 1);

  // Try to join same room with different name in new tab (same browser context = same fingerprint)
  const evePage = await context.newPage();
  const params = new URLSearchParams();
  params.set('name', 'Eve');
  params.set('token', token ?? '');
  await evePage.goto(`${roomOrigin}/room/${roomId}?${params.toString()}`);

  await ensureJoinedFromJoinCard(evePage, 'Eve');

  // Should see error message about already being in the room
  await expect(evePage.getByText('Você já está participando desta sala com outra identidade.')).toBeVisible({
    timeout: 15_000,
  });

  // Alice should still see only 1 participant
  await waitForParticipantCount(alicePage, 1);

  await context.close();
});
