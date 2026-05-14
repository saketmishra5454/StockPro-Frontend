import { AsyncPipe, NgFor, NgIf, UpperCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { catchError, of } from 'rxjs';
import { Alert } from '@core/models/inventory.models';
import { AlertService } from '@core/services/alert.service';
import { AuthService } from '@core/services/auth.service';
import { ThemeService } from '@core/services/theme.service';
import { NAVIGATION_ITEMS } from '../navigation.model';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    AsyncPipe,
    FormsModule,
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
  private readonly router = inject(Router);
  private readonly alertsService = inject(AlertService);
  private readonly destroyRef = inject(DestroyRef);
  readonly theme = inject(ThemeService);
  readonly collapsed = signal(false);
  readonly searchQuery = signal('');
  readonly alerts = signal<Alert[]>([]);
  readonly user$ = this.auth.currentUser$;
  readonly visibleNavigation = computed(() => {
    const role = this.auth.currentUser?.role;
    return NAVIGATION_ITEMS.filter((item) => role && item.roles.includes(role));
  });
  readonly searchMatches = computed(() => {
    const term = this.searchQuery().trim().toLowerCase();

    if (!term) {
      return [];
    }

    return this.visibleNavigation()
      .filter((item) => this.searchTokens(item).some((token) => token.includes(term) || term.includes(token)))
      .slice(0, 6);
  });
  readonly unreadAlerts = computed(() => this.alerts().filter((alert) => !this.isRead(alert)));
  readonly alertPreview = computed(() => this.alerts().slice(0, 5));

  constructor() {
    this.loadAlerts();
  }

  toggleSidebar(): void {
    this.collapsed.update((value) => !value);
  }

  runSearch(): void {
    const term = this.searchQuery().trim();

    if (!term) {
      return;
    }

    const match = this.searchMatches()[0] ?? this.routeForTerm(term);
    void this.router.navigate([match.route], { queryParams: { q: term } });
  }

  openSearchMatch(route: string): void {
    const term = this.searchQuery().trim();
    void this.router.navigate([route], term ? { queryParams: { q: term } } : undefined);
  }

  loadAlerts(): void {
    const userId = this.auth.currentUser?.id;

    if (!userId) {
      this.alerts.set([]);
      return;
    }

    this.alertsService.getForRecipient(userId).pipe(
      catchError(() => of<Alert[]>([])),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((alerts) => this.alerts.set(alerts));
  }

  markAllAlertsRead(): void {
    const userId = this.auth.currentUser?.id;

    if (!userId || !this.unreadAlerts().length) {
      return;
    }

    this.alertsService.markAllRead(userId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.alerts.update((alerts) => alerts.map((alert) => ({ ...alert, isRead: true, read: true })));
    });
  }

  openAlerts(): void {
    void this.router.navigate(['/alerts']);
  }

  logout(): void {
    this.auth.logout();
  }

  isRead(alert: Alert): boolean {
    return Boolean(alert.isRead ?? alert.read);
  }

  private routeForTerm(term: string): { route: string } {
    const normalized = term.toLowerCase();

    if (/(report|analytics|valuation|turnover|snapshot|dead stock|top moving|slow moving|csv|pdf|export)/.test(normalized)) {
      return { route: '/reports' };
    }

    if (/(alert|notification|low stock|overstock|reorder|threshold|critical|warning)/.test(normalized)) {
      return { route: '/alerts' };
    }

    if (/(movement|movements|transfer|audit|adjustment|write.?off|receipt|issue|stock in|stock out)/.test(normalized)) {
      return { route: '/stock-movements' };
    }

    if (/(supplier|vendor)/.test(normalized)) {
      return { route: '/suppliers' };
    }

    if (/(po|purchase|order)/.test(normalized)) {
      return { route: '/purchase-orders' };
    }

    if (/(warehouse|stock level|capacity|location|manager)/.test(normalized)) {
      return { route: '/warehouses' };
    }

    if (/(product|products|inventory|sku|barcode|category|brand|catalog|item)/.test(normalized)) {
      return { route: '/products' };
    }

    return { route: '/products' };
  }

  private searchTokens(item: { label: string; route: string }): string[] {
    const aliases: Record<string, string[]> = {
      '/products': ['product', 'products', 'inventory', 'sku', 'catalog', 'barcode', 'category', 'brand', 'item'],
      '/suppliers': ['supplier', 'suppliers', 'vendor', 'rating', 'city', 'country'],
      '/purchase-orders': ['purchase', 'order', 'orders', 'po', 'procurement', 'receipt', 'approval', 'pending'],
      '/stock-movements': ['stock movement', 'movement', 'movements', 'transfer', 'audit', 'adjustment', 'write off', 'stock in', 'stock out'],
      '/alerts': ['alert', 'alerts', 'notification', 'notifications', 'low stock', 'overstock', 'reorder', 'threshold', 'critical', 'warning'],
      '/warehouses': ['warehouse', 'warehouses', 'stock level', 'capacity', 'location', 'manager'],
      '/reports': ['report', 'reports', 'analytics', 'valuation', 'turnover', 'snapshot', 'dead stock', 'top moving', 'slow moving', 'export'],
      '/dashboard': ['dashboard', 'home']
    };

    return [item.label.toLowerCase(), item.route.replace('/', ''), ...(aliases[item.route] ?? [])];
  }
}
