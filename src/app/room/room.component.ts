import { animate, query, stagger, style, transition, trigger } from '@angular/animations';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';

import type { PokerRoomViewState } from '../poker/poker-types';
import { PokerWsService } from '../poker/poker-ws.service';

@Component({
  selector: 'app-room',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    CardModule,
    InputTextModule,
    MessageModule,
    TagModule,
  ],
  templateUrl: './room.component.html',
  styleUrl: './room.component.scss',
  animations: [
    trigger('pageEnter', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(10px)' }),
        animate('260ms ease-out', style({ opacity: 1, transform: 'none' })),
      ]),
    ]),
    trigger('listAnim', [
      transition('* => *', [
        query(
          ':enter',
          [
            style({ opacity: 0, transform: 'translateY(8px)' }),
            stagger(40, animate('220ms ease-out', style({ opacity: 1, transform: 'none' }))),
          ],
          { optional: true },
        ),
        query(
          ':leave',
          [animate('150ms ease-in', style({ opacity: 0, transform: 'translateY(-8px)' }))],
          { optional: true },
        ),
      ]),
    ]),
    trigger('revealAnim', [
      transition('hidden => revealed', [
        style({ opacity: 0.7, transform: 'scale(0.98)' }),
        animate('220ms cubic-bezier(0.2, 0.9, 0.2, 1)', style({ opacity: 1, transform: 'none' })),
      ]),
    ]),
    trigger('votePick', [
      transition(':increment', [
        animate(
          '260ms cubic-bezier(0.2, 0.9, 0.2, 1)',
          style({ transform: 'rotateY(180deg) scale(1.05)' }),
        ),
        animate('200ms ease-out', style({ transform: 'none' })),
      ]),
    ]),
  ],
})
export class RoomComponent implements OnInit, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly voteOptions = ['0', '1', '2', '3', '5', '8', '13', '21', '?', '☕'];

  protected roomId = '';
  protected name = '';
  protected roomToken = signal<string | null>(null);
  protected isJoined = signal(false);
  protected state = signal<PokerRoomViewState | null>(null);
  protected clientId = signal<string | null>(null);
  protected errorMessage = signal<string | null>(null);
  protected copyMessage = signal<string | null>(null);
  protected selectedVote = signal<string | null>(null);
  protected votePickTick = signal(0);
  protected connectionStatus = signal<'disconnected' | 'connecting' | 'connected' | 'reconnecting'>(
    'disconnected',
  );
  protected transportMode = signal<'webrtc' | 'websocket' | 'http-polling' | null>(null);

  protected isOwner = computed(() => {
    const state = this.state();
    const clientId = this.clientId();
    return Boolean(state?.ownerId && clientId && state.ownerId === clientId);
  });

  protected participantsCount = computed(() => this.state()?.participants.length ?? 0);

  protected myHasVoted = computed(() => {
    const state = this.state();
    const clientId = this.clientId();
    if (!state || !clientId) {
      return false;
    }

    return state.participants.some((p) => p.id === clientId && p.hasVoted);
  });

  protected connectionLabel = computed(() => {
    switch (this.connectionStatus()) {
      case 'connected':
        return 'conectado';
      case 'connecting':
        return 'conectando…';
      case 'reconnecting':
        return 'reconectando…';
      default:
        return 'desconectado';
    }
  });

  protected transportModeLabel = computed(() => {
    const mode = this.transportMode();
    if (mode === 'webrtc') {
      return 'P2P';
    } else if (mode === 'websocket') {
      return 'WebSocket';
    } else if (mode === 'http-polling') {
      return 'HTTP';
    }
    return null;
  });

  protected connectionSeverity = computed<'success' | 'warn' | 'danger'>(() => {
    switch (this.connectionStatus()) {
      case 'connected':
        return 'success';
      case 'connecting':
      case 'reconnecting':
        return 'warn';
      default:
        return 'danger';
    }
  });

  protected transportModeSeverity = computed<'success' | 'secondary' | 'warn'>(() => {
    const mode = this.transportMode();
    if (mode === 'webrtc') {
      return 'success';  // Green for P2P (best)
    } else if (mode === 'websocket') {
      return 'secondary';  // Gray for WebSocket (good)
    } else if (mode === 'http-polling') {
      return 'warn';  // Yellow for HTTP (fallback)
    }
    return 'secondary';
  });

  private readonly subs = new Subscription();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly ws: PokerWsService,
  ) {}

  ngOnInit(): void {
    this.roomId = this.route.snapshot.paramMap.get('roomId') ?? '';
    const queryName = this.route.snapshot.queryParamMap.get('name') ?? '';
    const queryToken = this.route.snapshot.queryParamMap.get('token');
    this.roomToken.set(queryToken?.trim() || null);

    const browserName = isPlatformBrowser(this.platformId)
      ? sessionStorage.getItem('bp_name')
      : null;

    this.name = queryName || browserName || '';

    this.subs.add(
      this.ws.state$.subscribe((value: PokerRoomViewState | null) => {
        this.state.set(value);

        if (!value) {
          this.selectedVote.set(null);
          return;
        }

        const clientId = this.clientId();
        const hasVoted = clientId
          ? value.participants.some((p) => p.id === clientId && p.hasVoted)
          : false;

        if (!hasVoted) {
          this.selectedVote.set(null);
        }
      }),
    );

    this.subs.add(
      this.ws.clientId$.subscribe((value: string | null) => {
        this.clientId.set(value);
      }),
    );

    this.subs.add(
      this.ws.roomToken$.subscribe((token: string | null) => {
        if (!token) {
          return;
        }

        this.roomToken.set(token);

        if (!isPlatformBrowser(this.platformId)) {
          return;
        }

        const currentToken = this.route.snapshot.queryParamMap.get('token');
        if (currentToken) {
          return;
        }

        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { token },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }),
    );

    this.subs.add(
      this.ws.error$.subscribe((value: string | null) => {
        this.errorMessage.set(value);
      }),
    );

    this.subs.add(
      this.ws.status$.subscribe((value) => {
        this.connectionStatus.set(value);
      }),
    );

    this.subs.add(
      this.ws.mode$.subscribe((value) => {
        this.transportMode.set(value);
      }),
    );

    if (this.name && isPlatformBrowser(this.platformId)) {
      this.join();
    }
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.ws.disconnect();
  }

  join(): void {
    const name = this.name.trim();
    if (!name || !this.roomId) {
      return;
    }

    if (isPlatformBrowser(this.platformId)) {
      sessionStorage.setItem('bp_name', name);
    }
    void this.ws.connect(this.roomId, name, this.roomToken() ?? undefined);
    this.isJoined.set(true);
  }

  dismissError(): void {
    this.ws.clearError();
  }

  dismissCopyMessage(): void {
    this.copyMessage.set(null);
  }

  async copyRoomLink(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const origin = globalThis.location.origin;
    const token = this.roomToken();
    const params = new URLSearchParams();
    if (token) {
      params.set('token', token);
    }
    const queryString = params.size ? `?${params.toString()}` : '';
    const link = `${origin}/room/${this.roomId}${queryString}`;

    try {
      await globalThis.navigator.clipboard?.writeText(link);
      this.copyMessage.set('Link copiado!');
    } catch {
      this.copyMessage.set('Não foi possível copiar o link.');
    }
  }

  vote(value: string): void {
    this.selectedVote.set(value);
    this.votePickTick.update((tick) => tick + 1);
    this.ws.vote(value);
  }

  reveal(): void {
    this.ws.reveal();
  }

  reset(): void {
    this.ws.reset();
  }
}
