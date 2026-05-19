import { NgClass, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import { Product, StockLevel, Warehouse } from '@core/models/inventory.models';
import { NotificationService } from '@core/services/notification.service';
import { ProductService } from '@core/services/product.service';
import { WarehouseService } from '@core/services/warehouse.service';
import { PageHeaderComponent } from '@shared/ui/page-header/page-header.component';

@Component({
  selector: 'app-warehouses-page',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatIconModule, NgClass, NgFor, NgIf, PageHeaderComponent],
  template: `
    <app-page-header title="Warehouses" description="Run warehouse capacity, stock visibility, and transfers from one operational view.">
      <button mat-flat-button color="primary" type="button" (click)="saveWarehouse()" [disabled]="saving()">
        <mat-icon fontSet="material-icons-round">add_business</mat-icon>
        {{ editingId ? 'Update warehouse' : 'Add warehouse' }}
      </button>
    </app-page-header>

    <section class="warehouse-hero">
      <div>
        <span class="eyebrow">Network command</span>
        <h2>{{ activeCount() }} active warehouses</h2>
        <p>{{ totalStockUnits() }} units visible across loaded stock rows, with {{ transferReadyCount() }} products ready to transfer from the selected location.</p>
      </div>
      <div class="hero-metrics">
        <span><strong>{{ warehouses().length }}</strong> locations</span>
        <span><strong>{{ averageCapacity() }}%</strong> avg capacity</span>
        <span><strong>{{ lowStock().length }}</strong> watch rows</span>
      </div>
    </section>

    <section class="warehouse-layout">
      <aside class="data-panel warehouse-sidebar">
        <div class="panel-head">
          <h2>Registered Warehouses</h2>
          <label class="search-field compact"><mat-icon fontSet="material-icons-round">search</mat-icon><input [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Search"></label>
        </div>

        <div class="warehouse-list">
          <button
            *ngFor="let warehouse of filteredWarehouses()"
            class="warehouse-card"
            type="button"
            [class.warehouse-card--active]="selectedWarehouseId() === warehouse.warehouseId"
            (click)="selectWarehouse(warehouse.warehouseId)"
          >
            <span class="warehouse-card__icon"><mat-icon fontSet="material-icons-round">warehouse</mat-icon></span>
            <span class="warehouse-card__body">
              <strong>{{ warehouse.name }}</strong>
              <small>{{ warehouse.location || 'Location not set' }} · Manager #{{ warehouse.managerId }}</small>
              <span class="capacity-bar"><i [style.width.%]="capacityPercent(warehouse)"></i></span>
            </span>
            <span class="status-pill" [class.status-pill--good]="isActive(warehouse)" [class.status-pill--danger]="!isActive(warehouse)">
              {{ isActive(warehouse) ? 'Active' : 'Inactive' }}
            </span>
          </button>
          <p *ngIf="loading()" class="muted panel-empty">Loading warehouses...</p>
          <p *ngIf="!loading() && !filteredWarehouses().length" class="muted panel-empty">No warehouses found.</p>
        </div>
      </aside>

      <section class="warehouse-main">
        <div class="workflow-grid">
          <article class="data-panel">
            <div class="panel-head">
              <h2>{{ selectedWarehouse()?.name || 'Select a warehouse' }}</h2>
              <div class="action-row" *ngIf="selectedWarehouse() as warehouse">
                <button mat-icon-button type="button" aria-label="Edit warehouse" (click)="edit(warehouse)"><mat-icon fontSet="material-icons-round">edit</mat-icon></button>
                <button *ngIf="isActive(warehouse); else restoreWarehouseAction" mat-icon-button type="button" aria-label="Deactivate warehouse" (click)="deactivate(warehouse)"><mat-icon fontSet="material-icons-round">block</mat-icon></button>
                <ng-template #restoreWarehouseAction>
                  <button mat-icon-button color="primary" type="button" aria-label="Activate warehouse" (click)="activate(warehouse)"><mat-icon fontSet="material-icons-round">lock_open</mat-icon></button>
                </ng-template>
              </div>
            </div>

            <div class="warehouse-detail" *ngIf="selectedWarehouse() as warehouse; else noWarehouseSelected">
              <div class="detail-tile"><span>Location</span><strong>{{ warehouse.location || 'Unassigned' }}</strong></div>
              <div class="detail-tile"><span>Capacity</span><strong>{{ usedCapacity(warehouse) }} / {{ warehouse.capacity || 0 }}</strong></div>
              <div class="detail-tile"><span>Phone</span><strong>{{ warehouse.phone || '-' }}</strong></div>
              <div class="detail-tile"><span>Address</span><strong>{{ warehouse.address || 'Address not set' }}</strong></div>
            </div>
            <ng-template #noWarehouseSelected>
              <p class="muted panel-empty">Choose a registered warehouse to see stock and transfer options.</p>
            </ng-template>
          </article>

          <article class="data-panel">
            <div class="panel-head">
              <h2>{{ editingId ? 'Edit Warehouse' : 'Create Warehouse' }}</h2>
              <button mat-stroked-button type="button" (click)="clearDraft()" *ngIf="editingId">Cancel edit</button>
            </div>
            <form class="form-grid compact-form" (ngSubmit)="saveWarehouse()">
              <label class="form-field"><input name="name" [(ngModel)]="draft.name" placeholder="Warehouse name" required></label>
              <label class="form-field"><input name="location" [(ngModel)]="draft.location" placeholder="City / location"></label>
              <label class="form-field"><input name="address" [(ngModel)]="draft.address" placeholder="Address"></label>
              <label class="form-field"><input name="managerId" [(ngModel)]="draft.managerId" type="number" min="1" placeholder="Manager ID"></label>
              <label class="form-field"><input name="capacity" [(ngModel)]="draft.capacity" type="number" min="0" placeholder="Capacity"></label>
              <label class="form-field"><input name="phone" [(ngModel)]="draft.phone" placeholder="Phone"></label>
            </form>
          </article>
        </div>

        <section class="data-panel transfer-panel">
          <div class="panel-head">
            <h2>Transfer Stock</h2>
            <span class="muted">Move available stock between registered warehouses</span>
          </div>
          <form class="transfer-grid" (ngSubmit)="transferStock()">
            <label class="form-field">
              <mat-icon fontSet="material-icons-round">logout</mat-icon>
              <select name="fromWarehouseId" [(ngModel)]="transfer.fromWarehouseId" (ngModelChange)="selectWarehouse($event)">
                <option [ngValue]="0">From warehouse</option>
                <option *ngFor="let warehouse of activeWarehouses()" [ngValue]="warehouse.warehouseId">{{ warehouse.name }}</option>
              </select>
            </label>
            <label class="form-field">
              <mat-icon fontSet="material-icons-round">login</mat-icon>
              <select name="toWarehouseId" [(ngModel)]="transfer.toWarehouseId">
                <option [ngValue]="0">To warehouse</option>
                <option *ngFor="let warehouse of destinationWarehouses()" [ngValue]="warehouse.warehouseId">{{ warehouse.name }}</option>
              </select>
            </label>
            <label class="form-field">
              <mat-icon fontSet="material-icons-round">inventory_2</mat-icon>
              <select name="productId" [(ngModel)]="transfer.productId">
                <option [ngValue]="0">Product in selected warehouse</option>
                <option *ngFor="let stock of transferableStock()" [ngValue]="stock.productId">{{ productLabel(stock.productId) }} · {{ available(stock) }} available</option>
              </select>
            </label>
            <label class="form-field">
              <mat-icon fontSet="material-icons-round">tag</mat-icon>
              <input name="quantity" [(ngModel)]="transfer.quantity" type="number" min="1" placeholder="Quantity">
            </label>
            <button mat-flat-button color="primary" type="submit" [disabled]="transferring()">Transfer</button>
          </form>
        </section>

        <section class="data-panel transfer-panel">
          <div class="panel-head">
            <h2>Reserve / Release Stock</h2>
            <span class="muted">Manage available vs reserved quantity for the selected warehouse</span>
          </div>
          <form class="reservation-grid" (ngSubmit)="reserveStock()">
            <label class="form-field">
              <mat-icon fontSet="material-icons-round">inventory_2</mat-icon>
              <select name="reservationProductId" [(ngModel)]="reservation.productId">
                <option [ngValue]="0">Product in selected warehouse</option>
                <option *ngFor="let stock of selectedStock()" [ngValue]="stock.productId">{{ productLabel(stock.productId) }} Â· {{ available(stock) }} available Â· {{ stock.reservedQuantity || 0 }} reserved</option>
              </select>
            </label>
            <label class="form-field">
              <mat-icon fontSet="material-icons-round">pin</mat-icon>
              <input name="reservationQuantity" [(ngModel)]="reservation.quantity" type="number" min="1" placeholder="Quantity">
            </label>
            <button mat-stroked-button type="button" (click)="releaseReservation()" [disabled]="reserving()">Release</button>
            <button mat-flat-button color="primary" type="submit" [disabled]="reserving()">Reserve</button>
          </form>
        </section>

        <section class="data-panel">
          <div class="panel-head stock-head">
            <h2>Stock In {{ selectedWarehouse()?.name || 'Warehouse' }}</h2>
            <label class="search-field"><mat-icon fontSet="material-icons-round">search</mat-icon><input [ngModel]="stockQuery()" (ngModelChange)="stockQuery.set($event)" placeholder="Search product, SKU, or stock ID"></label>
          </div>

          <div class="stock-grid">
            <article *ngFor="let stock of filteredStock()" class="stock-card" [ngClass]="stockTone(stock)">
              <div class="stock-card__top">
                <span class="stock-card__icon"><mat-icon fontSet="material-icons-round">inventory_2</mat-icon></span>
                <span class="status-pill">{{ available(stock) }} available</span>
              </div>
              <strong>{{ productLabel(stock.productId) }}</strong>
              <small>Product #{{ stock.productId }} · Stock #{{ stock.stockId || '-' }}</small>
              <div class="stock-card__numbers">
                <span><b>{{ stock.quantity }}</b> on hand</span>
                <span><b>{{ stock.reservedQuantity || 0 }}</b> reserved</span>
              </div>
            </article>
            <p *ngIf="stockLoading()" class="muted panel-empty">Loading warehouse stock...</p>
            <p *ngIf="!stockLoading() && !filteredStock().length" class="muted panel-empty">No stock found for this warehouse and search.</p>
          </div>
        </section>
      </section>
    </section>
  `,
  styles: [`
    .warehouse-hero {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1rem;
      padding: 1.25rem;
      border: 1px solid rgba(37, 120, 232, 0.18);
      border-radius: 0.5rem;
      background: linear-gradient(135deg, rgba(37, 120, 232, 0.16), rgba(20, 184, 166, 0.12)), var(--app-panel);
      box-shadow: 0 18px 60px rgba(15, 23, 42, 0.10);
    }

    .eyebrow {
      color: var(--app-accent);
      font-size: 0.75rem;
      font-weight: 800;
      text-transform: uppercase;
    }

    .warehouse-hero h2 {
      margin: 0.25rem 0;
      font-size: 2rem;
      font-weight: 900;
    }

    .warehouse-hero p {
      max-width: 42rem;
      margin: 0;
      color: var(--app-muted);
    }

    .hero-metrics {
      display: grid;
      gap: 0.55rem;
      min-width: 12rem;
    }

    .hero-metrics span,
    .detail-tile,
    .stock-card {
      border: 1px solid var(--app-border);
      border-radius: 0.5rem;
      background: var(--app-soft);
    }

    .hero-metrics span {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.75rem;
      color: var(--app-muted);
    }

    .warehouse-layout {
      display: grid;
      grid-template-columns: minmax(17rem, 22rem) minmax(0, 1fr);
      gap: 1rem;
    }

    .warehouse-sidebar {
      align-self: start;
    }

    .compact {
      max-width: 10rem;
    }

    .warehouse-list {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }

    .warehouse-card {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      border: 1px solid var(--app-border);
      border-radius: 0.5rem;
      background: var(--app-soft);
      padding: 0.75rem;
      color: var(--app-text);
      text-align: left;
      cursor: pointer;
    }

    .warehouse-card--active {
      border-color: rgba(37, 120, 232, 0.55);
      background: linear-gradient(135deg, rgba(37, 120, 232, 0.14), rgba(20, 184, 166, 0.10)), var(--app-panel);
    }

    .warehouse-card__icon,
    .stock-card__icon {
      display: grid;
      width: 2.35rem;
      height: 2.35rem;
      place-items: center;
      border-radius: 0.5rem;
      color: #fff;
      background: linear-gradient(135deg, #2578e8, #14b8a6);
    }

    .warehouse-card__body {
      display: grid;
      gap: 0.35rem;
      min-width: 0;
    }

    .warehouse-card small,
    .stock-card small {
      color: var(--app-muted);
    }

    .capacity-bar {
      overflow: hidden;
      height: 0.38rem;
      border-radius: 999px;
      background: rgba(148, 163, 184, 0.22);
    }

    .capacity-bar i {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #2578e8, #14b8a6);
    }

    .warehouse-main,
    .workflow-grid {
      display: grid;
      gap: 1rem;
    }

    .workflow-grid {
      grid-template-columns: minmax(0, 1.1fr) minmax(18rem, 0.9fr);
    }

    .warehouse-detail {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.75rem;
      padding: 1rem;
    }

    .detail-tile {
      display: grid;
      gap: 0.35rem;
      min-height: 5rem;
      padding: 0.9rem;
    }

    .detail-tile span {
      color: var(--app-muted);
      font-size: 0.78rem;
      font-weight: 800;
      text-transform: uppercase;
    }

    .detail-tile strong {
      overflow-wrap: anywhere;
    }

    .compact-form {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      border-bottom: 0;
    }

    .transfer-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
      gap: 0.75rem;
      padding: 1rem;
    }

    .reservation-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(8rem, 12rem) auto auto;
      gap: 0.75rem;
      padding: 1rem;
    }

    .stock-head {
      align-items: center;
    }

    .stock-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
      gap: 0.75rem;
      padding: 1rem;
    }

    .stock-card {
      display: grid;
      gap: 0.7rem;
      padding: 1rem;
    }

    .stock-card--empty {
      border-color: rgba(225, 29, 72, 0.22);
    }

    .stock-card--low {
      border-color: rgba(245, 158, 11, 0.32);
    }

    .stock-card__top,
    .stock-card__numbers {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }

    .stock-card__numbers {
      color: var(--app-muted);
      font-size: 0.85rem;
    }

    .panel-empty {
      padding: 1rem;
    }

    @media (max-width: 1100px) {
      .warehouse-layout,
      .workflow-grid,
      .warehouse-detail,
      .transfer-grid,
      .reservation-grid {
        grid-template-columns: 1fr;
      }

      .warehouse-hero {
        align-items: stretch;
        flex-direction: column;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WarehousesPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly warehousesService = inject(WarehouseService);
  private readonly productService = inject(ProductService);
  private readonly notifications = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);

  readonly warehouses = signal<Warehouse[]>([]);
  readonly products = signal<Product[]>([]);
  readonly selectedStock = signal<StockLevel[]>([]);
  readonly lowStock = signal<StockLevel[]>([]);
  readonly loading = signal(true);
  readonly stockLoading = signal(false);
  readonly saving = signal(false);
  readonly transferring = signal(false);
  readonly reserving = signal(false);
  readonly query = signal('');
  readonly stockQuery = signal('');
  readonly selectedWarehouseId = signal(0);
  editingId: number | null = null;
  draft: Partial<Warehouse> = this.emptyDraft();
  transfer = { fromWarehouseId: 0, toWarehouseId: 0, productId: 0, quantity: 1 };
  reservation = { productId: 0, quantity: 1 };

  readonly productMap = computed(() => new Map(this.products().map((product) => [product.productId, product])));
  readonly activeWarehouses = computed(() => this.warehouses().filter((warehouse) => this.isActive(warehouse)));
  readonly selectedWarehouse = computed(() => this.warehouses().find((warehouse) => warehouse.warehouseId === this.selectedWarehouseId()) ?? null);
  readonly destinationWarehouses = computed(() => this.activeWarehouses().filter((warehouse) => warehouse.warehouseId !== this.transfer.fromWarehouseId));
  readonly filteredWarehouses = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.warehouses().filter((warehouse) => !term || [warehouse.name, warehouse.location, warehouse.address].some((value) => value?.toLowerCase().includes(term)));
  });
  readonly filteredStock = computed(() => {
    const term = this.stockQuery().trim().toLowerCase();
    return this.selectedStock().filter((stock) => {
      const product = this.productMap().get(stock.productId);
      return !term || [
        String(stock.stockId ?? ''),
        String(stock.productId),
        product?.name,
        product?.sku,
        product?.category,
        product?.brand
      ].some((value) => value?.toLowerCase().includes(term));
    });
  });
  readonly transferableStock = computed(() => this.selectedStock().filter((stock) => this.available(stock) > 0));
  readonly averageCapacity = computed(() => {
    const rows = this.warehouses();
    return rows.length ? Math.round(rows.reduce((sum, warehouse) => sum + this.capacityPercent(warehouse), 0) / rows.length) : 0;
  });
  readonly activeCount = computed(() => this.warehouses().filter((warehouse) => this.isActive(warehouse)).length);
  readonly totalStockUnits = computed(() => this.selectedStock().reduce((sum, stock) => sum + stock.quantity, 0));
  readonly transferReadyCount = computed(() => this.transferableStock().length);

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const term = params.get('q')?.trim() ?? '';
      this.query.set(term);
      this.stockQuery.set(term);
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    forkJoin({
      warehouses: this.warehousesService.getAll().pipe(catchError(() => of<Warehouse[]>([]))),
      products: this.productService.getAll().pipe(catchError(() => of<Product[]>([]))),
      lowStock: this.warehousesService.getLowStock().pipe(catchError(() => of<StockLevel[]>([])))
    }).pipe(finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe(({ warehouses, products, lowStock }) => {
      this.warehouses.set(warehouses);
      this.products.set(products);
      this.lowStock.set(lowStock);
      const nextSelected = this.selectedWarehouseId() || warehouses[0]?.warehouseId || 0;
      this.selectedWarehouseId.set(nextSelected);
      this.transfer.fromWarehouseId = nextSelected;
      if (nextSelected) {
        this.loadStock(nextSelected);
      }
    });
  }

  selectWarehouse(warehouseId: number): void {
    if (!warehouseId || this.selectedWarehouseId() === warehouseId) {
      return;
    }

    this.selectedWarehouseId.set(warehouseId);
    this.transfer.fromWarehouseId = warehouseId;
    this.transfer.productId = 0;
    this.reservation.productId = 0;
    this.selectedStock.set([]);
    this.loadStock(warehouseId);
  }

  loadStock(warehouseId: number): void {
    this.stockLoading.set(true);
    this.warehousesService.getStockByWarehouse(warehouseId).pipe(
      catchError(() => of<StockLevel[]>([])),
      finalize(() => this.stockLoading.set(false)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((stock) => {
      this.selectedStock.set(stock);
      this.updateWarehouseUsedCapacity(warehouseId, this.totalQuantity(stock));
    });
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
      this.clearDraft();
      this.load();
    });
  }

  transferStock(): void {
    if (!this.transfer.fromWarehouseId || !this.transfer.toWarehouseId || !this.transfer.productId || !this.transfer.quantity) {
      this.notifications.info('Choose source, destination, product, and quantity.');
      return;
    }

    if (this.transfer.fromWarehouseId === this.transfer.toWarehouseId) {
      this.notifications.info('Choose two different warehouses.');
      return;
    }

    const stock = this.selectedStock().find((item) => item.productId === this.transfer.productId);
    if (stock && this.transfer.quantity > this.available(stock)) {
      this.notifications.info(`Only ${this.available(stock)} units are available to transfer.`);
      return;
    }

    this.transferring.set(true);
    this.warehousesService.transferStock(
      this.transfer.fromWarehouseId,
      this.transfer.toWarehouseId,
      this.transfer.productId,
      this.transfer.quantity
    ).pipe(finalize(() => this.transferring.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.notifications.success('Stock transferred.');
      this.transfer.productId = 0;
      this.transfer.quantity = 1;
      this.load();
    });
  }

  reserveStock(): void {
    this.changeReservation('reserve');
  }

  releaseReservation(): void {
    this.changeReservation('release');
  }

  edit(warehouse: Warehouse): void {
    this.editingId = warehouse.warehouseId;
    this.draft = { ...warehouse };
  }

  clearDraft(): void {
    this.editingId = null;
    this.draft = this.emptyDraft();
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
    return warehouse.capacity ? Math.min(Math.round((this.usedCapacity(warehouse) / warehouse.capacity) * 100), 100) : 0;
  }

  usedCapacity(warehouse: Warehouse): number {
    if (warehouse.warehouseId === this.selectedWarehouseId()) {
      return this.totalQuantity(this.selectedStock());
    }
    return warehouse.usedCapacity || 0;
  }

  available(stock: StockLevel): number {
    return stock.availableQuantity ?? Math.max(stock.quantity - (stock.reservedQuantity || 0), 0);
  }

  productLabel(productId: number): string {
    const product = this.productMap().get(productId);
    return product ? `${product.name} (${product.sku})` : `Product #${productId}`;
  }

  stockTone(stock: StockLevel): string {
    const available = this.available(stock);
    return available <= 0 ? 'stock-card--empty' : available <= 5 ? 'stock-card--low' : '';
  }

  private changeReservation(action: 'reserve' | 'release'): void {
    const warehouseId = this.selectedWarehouseId();
    const productId = Number(this.reservation.productId);
    const quantity = Number(this.reservation.quantity);

    if (!warehouseId || !productId || quantity <= 0) {
      this.notifications.info('Choose product and reservation quantity.');
      return;
    }

    const stock = this.selectedStock().find((item) => item.productId === productId);
    if (action === 'reserve' && stock && quantity > this.available(stock)) {
      this.notifications.info(`Only ${this.available(stock)} units are available to reserve.`);
      return;
    }
    if (action === 'release' && stock && quantity > (stock.reservedQuantity || 0)) {
      this.notifications.info(`Only ${stock.reservedQuantity || 0} units are reserved.`);
      return;
    }

    this.reserving.set(true);
    const request = action === 'reserve'
      ? this.warehousesService.reserveStock(warehouseId, productId, quantity)
      : this.warehousesService.releaseReservation(warehouseId, productId, quantity);
    request.pipe(finalize(() => this.reserving.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.notifications.success(action === 'reserve' ? 'Stock reserved.' : 'Reservation released.');
      this.reservation.quantity = 1;
      this.loadStock(warehouseId);
    });
  }

  private emptyDraft(): Partial<Warehouse> {
    return { name: '', location: '', address: '', managerId: 1, capacity: 0, usedCapacity: 0, phone: '' };
  }

  private totalQuantity(stock: StockLevel[]): number {
    return stock.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  }

  private updateWarehouseUsedCapacity(warehouseId: number, usedCapacity: number): void {
    this.warehouses.update((warehouses) =>
      warehouses.map((warehouse) =>
        warehouse.warehouseId === warehouseId ? { ...warehouse, usedCapacity } : warehouse
      )
    );
  }
}
