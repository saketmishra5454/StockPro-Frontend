import { DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { catchError, finalize, of } from 'rxjs';
import { Alert, Product, Warehouse } from '@core/models/inventory.models';
import { AlertService } from '@core/services/alert.service';
import { AuthService } from '@core/services/auth.service';
import { NotificationService } from '@core/services/notification.service';
import { ProductService } from '@core/services/product.service';
import { WarehouseService } from '@core/services/warehouse.service';
import { PageHeaderComponent } from '@shared/ui/page-header/page-header.component';

@Component({
  selector: 'app-alerts-page',
  standalone: true,
  imports: [DatePipe, FormsModule, MatButtonModule, MatIconModule, NgClass, NgFor, NgIf, PageHeaderComponent],
  template: `
    <app-page-header title="Alerts" description="Review low-stock and operational alerts, then mark them read or acknowledged.">
      <button mat-flat-button color="primary" type="button" (click)="sendAlert()" [disabled]="saving()">
        <mat-icon fontSet="material-icons-round">notification_add</mat-icon>
        Send alert
      </button>
    </app-page-header>

    <section class="module-grid module-grid--cards mb-4">
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">notifications</mat-icon></span><span class="metric-card__label">Inbox</span><strong class="metric-card__value">{{ alerts().length }}</strong></article>
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">mark_email_unread</mat-icon></span><span class="metric-card__label">Unread</span><strong class="metric-card__value">{{ unreadCount() }}</strong></article>
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">priority_high</mat-icon></span><span class="metric-card__label">Critical</span><strong class="metric-card__value">{{ criticalCount() }}</strong></article>
    </section>

    <section class="data-panel">
      <div class="panel-head">
        <h2>Alert Centre</h2>
        <div class="toolbar-row">
          <label class="search-field"><mat-icon fontSet="material-icons-round">person</mat-icon><input [ngModel]="recipientId()" (ngModelChange)="recipientId.set($event)" placeholder="Recipient ID"></label>
          <button mat-stroked-button type="button" (click)="load()">Load</button>
          <button mat-stroked-button type="button" (click)="loadPending()">Pending</button>
          <button mat-stroked-button type="button" (click)="loadAll()">All alerts</button>
          <button mat-stroked-button type="button" (click)="markAllRead()">Mark all read</button>
        </div>
      </div>
      <form class="form-grid" (ngSubmit)="sendAlert()">
        <label class="form-field"><input name="title" [(ngModel)]="draft.title" placeholder="Alert title" required></label>
        <label class="form-field"><input name="message" [(ngModel)]="draft.message" placeholder="Message"></label>
        <label class="form-field"><select name="severity" [(ngModel)]="draft.severity"><option>INFO</option><option>WARNING</option><option>CRITICAL</option></select></label>
        <label class="form-field"><input name="type" [(ngModel)]="draft.type" placeholder="Type"></label>
      </form>

      <div class="table-wrap">
        <div *ngIf="serviceMessage()" class="muted mb-3">{{ serviceMessage() }}</div>
        <table class="data-table">
          <thead><tr><th>Alert</th><th>Severity</th><th>Context</th><th>State</th><th>Created</th><th></th></tr></thead>
          <tbody>
            <tr *ngFor="let alert of filteredAlerts()">
              <td><strong>{{ alert.title }}</strong><div class="muted text-sm">{{ displayAlertMessage(alert) }}</div></td>
              <td><span class="status-pill" [ngClass]="severityClass(alert.severity)">{{ alert.severity }}</span></td>
              <td>{{ contextLabel(alert) }}</td>
              <td>{{ isRead(alert) ? 'Read' : 'Unread' }} / {{ isAcknowledged(alert) ? 'Acknowledged' : 'Pending' }}</td>
              <td>{{ alert.createdAt | date:'medium' }}</td>
              <td class="action-row">
                <button mat-icon-button type="button" aria-label="Mark read" (click)="markRead(alert)" [disabled]="isRead(alert)"><mat-icon fontSet="material-icons-round">done</mat-icon></button>
                <button mat-icon-button type="button" aria-label="Acknowledge" (click)="acknowledge(alert)" [disabled]="isAcknowledged(alert)"><mat-icon fontSet="material-icons-round">verified</mat-icon></button>
                <button mat-icon-button type="button" aria-label="Delete alert" (click)="delete(alert)"><mat-icon fontSet="material-icons-round">delete</mat-icon></button>
              </td>
            </tr>
            <tr *ngIf="loading()"><td colspan="6" class="muted">Loading alerts...</td></tr>
            <tr *ngIf="!loading() && !filteredAlerts().length"><td colspan="6" class="muted">No alerts found.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlertsPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private readonly alertsService = inject(AlertService);
  private readonly notifications = inject(NotificationService);
  private readonly productsService = inject(ProductService);
  private readonly warehousesService = inject(WarehouseService);
  private readonly route = inject(ActivatedRoute);

  readonly alerts = signal<Alert[]>([]);
  readonly productNames = signal(new Map<number, Product>());
  readonly warehouseNames = signal(new Map<number, Warehouse>());
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly recipientId = signal(String(this.auth.currentUser?.id ?? 1));
  readonly query = signal('');
  readonly apiUnreadCount = signal<number | null>(null);
  readonly serviceMessage = signal('');
  draft: Partial<Alert> = { severity: 'INFO', type: 'GENERAL', title: '', message: '' };

  readonly unreadCount = computed(() => this.apiUnreadCount() ?? this.alerts().filter((alert) => !this.isRead(alert)).length);
  readonly criticalCount = computed(() => this.alerts().filter((alert) => alert.severity === 'CRITICAL').length);
  readonly filteredAlerts = computed(() => {
    const term = this.query().trim().toLowerCase();

    if (!term) {
      return this.alerts();
    }

    return this.alerts().filter((alert) => [
      alert.title,
      alert.message,
      alert.type,
      alert.severity,
      this.contextLabel(alert),
      this.isRead(alert) ? 'read' : 'unread',
      this.isAcknowledged(alert) ? 'acknowledged' : 'pending'
    ].some((value) => value?.toLowerCase().includes(term)));
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.query.set(params.get('q')?.trim() ?? '');
    });
    this.loadContext();
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.serviceMessage.set('');
    this.loadUnreadCount();
    this.alertsService.getForRecipient(this.recipientId()).pipe(catchError(() => this.handleLoadFailure()), finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe((alerts) => this.alerts.set(alerts));
  }

  loadPending(): void {
    this.loading.set(true);
    this.serviceMessage.set('');
    this.loadUnreadCount();
    this.alertsService.getUnacknowledged(this.recipientId()).pipe(catchError(() => this.handleLoadFailure()), finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe((alerts) => this.alerts.set(alerts));
  }

  loadAll(): void {
    this.loading.set(true);
    this.serviceMessage.set('');
    this.alertsService.getAll().pipe(catchError(() => this.handleLoadFailure()), finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe((alerts) => this.alerts.set(alerts));
  }

  sendAlert(): void {
    if (!this.draft.title) {
      this.notifications.info('Alert title is required.');
      return;
    }

    this.saving.set(true);
    this.alertsService.send({ ...this.draft, recipientId: Number(this.recipientId()) }).pipe(finalize(() => this.saving.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.notifications.success('Alert sent.');
      this.draft = { severity: 'INFO', type: 'GENERAL', title: '', message: '' };
      this.load();
    });
  }

  markRead(alert: Alert): void { this.alertsService.markAsRead(alert.alertId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => { this.notifications.success('Alert marked read.'); this.load(); }); }
  acknowledge(alert: Alert): void { this.alertsService.acknowledge(alert.alertId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => { this.notifications.success('Alert acknowledged.'); this.load(); }); }
  delete(alert: Alert): void { this.alertsService.delete(alert.alertId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => { this.notifications.success('Alert deleted.'); this.load(); }); }
  markAllRead(): void { this.alertsService.markAllRead(this.recipientId()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => { this.notifications.success('All alerts marked read.'); this.load(); }); }

  private loadUnreadCount(): void {
    this.alertsService.getUnreadCount(this.recipientId()).pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef)).subscribe((result) => {
      this.apiUnreadCount.set(result?.unreadCount ?? null);
    });
  }

  private handleLoadFailure() {
    this.apiUnreadCount.set(null);
    this.serviceMessage.set('Alert service is unavailable. Start alert-service on port 8087 and wait for Eureka to register it.');
    return of<Alert[]>([]);
  }

  isRead(alert: Alert): boolean {
    return Boolean(alert.isRead ?? alert.read);
  }

  isAcknowledged(alert: Alert): boolean {
    return Boolean(alert.isAcknowledged ?? alert.acknowledged);
  }

  severityClass(severity: string): string {
    return severity === 'CRITICAL' ? 'status-pill--danger' : severity === 'WARNING' ? 'status-pill--warn' : 'status-pill--good';
  }

  contextLabel(alert: Alert): string {
    const productId = alert.relatedProductId;
    const warehouseId = alert.relatedWarehouseId;
    const product = productId ? this.productNames().get(productId) : undefined;
    const warehouse = warehouseId ? this.warehouseNames().get(warehouseId) : undefined;
    const productLabel = product ? `${product.name} (${product.sku})` : productId ? `Product ${productId}` : 'Product -';
    const warehouseLabel = warehouse ? warehouse.name : warehouseId ? `Warehouse ${warehouseId}` : 'Warehouse -';
    return `${productLabel} / ${warehouseLabel}`;
  }

  displayAlertMessage(alert: Alert): string {
    const message = alert.message || alert.type;
    const productId = alert.relatedProductId;
    const warehouseId = alert.relatedWarehouseId;
    const product = productId ? this.productNames().get(productId) : undefined;
    const warehouse = warehouseId ? this.warehouseNames().get(warehouseId) : undefined;

    if (!product && !warehouse) {
      return message;
    }

    return message
      .replace(/Product ID \d+/i, product ? `${product.name} (${product.sku})` : `Product ${productId}`)
      .replace(/Warehouse ID \d+/i, warehouse ? warehouse.name : `Warehouse ${warehouseId}`);
  }

  private loadContext(): void {
    this.productsService.getAll().pipe(catchError(() => of<Product[]>([])), takeUntilDestroyed(this.destroyRef)).subscribe((products) => {
      this.productNames.set(new Map(products.map((product) => [product.productId, product])));
    });
    this.warehousesService.getAll().pipe(catchError(() => of<Warehouse[]>([])), takeUntilDestroyed(this.destroyRef)).subscribe((warehouses) => {
      this.warehouseNames.set(new Map(warehouses.map((warehouse) => [warehouse.warehouseId, warehouse])));
    });
  }
}
