import { Routes } from '@angular/router';

export const routes: Routes = [
	{
		path: '',
		loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent),
	},
	{
		path: 'room/:roomId',
		loadComponent: () => import('./room/room.component').then((m) => m.RoomComponent),
	},
	{
		path: '**',
		redirectTo: '',
	},
];
