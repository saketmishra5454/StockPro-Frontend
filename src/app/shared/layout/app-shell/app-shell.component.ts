import { AsyncPipe, NgFor, NgIf, UpperCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService } from '@core/services/auth.service';
import { ThemeService } from '@core/services/theme.service';
import { NAVIGATION_ITEMS } from '../navigation.model';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    AsyncPipe,
    NgFor,
    NgIf,
    UpperCasePipe,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    MatButtonModule,
    MatIconModule,
    MatMenuModule
  ],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppShellComponent {
  private readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  readonly collapsed = signal(false);
  readonly user$ = this.auth.currentUser$;
  readonly visibleNavigation = computed(() => {
    const role = this.auth.currentUser?.role;
    return NAVIGATION_ITEMS.filter((item) => role && item.roles.includes(role));
  });

  toggleSidebar(): void {
    this.collapsed.update((value) => !value);
  }

  logout(): void {
    this.auth.logout();
  }
}
