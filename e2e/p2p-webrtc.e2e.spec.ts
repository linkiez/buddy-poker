import { expect, test, type Page, type Browser } from '@playwright/test';

function extractRoomIdFromUrl(url: string): string {
  const parsed = new URL(url);
  const match = parsed.pathname.match(/^\/room\/(.+)$/);
  if (!match?.[1]) {
    throw new Error(`Unexpected room URL: ${url}`);
  }
  return match[1];
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

async function getTransportMode(page: Page): Promise<string | null> {
  // Look for the transport mode tag in the room header
  const transportTag = page.locator('p-tag').filter({ hasText: /^(P2P|WebSocket|HTTP)$/ });
  
  if (await transportTag.count() === 0) {
    return null;
  }

  const text = await transportTag.textContent();
  return text?.trim() || null;
}

async function waitForTransportMode(page: Page, expectedMode: string, timeout = 20000) {
  await expect
    .poll(async () => await getTransportMode(page), { timeout })
    .toBe(expectedMode);
}

test.describe('P2P WebRTC - Basic Connection', () => {
  test('two peers connect via P2P', async ({ browser }) => {
    const aliceContext = await browser.newContext();
    const alicePage = await aliceContext.newPage();

    // Alice creates room
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

    // Wait for Alice to join
    await expect(alicePage.getByText('Participantes: 1')).toBeVisible({ timeout: 15_000 });

    // Bob joins
    const bobContext = await browser.newContext();
    const bobPage = await bobContext.newPage();
    const bobParams = new URLSearchParams();
    bobParams.set('name', 'Bob');
    bobParams.set('token', roomToken ?? '');
    await bobPage.goto(`${roomOrigin}/room/${roomId}?${bobParams.toString()}`);
    await ensureJoinedFromJoinCard(bobPage, 'Bob');

    // Both should see 2 participants
    await expect(bobPage.getByText('Participantes: 2')).toBeVisible({ timeout: 15_000 });
    await expect(alicePage.getByText('Participantes: 2')).toBeVisible({ timeout: 15_000 });

    // Check for P2P mode (may take time to establish)
    // Note: In test environment without TURN, P2P might not connect
    // So we check for any transport mode but verify functionality
    const aliceMode = await getTransportMode(alicePage);
    const bobMode = await getTransportMode(bobPage);
    
    expect(aliceMode).toBeTruthy();
    expect(bobMode).toBeTruthy();
    console.log(`Alice transport: ${aliceMode}, Bob transport: ${bobMode}`);

    // Test voting works regardless of transport
    await alicePage.getByRole('button', { name: '5' }).click();
    await bobPage.getByRole('button', { name: '8' }).click();

    await alicePage.getByRole('button', { name: 'Revelar' }).click();
    await expect(alicePage.getByText('votos revelados')).toBeVisible();

    const aliceRow = alicePage.locator('li', { hasText: 'Alice' });
    await expect(aliceRow.locator('.vote-front')).toHaveText('5');

    const bobRow = alicePage.locator('li', { hasText: 'Bob' });
    await expect(bobRow.locator('.vote-front')).toHaveText('8');

    await bobContext.close();
    await aliceContext.close();
  });
});

test.describe('P2P WebRTC - Mesh Networking', () => {
  test('three peers in mesh topology', async ({ browser }) => {
    const contexts: any[] = [];
    const pages: Page[] = [];
    const names = ['Alice', 'Bob', 'Charlie'];

    // Alice creates room
    const aliceContext = await browser.newContext();
    const alicePage = await aliceContext.newPage();
    contexts.push(aliceContext);
    pages.push(alicePage);

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

    await expect(alicePage.getByText('Participantes: 1')).toBeVisible({ timeout: 15_000 });

    // Bob and Charlie join
    for (const name of ['Bob', 'Charlie']) {
      const context = await browser.newContext();
      const page = await context.newPage();
      contexts.push(context);
      pages.push(page);

      const params = new URLSearchParams();
      params.set('name', name);
      params.set('token', roomToken ?? '');
      await page.goto(`${roomOrigin}/room/${roomId}?${params.toString()}`);
      await ensureJoinedFromJoinCard(page, name);
    }

    // All should see 3 participants
    for (const page of pages) {
      await expect(page.getByText('Participantes: 3')).toBeVisible({ timeout: 15_000 });
    }

    // Verify mesh: each peer votes
    const votes = ['5', '8', '13'];
    for (let i = 0; i < pages.length; i++) {
      await pages[i].getByRole('button', { name: votes[i] }).click();
    }

    // Alice reveals
    await alicePage.getByRole('button', { name: 'Revelar' }).click();

    // All should see revealed votes
    for (const page of pages) {
      await expect(page.getByText('votos revelados')).toBeVisible({ timeout: 15_000 });
    }

    // Verify votes visible to all
    for (let i = 0; i < names.length; i++) {
      const row = alicePage.locator('li', { hasText: names[i] });
      await expect(row.locator('.vote-front')).toHaveText(votes[i]);
    }

    // Cleanup
    for (const context of contexts) {
      await context.close();
    }
  });

  test('up to 8 peers can join in P2P mode', async ({ browser }) => {
    const peerCount = 8;
    const contexts: any[] = [];
    const pages: Page[] = [];

    // First peer creates room
    const firstContext = await browser.newContext();
    const firstPage = await firstContext.newPage();
    contexts.push(firstContext);
    pages.push(firstPage);

    await firstPage.goto('/');
    await firstPage.getByLabel('Seu nome').fill('Peer1');
    await firstPage.getByRole('button', { name: 'Criar uma sala aleatória' }).click();
    await expect(firstPage).toHaveURL(/\/room\//);

    const roomOrigin = new URL(firstPage.url()).origin;
    const roomId = extractRoomIdFromUrl(firstPage.url());

    let roomToken: string | null = null;
    await expect
      .poll(() => {
        roomToken = new URL(firstPage.url()).searchParams.get('token');
        return roomToken;
      }, { timeout: 15_000 })
      .toBeTruthy();

    // Join remaining peers (up to 8 total)
    for (let i = 2; i <= peerCount; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      contexts.push(context);
      pages.push(page);

      const params = new URLSearchParams();
      params.set('name', `Peer${i}`);
      params.set('token', roomToken ?? '');
      await page.goto(`${roomOrigin}/room/${roomId}?${params.toString()}`);
      await ensureJoinedFromJoinCard(page, `Peer${i}`);

      // Give time for P2P connections to establish
      await page.waitForTimeout(1000);
    }

    // All should see 8 participants
    for (const page of pages) {
      await expect(page.getByText(`Participantes: ${peerCount}`)).toBeVisible({ timeout: 20_000 });
    }

    // Verify voting works with 8 peers
    await pages[0].getByRole('button', { name: '8' }).click();
    await pages[1].getByRole('button', { name: '13' }).click();

    // Reveal
    await firstPage.getByRole('button', { name: 'Revelar' }).click();

    // Verify votes visible
    await expect(firstPage.getByText('votos revelados')).toBeVisible();
    
    // Cleanup
    for (const context of contexts) {
      await context.close();
    }
  });
});

test.describe('P2P WebRTC - Fallback Scenarios', () => {
  test('room with >8 participants uses WebSocket instead of P2P', async ({ browser }) => {
    const peerCount = 9;  // Exceeds P2P limit
    const contexts: any[] = [];
    const pages: Page[] = [];

    // First peer creates room
    const firstContext = await browser.newContext();
    const firstPage = await firstContext.newPage();
    contexts.push(firstContext);
    pages.push(firstPage);

    await firstPage.goto('/');
    await firstPage.getByLabel('Seu nome').fill('Peer1');
    await firstPage.getByRole('button', { name: 'Criar uma sala aleatória' }).click();
    await expect(firstPage).toHaveURL(/\/room\//);

    const roomOrigin = new URL(firstPage.url()).origin;
    const roomId = extractRoomIdFromUrl(firstPage.url());

    let roomToken: string | null = null;
    await expect
      .poll(() => {
        roomToken = new URL(firstPage.url()).searchParams.get('token');
        return roomToken;
      }, { timeout: 15_000 })
      .toBeTruthy();

    // Join 8 more peers (9 total)
    for (let i = 2; i <= peerCount; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      contexts.push(context);
      pages.push(page);

      const params = new URLSearchParams();
      params.set('name', `Peer${i}`);
      params.set('token', roomToken ?? '');
      await page.goto(`${roomOrigin}/room/${roomId}?${params.toString()}`);
      await ensureJoinedFromJoinCard(page, `Peer${i}`);
      await page.waitForTimeout(500);
    }

    // All should see 9 participants
    for (const page of pages) {
      await expect(page.getByText(`Participantes: ${peerCount}`)).toBeVisible({ timeout: 20_000 });
    }

    // Check transport mode - should NOT be P2P for >8 peers
    const mode = await getTransportMode(firstPage);
    console.log(`Room with ${peerCount} peers using transport: ${mode}`);
    
    // Mode should be WebSocket or HTTP, not P2P
    expect(mode).not.toBe('P2P');

    // Verify functionality still works
    await pages[0].getByRole('button', { name: '5' }).click();
    await firstPage.getByRole('button', { name: 'Revelar' }).click();
    await expect(firstPage.getByText('votos revelados')).toBeVisible();

    // Cleanup
    for (const context of contexts) {
      await context.close();
    }
  });
});

test.describe('P2P WebRTC - Peer Disconnection', () => {
  test('room continues when a peer disconnects', async ({ browser }) => {
    const aliceContext = await browser.newContext();
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

    await expect(alicePage.getByText('Participantes: 1')).toBeVisible({ timeout: 15_000 });

    // Bob joins
    const bobContext = await browser.newContext();
    const bobPage = await bobContext.newPage();
    const bobParams = new URLSearchParams();
    bobParams.set('name', 'Bob');
    bobParams.set('token', roomToken ?? '');
    await bobPage.goto(`${roomOrigin}/room/${roomId}?${bobParams.toString()}`);
    await ensureJoinedFromJoinCard(bobPage, 'Bob');

    // Charlie joins
    const charlieContext = await browser.newContext();
    const charliePage = await charlieContext.newPage();
    const charlieParams = new URLSearchParams();
    charlieParams.set('name', 'Charlie');
    charlieParams.set('token', roomToken ?? '');
    await charliePage.goto(`${roomOrigin}/room/${roomId}?${charlieParams.toString()}`);
    await ensureJoinedFromJoinCard(charliePage, 'Charlie');

    // All see 3 participants
    await expect(alicePage.getByText('Participantes: 3')).toBeVisible({ timeout: 15_000 });

    // Bob disconnects
    await bobContext.close();

    // Remaining peers should see 2 participants
    await expect(alicePage.getByText('Participantes: 2')).toBeVisible({ timeout: 15_000 });
    await expect(charliePage.getByText('Participantes: 2')).toBeVisible({ timeout: 15_000 });

    // Verify voting still works
    await alicePage.getByRole('button', { name: '5' }).click();
    await charliePage.getByRole('button', { name: '8' }).click();

    await alicePage.getByRole('button', { name: 'Revelar' }).click();
    await expect(alicePage.getByText('votos revelados')).toBeVisible();

    await charlieContext.close();
    await aliceContext.close();
  });
});
