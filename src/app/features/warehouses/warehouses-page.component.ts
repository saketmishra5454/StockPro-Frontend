import { NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { catchError, finalize, of } from 'rxjs';
import { StockLevel, Warehouse } from '@core/models/inventory.models';
import { NotificationService } from '@core/services/notification.service';
import { WarehouseService } from '@core/services/warehouse.service';
import { PageHeaderComponent } from '@shared/ui/page-header/page-header.component';

@Component({
  selector: 'app-warehouses-page',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatIconModule, NgFor, NgIf, PageHeaderComponent],
  template: `
    <app-page-header title="Warehouses" description="Track storage capacity, active locations, and critical stock across warehouse operations.">
      <button mat-flat-button color="primary" type="button" (click)="saveWarehouse()" [disabled]="saving()">
        <mat-icon fontSet="material-icons-round">add_business</mat-icon>
        Add warehouse
      </button>
    </app-page-header>

    <section class="module-grid module-grid--cards mb-4">
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">warehouse</mat-icon></span><span class="metric-card__label">Locations</span><strong class="metric-card__value">{{ warehouses().length }}</strong></article>
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">inventory</mat-icon></span><span class="metric-card__label">Stock Rows</span><strong class="metric-card__value">{{ lowStock().length }}</strong></article>
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">percent</mat-icon></span><span class="metric-card__label">Avg Capacity Used</span><strong class="metric-card__value">{{ averageCapacity() }}%</strong></article>
    </section>

    <section class="data-panel">
      <div class="panel-head">
        <h2>Warehouse Network</h2>
        <label class="search-field"><mat-icon fontSet="material-icons-round">search</mat-icon><input [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Search location"></label>
      </div>
      <form class="form-grid" (ngSubmit)="saveWarehouse()">
        <label class="form-field"><input name="name" [(ngModel)]="draft.name" placeholder="Warehouse name" required></label>
        <label class="form-field"><input name="location" [(ngModel)]="draft.location" placeholder="City / location"></label>
        <label class="form-field"><input name="address" [(ngModel)]="draft.address" placeholder="Address"></label>
        <label class="form-field"><input name="managerId" [(ngModel)]="draft.managerId" type="number" min="1" placeholder="Manager ID"></label>
        <label class="form-field"><input name="capacity" [(ngModel)]="draft.capacity" type="number" min="0" placeholder="Capacity"></label>
        <label class="form-field"><input name="phone" [(ngModel)]="draft.phone" placeholder="Phone"></label>
      </form>

      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Warehouse</th><th>Location</th><th>Manager</th><th>Capacity</th><th>Used</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr *ngFor="let warehouse of filteredWarehouses()">
              <td><strong>{{ warehouse.name }}</strong><div class="muted text-sm">{{ warehouse.address || 'Address not set' }}</div></td>
              <td>{{ warehouse.location || 'Unassigned' }}</td>
              <td>#{{ warehouse.managerId }}</td>
              <td>{{ warehouse.capacity }}</td>
              <td>{{ capacityPercent(warehouse) }}%</td>
              <td><span class="status-pill" [class.status-pill--good]="isActive(warehouse)" [class.status-pill--danger]="!isActive(warehouse)">{{ isActive(warehouse) ? 'Active' : 'Inactive' }}</span></td>
              <td class="action-row">
                <button mat-icon-button type="button" aria-label="Edit warehouse" (click)="edit(warehouse)"><mat-icon fontSet="material-icons-round">edit</mat-icon></button>
                <button *ngIf="isActive(warehouse); else restoreWarehouseAction" mat-icon-button type="button" aria-label="Deactivate warehouse" (click)="deactivate(warehouse)"><mat-icon fontSet="material-icons-round">block</mat-icon></button>
                <ng-template #restoreWarehouseAction>
                  <button mat-icon-button color="primary" type="button" aria-label="Activate warehouse" (click)="activate(warehouse)"><mat-icon fontSet="material-icons-round">lock_open</mat-icon></button>
                </ng-template>
              </td>
            </tr>
            <tr *ngIf="loading()"><td colspan="7" class="muted">Loading warehouses...</td></tr>
            <tr *ngIf="!loading() && !filteredWarehouses().length"><td colspan="7" class="muted">No warehouses found.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WarehousesPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly warehousesService = inject(WarehouseService);
  private readonly notifications = inject(NotificationService);

  readonly warehouses = signal<Warehouse[]>([]);
  readonly lowStock = signal<StockLevel[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly query = signal('');
  editingId: number | null = null;
  draft: Partial<Warehouse> = this.emptyDraft();

  readonly filteredWarehouses = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.warehouses().filter((warehouse) => !term || [warehouse.name, warehouse.location, warehouse.address].some((value) => value?.toLowerCase().includes(term)));
  });
  readonly averageCapacity = computed(() => {
    const rows = this.warehouses();
    return rows.length ? Math.round(rows.reduce((sum, warehouse) => sum + this.capacityPercent(warehouse), 0) / rows.length) : 0;
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.warehousesService.getAll().pipe(catchError(() => of<Warehouse[]>([])), finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe((warehouses) => this.warehouses.set(warehouses));
    this.warehousesService.getLowStock().pipe(catchError(() => of<StockLevel[]>([])), takeUntilDestroyed(this.destroyRef)).subscribe((stock) => this.lowStock.set(stock));
  }

  saveWarehouse(): void {
    if (!this.draft.name) {
      this.notifications.info('Warehouse name is required.');
      return;
    }

    this.saving.set(true);
    const request = this.editingId ? this.warehousesService.update(this.editingId, this.draft) : this.warehousesService.create(this.draft);
    request.pipe(finalize(() => this.saving.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.notifications.success(this.editingId ? 'Warehouse updated.' : 'Warehouse created.');
      this.editingId = null;
      this.draft = this.emptyDraft();
      this.load();
    });
  }

  edit(warehouse: Warehouse): void {
    this.editingId = warehouse.warehouseId;
    this.draft = { ...warehouse };
  }

  isActive(warehouse: Warehouse): boolean {
    return warehouse.isActive ?? warehouse.active ?? true;
  }

  deactivate(warehouse: Warehouse): void {
    this.warehousesService.deactivate(warehouse.warehouseId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.notifications.success('Warehouse deactivated.');
      this.load();
    });
  }

  activate(warehouse: Warehouse): void {
    this.warehousesService.activate(warehouse.warehouseId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.notifications.success('Warehouse activated.');
      this.load();
    });
  }

  capacityPercent(warehouse: Warehouse): number {
    return warehouse.capacity ? Math.min(Math.round((warehouse.usedCapacity / warehouse.capacity) * 100), 100) : 0;
  }

  private emptyDraft(): Partial<Warehouse> {
    return { name: '', location: '', address: '', managerId: 1, capacity: 0, usedCapacity: 0, phone: '' };
  }
}
