import { animate, style, transition, trigger } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';

import { parseRoomInput } from '../poker/room-link';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, CardModule, InputTextModule, MessageModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  animations: [
    trigger('pageEnter', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(8px)' }),
        animate('250ms ease-out', style({ opacity: 1, transform: 'none' })),
      ]),
    ]),
  ],
})
export class HomeComponent {
  private readonly router: Router;

  protected name = '';
  protected roomId = '';
  protected errorMessage = signal<string | null>(null);

  constructor(router: Router) {
    this.router = router;
  }

  createRoom(): void {
    const id = `scrumzada-${Math.random().toString(36).slice(2, 8)}`;
    this.roomId = id;
    this.joinRoom();
  }

  joinRoom(): void {
    const name = this.name.trim();
    const parsed = parseRoomInput(this.roomId);
    const roomId = parsed.roomId;

    if (!name) {
      this.errorMessage.set('Informe seu nome para entrar na sala.');
      return;
    }

    if (!roomId) {
      this.errorMessage.set('Informe o ID da sala (ou crie uma).');
      return;
    }

    this.errorMessage.set(null);
    this.router.navigate(['/room', roomId], {
      queryParams: { name, ...(parsed.token ? { token: parsed.token } : {}) },
    });
  }
}
