import { DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import { Product, StockLevel, StockMovement, Warehouse } from '@core/models/inventory.models';
import { MovementService } from '@core/services/movement.service';
import { NotificationService } from '@core/services/notification.service';
import { ProductService } from '@core/services/product.service';
import { WarehouseService } from '@core/services/warehouse.service';
import { PageHeaderComponent } from '@shared/ui/page-header/page-header.component';

type OperationType = 'STOCK_IN' | 'STOCK_OUT' | 'TRANSFER' | 'ADJUSTMENT' | 'WRITE_OFF' | 'RETURN';

@Component({
  selector: 'app-stock-movements-page',
  standalone: true,
  imports: [DatePipe, FormsModule, MatButtonModule, MatIconModule, NgClass, NgFor, NgIf, PageHeaderComponent],
  template: `
    <app-page-header title="Stock Movements" description="Perform stock operations and review the live movement audit trail.">
      <button mat-stroked-button type="button" (click)="exportMovements()">
        <mat-icon fontSet="material-icons-round">download</mat-icon>
        Export CSV
      </button>
      <button mat-flat-button color="primary" type="button" (click)="executeOperation()" [disabled]="saving()">
        <mat-icon fontSet="material-icons-round">sync_alt</mat-icon>
        Run operation
      </button>
    </app-page-header>

    <section class="movement-hero">
      <div>
        <span class="eyebrow">Inventory operations</span>
        <h2>{{ movements().length }} audit entries</h2>
        <p>{{ inboundUnits() }} inbound units · {{ outboundUnits() }} outbound units · {{ selectedStock().length }} stock rows in selected warehouse.</p>
      </div>
      <div class="operation-tabs">
        <button *ngFor="let type of operationTypes" type="button" [class.operation-tab--active]="operation.type === type" (click)="setOperation(type)">
          <mat-icon fontSet="material-icons-round">{{ iconForType(type) }}</mat-icon>
          <span>{{ labelForType(type) }}</span>
        </button>
      </div>
    </section>

    <section class="movement-layout">
      <article class="data-panel operation-panel">
        <div class="panel-head">
          <h2>{{ labelForType(operation.type) }}</h2>
          <span class="muted">{{ operation.type === 'TRANSFER' ? 'Move stock between warehouses' : 'Update stock in the selected warehouse' }}</span>
        </div>

        <form class="operation-grid" (ngSubmit)="executeOperation()">
          <label class="form-field">
            <mat-icon fontSet="material-icons-round">warehouse</mat-icon>
            <select name="warehouseId" [(ngModel)]="operation.warehouseId" (ngModelChange)="selectWarehouse($event)">
              <option [ngValue]="0">Select warehouse</option>
              <option *ngFor="let warehouse of activeWarehouses()" [ngValue]="warehouse.warehouseId">{{ warehouse.name }}</option>
            </select>
          </label>
          <label class="form-field" *ngIf="operation.type === 'TRANSFER'">
            <mat-icon fontSet="material-icons-round">move_down</mat-icon>
            <select name="toWarehouseId" [(ngModel)]="operation.toWarehouseId">
              <option [ngValue]="0">Destination warehouse</option>
              <option *ngFor="let warehouse of destinationWarehouses()" [ngValue]="warehouse.warehouseId">{{ warehouse.name }}</option>
            </select>
          </label>
          <label class="form-field">
            <mat-icon fontSet="material-icons-round">inventory_2</mat-icon>
            <select name="productId" [(ngModel)]="operation.productId">
              <option [ngValue]="0">Select product</option>
              <option *ngFor="let product of selectableProducts()" [ngValue]="product.productId">{{ product.name }} · {{ product.sku }}</option>
            </select>
          </label>
          <label class="form-field">
            <mat-icon fontSet="material-icons-round">pin</mat-icon>
            <input name="quantity" [(ngModel)]="operation.quantity" type="number" min="1" placeholder="Quantity">
          </label>
          <label class="form-field note-field">
            <mat-icon fontSet="material-icons-round">notes</mat-icon>
            <input name="notes" [(ngModel)]="operation.notes" placeholder="Reason or reference">
          </label>
          <button mat-flat-button color="primary" type="submit" [disabled]="saving()">Apply operation</button>
        </form>

        <div class="operation-summary">
          <span><b>{{ warehouseName(operation.warehouseId) }}</b> source</span>
          <span><b>{{ productName(operation.productId) }}</b> product</span>
          <span *ngIf="operation.type === 'TRANSFER'"><b>{{ warehouseName(operation.toWarehouseId) }}</b> destination</span>
          <span><b>{{ projectedDelta() }}</b> stock delta</span>
        </div>
      </article>

      <article class="data-panel stock-panel">
        <div class="panel-head">
          <h2>Warehouse Stock</h2>
          <label class="search-field compact"><mat-icon fontSet="material-icons-round">search</mat-icon><input [ngModel]="stockQuery()" (ngModelChange)="stockQuery.set($event)" placeholder="Search stock"></label>
        </div>
        <div class="stock-list">
          <button *ngFor="let stock of filteredStock()" type="button" class="stock-row" (click)="operation.productId = stock.productId">
            <span class="stock-row__icon"><mat-icon fontSet="material-icons-round">inventory_2</mat-icon></span>
            <span>
              <strong>{{ productName(stock.productId) }}</strong>
              <small>{{ stock.quantity }} on hand · {{ stock.reservedQuantity || 0 }} reserved</small>
            </span>
            <span class="status-pill" [ngClass]="available(stock) <= 0 ? 'status-pill--danger' : available(stock) <= 5 ? 'status-pill--warn' : 'status-pill--good'">{{ available(stock) }} available</span>
          </button>
          <p *ngIf="stockLoading()" class="muted panel-empty">Loading stock rows...</p>
          <p *ngIf="!stockLoading() && !filteredStock().length" class="muted panel-empty">No stock found for this warehouse.</p>
        </div>
      </article>
    </section>

    <section class="data-panel">
      <div class="panel-head">
        <h2>Movement Ledger</h2>
        <div class="toolbar-row">
          <label class="form-field compact"><input type="date" [ngModel]="fromDate()" (ngModelChange)="fromDate.set($event)"></label>
          <label class="form-field compact"><input type="date" [ngModel]="toDate()" (ngModelChange)="toDate.set($event)"></label>
          <button mat-stroked-button type="button" (click)="loadByDateRange()">Run</button>
          <label class="search-field"><mat-icon fontSet="material-icons-round">search</mat-icon><input [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Search type, product, warehouse, reference"></label>
        </div>
      </div>
      <div class="movement-grid">
        <article *ngFor="let movement of filteredMovements()" class="movement-card">
          <div class="movement-card__top">
            <span class="movement-icon" [ngClass]="typeClass(typeOf(movement))"><mat-icon fontSet="material-icons-round">{{ iconForType(typeOf(movement)) }}</mat-icon></span>
            <span class="status-pill" [ngClass]="typeClass(typeOf(movement))">{{ typeOf(movement) }}</span>
          </div>
          <strong>{{ productName(movement.productId) }}</strong>
          <p>{{ warehouseName(movement.warehouseId) }} · {{ movement.referenceType || 'Manual' }} {{ movement.referenceId || '' }}</p>
          <div class="movement-card__meta">
            <span>{{ movement.quantity }} units</span>
            <span>{{ (movement.createdAt || movement.movementDate) | date:'medium' }}</span>
          </div>
        </article>
        <p *ngIf="loading()" class="muted panel-empty">Loading movements...</p>
        <p *ngIf="!loading() && !filteredMovements().length" class="muted panel-empty">No movements found.</p>
      </div>
    </section>
  `,
  styles: [`
    .movement-hero {
      display: grid;
      grid-template-columns: minmax(16rem, 0.75fr) minmax(0, 1.25fr);
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

    .movement-hero h2 {
      margin: 0.25rem 0;
      font-size: 2rem;
      font-weight: 900;
    }

    .movement-hero p {
      margin: 0;
      color: var(--app-muted);
    }

    .operation-tabs {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
      gap: 0.6rem;
    }

    .operation-tabs button,
    .stock-row,
    .movement-card,
    .operation-summary span {
      border: 1px solid var(--app-border);
      border-radius: 0.5rem;
      background: var(--app-soft);
      color: var(--app-text);
    }

    .operation-tabs button {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.75rem;
      cursor: pointer;
    }

    .operation-tab--active {
      border-color: rgba(37, 120, 232, 0.55) !important;
      background: linear-gradient(135deg, rgba(37, 120, 232, 0.14), rgba(20, 184, 166, 0.10)), var(--app-panel) !important;
    }

    .movement-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(18rem, 0.75fr);
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .operation-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
      padding: 1rem;
    }

    .note-field {
      grid-column: 1 / -1;
    }

    .operation-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
      gap: 0.75rem;
      padding: 0 1rem 1rem;
    }

    .operation-summary span {
      display: grid;
      gap: 0.2rem;
      padding: 0.8rem;
      color: var(--app-muted);
    }

    .operation-summary b {
      color: var(--app-text);
    }

    .compact {
      max-width: 12rem;
    }

    .stock-list,
    .movement-grid {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }

    .stock-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      padding: 0.75rem;
      text-align: left;
      cursor: pointer;
    }

    .stock-row small,
    .movement-card p,
    .movement-card__meta {
      color: var(--app-muted);
    }

    .stock-row__icon,
    .movement-icon {
      display: grid;
      width: 2.35rem;
      height: 2.35rem;
      place-items: center;
      border-radius: 0.5rem;
      color: #fff;
      background: linear-gradient(135deg, #2578e8, #14b8a6);
    }

    .movement-grid {
      grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    }

    .movement-card {
      display: grid;
      gap: 0.7rem;
      padding: 1rem;
    }

    .movement-card__top,
    .movement-card__meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }

    .movement-card p {
      margin: 0;
    }

    .status-pill--danger.movement-icon,
    .status-pill--danger {
      color: #be123c;
    }

    .panel-empty {
      padding: 1rem;
    }

    @media (max-width: 1050px) {
      .movement-hero,
      .movement-layout,
      .operation-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StockMovementsPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly movementsService = inject(MovementService);
  private readonly warehouseService = inject(WarehouseService);
  private readonly productService = inject(ProductService);
  private readonly notifications = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);

  readonly operationTypes: OperationType[] = ['STOCK_IN', 'STOCK_OUT', 'TRANSFER', 'ADJUSTMENT', 'WRITE_OFF', 'RETURN'];
  readonly movements = signal<StockMovement[]>([]);
  readonly warehouses = signal<Warehouse[]>([]);
  readonly products = signal<Product[]>([]);
  readonly selectedStock = signal<StockLevel[]>([]);
  readonly loading = signal(true);
  readonly stockLoading = signal(false);
  readonly saving = signal(false);
  readonly query = signal('');
  readonly stockQuery = signal('');
  readonly fromDate = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  readonly toDate = signal(new Date().toISOString().slice(0, 10));
  operation: { type: OperationType; warehouseId: number; toWarehouseId: number; productId: number; quantity: number; notes: string } = {
    type: 'STOCK_IN',
    warehouseId: 0,
    toWarehouseId: 0,
    productId: 0,
    quantity: 1,
    notes: ''
  };

  readonly productMap = computed(() => new Map(this.products().map((product) => [product.productId, product])));
  readonly warehouseMap = computed(() => new Map(this.warehouses().map((warehouse) => [warehouse.warehouseId, warehouse])));
  readonly activeWarehouses = computed(() => this.warehouses().filter((warehouse) => warehouse.isActive ?? warehouse.active ?? true));
  readonly destinationWarehouses = computed(() => this.activeWarehouses().filter((warehouse) => warehouse.warehouseId !== this.operation.warehouseId));
  readonly selectableProducts = computed(() => {
    if (this.operation.type === 'STOCK_IN' || this.operation.type === 'RETURN') {
      return this.products().filter((product) => product.isActive ?? product.active ?? true);
    }
    const stockedIds = new Set(this.selectedStock().filter((stock) => this.available(stock) > 0).map((stock) => stock.productId));
    return this.products().filter((product) => stockedIds.has(product.productId));
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
  readonly filteredMovements = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.movements().filter((movement) => !term || [
      this.typeOf(movement),
      movement.referenceType,
      String(movement.referenceId ?? ''),
      this.productName(movement.productId),
      this.warehouseName(movement.warehouseId)
    ].some((value) => value?.toLowerCase().includes(term)));
  });
  readonly inboundUnits = computed(() => this.movements().filter((movement) => this.typeOf(movement).includes('IN')).reduce((sum, movement) => sum + movement.quantity, 0));
  readonly outboundUnits = computed(() => this.movements().filter((movement) => this.typeOf(movement).includes('OUT')).reduce((sum, movement) => sum + movement.quantity, 0));

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.query.set(params.get('q') ?? '');
      this.stockQuery.set(params.get('q') ?? '');
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    forkJoin({
      movements: this.movementsService.getAll().pipe(catchError(() => of<StockMovement[]>([]))),
      warehouses: this.warehouseService.getAll().pipe(catchError(() => of<Warehouse[]>([]))),
      products: this.productService.getAll().pipe(catchError(() => of<Product[]>([])))
    }).pipe(finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe(({ movements, warehouses, products }) => {
      this.movements.set(movements);
      this.warehouses.set(warehouses);
      this.products.set(products);
      const nextWarehouse = this.operation.warehouseId || warehouses[0]?.warehouseId || 0;
      this.operation.warehouseId = nextWarehouse;
      if (nextWarehouse) {
        this.loadStock(nextWarehouse);
      }
    });
  }

  setOperation(type: OperationType): void {
    this.operation.type = type;
    this.operation.productId = 0;
    this.operation.toWarehouseId = 0;
  }

  selectWarehouse(warehouseId: number): void {
    this.operation.warehouseId = warehouseId;
    this.operation.productId = 0;
    if (warehouseId) {
      this.loadStock(warehouseId);
    }
  }

  loadStock(warehouseId: number): void {
    this.stockLoading.set(true);
    this.warehouseService.getStockByWarehouse(warehouseId).pipe(
      catchError(() => of<StockLevel[]>([])),
      finalize(() => this.stockLoading.set(false)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((stock) => this.selectedStock.set(stock));
  }

  executeOperation(): void {
    if (!this.operation.warehouseId || !this.operation.productId || !this.operation.quantity) {
      this.notifications.info('Warehouse, product, and quantity are required.');
      return;
    }

    if (this.operation.type === 'TRANSFER') {
      this.transferStock();
      return;
    }

    const delta = this.projectedDelta();
    const existing = this.selectedStock().find((stock) => stock.productId === this.operation.productId);
    if (delta < 0 && existing && Math.abs(delta) > this.available(existing)) {
      this.notifications.info(`Only ${this.available(existing)} units are available.`);
      return;
    }

    this.saving.set(true);
    this.warehouseService.updateStock(this.operation.warehouseId, this.operation.productId, delta).pipe(
      finalize(() => this.saving.set(false)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      this.notifications.success('Stock operation completed.');
      this.resetOperation(false);
      this.loadStock(this.operation.warehouseId);
      this.loadMovements();
    });
  }

  transferStock(): void {
    if (!this.operation.toWarehouseId) {
      this.notifications.info('Destination warehouse is required.');
      return;
    }

    if (this.operation.warehouseId === this.operation.toWarehouseId) {
      this.notifications.info('Choose two different warehouses.');
      return;
    }

    const existing = this.selectedStock().find((stock) => stock.productId === this.operation.productId);
    if (existing && this.operation.quantity > this.available(existing)) {
      this.notifications.info(`Only ${this.available(existing)} units are available.`);
      return;
    }

    this.saving.set(true);
    this.warehouseService.transferStock(this.operation.warehouseId, this.operation.toWarehouseId, this.operation.productId, this.operation.quantity).pipe(
      finalize(() => this.saving.set(false)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      this.notifications.success('Stock transferred.');
      this.resetOperation(false);
      this.loadStock(this.operation.warehouseId);
      this.loadMovements();
    });
  }

  loadMovements(): void {
    this.movementsService.getAll().pipe(catchError(() => of<StockMovement[]>([])), takeUntilDestroyed(this.destroyRef)).subscribe((movements) => this.movements.set(movements));
  }

  loadByDateRange(): void {
    const from = `${this.fromDate()}T00:00:00`;
    const to = `${this.toDate()}T23:59:59`;
    this.loading.set(true);
    this.movementsService.getByDateRange(from, to).pipe(
      catchError(() => of<StockMovement[]>([])),
      finalize(() => this.loading.set(false)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((movements) => this.movements.set(movements));
  }

  exportMovements(): void {
    const rows = [
      ['Movement ID', 'Date', 'Type', 'Product', 'Warehouse', 'Quantity', 'Reference', 'Balance After', 'Notes'],
      ...this.filteredMovements().map((movement) => [
        String(movement.movementId),
        String(movement.createdAt || movement.movementDate || ''),
        this.typeOf(movement),
        this.productName(movement.productId),
        this.warehouseName(movement.warehouseId),
        String(movement.quantity),
        `${movement.referenceType || 'Manual'} ${movement.referenceId || ''}`.trim(),
        String(movement.balanceAfter ?? ''),
        movement.notes ?? ''
      ])
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stockpro-movements-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  resetOperation(resetType = true): void {
    const type = resetType ? 'STOCK_IN' : this.operation.type;
    const warehouseId = this.operation.warehouseId;
    this.operation = { type, warehouseId, toWarehouseId: 0, productId: 0, quantity: 1, notes: '' };
  }

  projectedDelta(): number {
    const quantity = Number(this.operation.quantity || 0);
    return ['STOCK_OUT', 'WRITE_OFF'].includes(this.operation.type) ? -quantity : quantity;
  }

  available(stock: StockLevel): number {
    return stock.availableQuantity ?? Math.max(stock.quantity - (stock.reservedQuantity || 0), 0);
  }

  typeOf(movement: StockMovement): string {
    return movement.movementType || movement.type || 'UNKNOWN';
  }

  typeClass(type: string): string {
    return type.includes('OUT') || type === 'WRITE_OFF' ? 'status-pill--danger' : type.includes('IN') || type === 'RETURN' ? 'status-pill--good' : 'status-pill--warn';
  }

  iconForType(type: string): string {
    if (type.includes('OUT') || type === 'WRITE_OFF') {
      return 'north_east';
    }
    if (type === 'TRANSFER') {
      return 'swap_horiz';
    }
    if (type === 'ADJUSTMENT') {
      return 'tune';
    }
    return 'south_west';
  }

  labelForType(type: string): string {
    return type.replace(/_/g, ' ');
  }

  productName(productId: number): string {
    const product = this.productMap().get(productId);
    return product ? `${product.name} (${product.sku})` : productId ? `Product #${productId}` : 'No product';
  }

  warehouseName(warehouseId: number): string {
    return this.warehouseMap().get(warehouseId)?.name || (warehouseId ? `Warehouse #${warehouseId}` : 'No warehouse');
  }
}
