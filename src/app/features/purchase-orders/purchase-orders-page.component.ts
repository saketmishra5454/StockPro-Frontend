import { CurrencyPipe, DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import { Product, PurchaseOrder, PurchaseOrderLineItem, Supplier, Warehouse } from '@core/models/inventory.models';
import { NotificationService } from '@core/services/notification.service';
import { ProductService } from '@core/services/product.service';
import { PurchaseOrderService } from '@core/services/purchase-order.service';
import { SupplierService } from '@core/services/supplier.service';
import { WarehouseService } from '@core/services/warehouse.service';
import { PageHeaderComponent } from '@shared/ui/page-header/page-header.component';

type POStatusFilter = 'ALL' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED' | 'REJECTED';

@Component({
  selector: 'app-purchase-orders-page',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, MatButtonModule, MatIconModule, NgClass, NgFor, NgIf, PageHeaderComponent],
  template: `
    <app-page-header title="Purchase Orders" description="Build, approve, receive, and monitor purchase orders with clear next actions.">
      <button mat-flat-button color="primary" type="button" (click)="saveOrder()" [disabled]="saving()">
        <mat-icon fontSet="material-icons-round">add</mat-icon>
        {{ editingId ? 'Update PO' : 'Create PO' }}
      </button>
    </app-page-header>

    <section class="po-hero">
      <div>
        <span class="eyebrow">Procurement flow</span>
        <h2>{{ openOrders() }} open orders</h2>
        <p>{{ pendingOrders() }} awaiting approval · {{ approvedOrders() }} ready for receipt · {{ totalValue() | currency:'INR':'symbol':'1.0-0' }} committed.</p>
      </div>
      <div class="stage-row">
        <button *ngFor="let status of statusFilters" type="button" [class.stage-pill--active]="statusFilter() === status" (click)="statusFilter.set(status)">
          <span>{{ status }}</span>
          <strong>{{ countForStatus(status) }}</strong>
        </button>
      </div>
    </section>

    <section class="po-layout">
      <article class="data-panel po-builder">
        <div class="panel-head">
          <h2>{{ editingId ? 'Edit Draft Order' : 'New Purchase Order' }}</h2>
          <button mat-stroked-button type="button" *ngIf="editingId" (click)="clearDraft()">Cancel edit</button>
        </div>

        <form class="builder-grid" (ngSubmit)="saveOrder()">
          <label class="form-field">
            <mat-icon fontSet="material-icons-round">groups</mat-icon>
            <select name="supplierId" [(ngModel)]="draft.supplierId" required>
              <option [ngValue]="0">Select supplier</option>
              <option *ngFor="let supplier of activeSuppliers()" [ngValue]="supplier.supplierId">{{ supplier.name }}</option>
            </select>
          </label>
          <label class="form-field">
            <mat-icon fontSet="material-icons-round">warehouse</mat-icon>
            <select name="warehouseId" [(ngModel)]="draft.warehouseId" required>
              <option [ngValue]="0">Receiving warehouse</option>
              <option *ngFor="let warehouse of activeWarehouses()" [ngValue]="warehouse.warehouseId">{{ warehouse.name }}</option>
            </select>
          </label>
          <label class="form-field">
            <mat-icon fontSet="material-icons-round">event</mat-icon>
            <input name="expectedDate" [(ngModel)]="draft.expectedDate" type="date" placeholder="Expected date">
          </label>
          <label class="form-field">
            <mat-icon fontSet="material-icons-round">tag</mat-icon>
            <input name="referenceNumber" [(ngModel)]="draft.referenceNumber" placeholder="Reference number">
          </label>
          <label class="form-field">
            <mat-icon fontSet="material-icons-round">inventory_2</mat-icon>
            <select name="lineProductId" [(ngModel)]="draftLine.productId" (ngModelChange)="selectDraftProduct($event)">
              <option [ngValue]="0">Line item product</option>
              <option *ngFor="let product of activeProducts()" [ngValue]="product.productId">{{ product.name }} - {{ product.sku }}</option>
            </select>
          </label>
          <label class="form-field">
            <mat-icon fontSet="material-icons-round">pin</mat-icon>
            <input name="lineQuantity" [(ngModel)]="draftLine.quantity" type="number" min="1" placeholder="Quantity">
          </label>
          <label class="form-field">
            <mat-icon fontSet="material-icons-round">currency_rupee</mat-icon>
            <input name="lineUnitCost" [(ngModel)]="draftLine.unitCost" type="number" min="0" placeholder="Unit cost">
          </label>
          <label class="form-field note-field">
            <mat-icon fontSet="material-icons-round">notes</mat-icon>
            <input name="notes" [(ngModel)]="draft.notes" placeholder="Notes">
          </label>
        </form>

        <div class="line-builder-actions">
          <button mat-stroked-button type="button" (click)="addLine()">
            <mat-icon fontSet="material-icons-round">playlist_add</mat-icon>
            Add line
          </button>
          <span class="muted">{{ draftLines.length }} items in this order</span>
        </div>

        <div class="line-list" *ngIf="draftLines.length">
          <div class="line-row" *ngFor="let line of draftLines; let index = index">
            <span>
              <strong>{{ productName(line.productId || 0) }}</strong>
              <small>{{ line.quantity || 0 }} x {{ (line.unitCost || 0) | currency:'INR':'symbol':'1.0-0' }}</small>
            </span>
            <b>{{ ((line.quantity || 0) * (line.unitCost || 0)) | currency:'INR':'symbol':'1.0-0' }}</b>
            <button mat-icon-button type="button" aria-label="Remove line" (click)="removeLine(index)">
              <mat-icon fontSet="material-icons-round">delete</mat-icon>
            </button>
          </div>
        </div>

        <div class="po-preview">
          <span><b>{{ supplierName(draft.supplierId || 0) }}</b> supplier</span>
          <span><b>{{ warehouseName(draft.warehouseId || 0) }}</b> warehouse</span>
          <span><b>{{ draftTotal() | currency:'INR':'symbol':'1.0-0' }}</b> order value</span>
        </div>
      </article>

      <article class="data-panel next-actions">
        <div class="panel-head">
          <h2>Action Queue</h2>
          <label class="search-field compact"><mat-icon fontSet="material-icons-round">search</mat-icon><input [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Search PO"></label>
        </div>
        <div class="queue-list">
          <button *ngFor="let order of priorityOrders()" type="button" class="queue-card" (click)="edit(order)">
            <span class="queue-card__icon" [ngClass]="statusClass(order.status)"><mat-icon fontSet="material-icons-round">{{ iconForStatus(order.status) }}</mat-icon></span>
            <span>
              <strong>#{{ idFor(order) }} - {{ supplierName(order.supplierId) }}</strong>
              <small>{{ order.status }} for {{ warehouseName(order.warehouseId) }}</small>
            </span>
            <span>{{ (order.totalAmount || 0) | currency:'INR':'symbol':'1.0-0' }}</span>
          </button>
          <p *ngIf="!priorityOrders().length" class="muted panel-empty">No urgent order actions.</p>
        </div>
      </article>
    </section>

    <section class="data-panel">
      <div class="panel-head">
        <h2>Order Board</h2>
        <span class="muted">{{ filteredOrders().length }} matching orders</span>
      </div>

      <div class="po-board">
        <article *ngFor="let order of filteredOrders()" class="po-card">
          <div class="po-card__top">
            <span class="status-pill" [ngClass]="statusClass(order.status)">{{ order.status }}</span>
            <strong>#{{ idFor(order) }}</strong>
          </div>
          <h3>{{ supplierName(order.supplierId) }}</h3>
          <p>{{ warehouseName(order.warehouseId) }} - Expected {{ order.expectedDate ? (order.expectedDate | date:'mediumDate') : 'not set' }}</p>
          <div class="po-card__meta">
            <span><mat-icon fontSet="material-icons-round">payments</mat-icon>{{ (order.totalAmount || 0) | currency:'INR':'symbol':'1.0-0' }}</span>
            <span><mat-icon fontSet="material-icons-round">event</mat-icon>{{ order.orderDate | date:'mediumDate' }}</span>
          </div>
          <div class="action-row">
            <button mat-icon-button type="button" aria-label="Edit order" (click)="edit(order)"><mat-icon fontSet="material-icons-round">edit</mat-icon></button>
            <button mat-icon-button type="button" aria-label="Submit order" (click)="submit(order)" [disabled]="order.status !== 'DRAFT'"><mat-icon fontSet="material-icons-round">send</mat-icon></button>
            <button mat-icon-button type="button" aria-label="Approve order" (click)="approve(order)" [disabled]="order.status !== 'PENDING'"><mat-icon fontSet="material-icons-round">done_all</mat-icon></button>
            <button mat-icon-button type="button" aria-label="Receive order" (click)="receive(order)" [disabled]="!['APPROVED','PARTIALLY_RECEIVED'].includes(order.status)"><mat-icon fontSet="material-icons-round">inventory</mat-icon></button>
            <button mat-icon-button type="button" aria-label="Cancel order" (click)="cancel(order)" [disabled]="['RECEIVED','CANCELLED','REJECTED'].includes(order.status)"><mat-icon fontSet="material-icons-round">cancel</mat-icon></button>
          </div>
        </article>
        <p *ngIf="loading()" class="muted panel-empty">Loading purchase orders...</p>
        <p *ngIf="!loading() && !filteredOrders().length" class="muted panel-empty">No purchase orders found.</p>
      </div>
    </section>
  `,
  styles: [`
    .po-hero {
      display: grid;
      grid-template-columns: minmax(16rem, 0.8fr) minmax(0, 1.2fr);
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

    .po-hero h2 {
      margin: 0.25rem 0;
      font-size: 2rem;
      font-weight: 900;
    }

    .po-hero p {
      margin: 0;
      color: var(--app-muted);
    }

    .stage-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(6.8rem, 1fr));
      gap: 0.6rem;
    }

    .stage-row button,
    .queue-card,
    .po-card {
      border: 1px solid var(--app-border);
      border-radius: 0.5rem;
      background: var(--app-soft);
      color: var(--app-text);
    }

    .stage-row button {
      display: grid;
      gap: 0.3rem;
      padding: 0.75rem;
      text-align: left;
      cursor: pointer;
    }

    .stage-row strong {
      font-size: 1.35rem;
      line-height: 1;
    }

    .stage-pill--active {
      border-color: rgba(37, 120, 232, 0.55) !important;
      background: linear-gradient(135deg, rgba(37, 120, 232, 0.14), rgba(20, 184, 166, 0.10)), var(--app-panel) !important;
    }

    .po-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.3fr) minmax(18rem, 0.7fr);
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .builder-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
      padding: 1rem;
    }

    .note-field {
      grid-column: 1 / -1;
    }

    .line-builder-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0 1rem 1rem;
    }

    .line-list {
      display: grid;
      gap: 0.5rem;
      padding: 0 1rem 1rem;
    }

    .line-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      align-items: center;
      gap: 0.75rem;
      border: 1px solid var(--app-border);
      border-radius: 0.5rem;
      background: var(--app-soft);
      padding: 0.65rem 0.75rem;
    }

    .line-row span {
      display: grid;
      gap: 0.2rem;
      min-width: 0;
    }

    .line-row small {
      color: var(--app-muted);
    }

    .po-preview {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.75rem;
      padding: 0 1rem 1rem;
    }

    .po-preview span {
      display: grid;
      gap: 0.2rem;
      border: 1px solid var(--app-border);
      border-radius: 0.5rem;
      background: var(--app-soft);
      padding: 0.8rem;
      color: var(--app-muted);
    }

    .po-preview b {
      color: var(--app-text);
    }

    .compact {
      max-width: 12rem;
    }

    .queue-list,
    .po-board {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }

    .queue-card {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      padding: 0.75rem;
      text-align: left;
      cursor: pointer;
    }

    .queue-card small {
      display: block;
      color: var(--app-muted);
    }

    .queue-card__icon {
      display: grid;
      width: 2.35rem;
      height: 2.35rem;
      place-items: center;
      border-radius: 0.5rem;
      background: rgba(37, 120, 232, 0.12);
      color: #1c61c7;
    }

    .po-board {
      grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
    }

    .po-card {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }

    .po-card__top,
    .po-card__meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }

    .po-card h3 {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 900;
    }

    .po-card p {
      margin: 0;
      color: var(--app-muted);
    }

    .po-card__meta span {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      color: var(--app-muted);
      font-size: 0.85rem;
    }

    .panel-empty {
      padding: 1rem;
    }

    @media (max-width: 1050px) {
      .po-hero,
      .po-layout,
      .builder-grid,
      .po-preview {
        grid-template-columns: 1fr;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PurchaseOrdersPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly ordersService = inject(PurchaseOrderService);
  private readonly supplierService = inject(SupplierService);
  private readonly warehouseService = inject(WarehouseService);
  private readonly productService = inject(ProductService);
  private readonly notifications = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);

  readonly statusFilters: POStatusFilter[] = ['ALL', 'DRAFT', 'PENDING', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED', 'REJECTED'];
  readonly orders = signal<PurchaseOrder[]>([]);
  readonly suppliers = signal<Supplier[]>([]);
  readonly warehouses = signal<Warehouse[]>([]);
  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly statusFilter = signal<POStatusFilter>('ALL');
  readonly query = signal('');
  editingId: number | null = null;
  draft: Partial<PurchaseOrder> = this.emptyDraft();
  draftLine: Partial<PurchaseOrderLineItem> = { productId: 0, quantity: 1, unitCost: 0 };
  draftLines: Partial<PurchaseOrderLineItem>[] = [];

  readonly supplierMap = computed(() => new Map(this.suppliers().map((supplier) => [supplier.supplierId, supplier])));
  readonly warehouseMap = computed(() => new Map(this.warehouses().map((warehouse) => [warehouse.warehouseId, warehouse])));
  readonly activeSuppliers = computed(() => this.suppliers().filter((supplier) => supplier.isActive ?? supplier.active ?? true));
  readonly activeWarehouses = computed(() => this.warehouses().filter((warehouse) => warehouse.isActive ?? warehouse.active ?? true));
  readonly activeProducts = computed(() => this.products().filter((product) => product.isActive ?? product.active ?? true));
  readonly filteredOrders = computed(() => {
    const status = this.statusFilter();
    const term = this.query().trim().toLowerCase();
    return this.orders().filter((order) => {
      const matchesStatus = status === 'ALL' || order.status === status;
      const matchesTerm = !term || [
        String(this.idFor(order)),
        order.referenceNumber,
        order.status,
        this.supplierName(order.supplierId),
        this.warehouseName(order.warehouseId)
      ].some((value) => value?.toLowerCase().includes(term));
      return matchesStatus && matchesTerm;
    });
  });
  readonly priorityOrders = computed(() => this.orders()
    .filter((order) => ['PENDING', 'APPROVED', 'DRAFT'].includes(order.status))
    .slice(0, 5));
  readonly openOrders = computed(() => this.orders().filter((order) => !['RECEIVED', 'CANCELLED', 'REJECTED'].includes(order.status)).length);
  readonly pendingOrders = computed(() => this.orders().filter((order) => order.status === 'PENDING').length);
  readonly approvedOrders = computed(() => this.orders().filter((order) => order.status === 'APPROVED').length);
  readonly totalValue = computed(() => this.orders().reduce((sum, order) => sum + (order.totalAmount || 0), 0));

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.query.set(params.get('q') ?? '');
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    forkJoin({
      orders: this.ordersService.getAll().pipe(catchError(() => of<PurchaseOrder[]>([]))),
      suppliers: this.supplierService.getAll().pipe(catchError(() => of<Supplier[]>([]))),
      warehouses: this.warehouseService.getAll().pipe(catchError(() => of<Warehouse[]>([]))),
      products: this.productService.getAll().pipe(catchError(() => of<Product[]>([])))
    }).pipe(finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe(({ orders, suppliers, warehouses, products }) => {
      this.orders.set(orders);
      this.suppliers.set(suppliers);
      this.warehouses.set(warehouses);
      this.products.set(products);
      if (!this.draft.supplierId && suppliers[0]) {
        this.draft.supplierId = suppliers[0].supplierId;
      }
      if (!this.draft.warehouseId && warehouses[0]) {
        this.draft.warehouseId = warehouses[0].warehouseId;
      }
    });
  }

  saveOrder(): void {
    if (!this.draft.supplierId || !this.draft.warehouseId) {
      this.notifications.info('Supplier and warehouse are required.');
      return;
    }

    const lineItems = this.preparedDraftLines();
    if (!this.editingId && !lineItems.length) {
      this.notifications.info('Add at least one product line before creating the purchase order.');
      return;
    }

    this.saving.set(true);
    const request = this.editingId ? this.ordersService.update(this.editingId, this.draft) : this.ordersService.create(this.draft, lineItems);
    request.pipe(finalize(() => this.saving.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.notifications.success(this.editingId ? 'Purchase order updated.' : 'Purchase order created.');
      this.clearDraft();
      this.load();
    });
  }

  edit(order: PurchaseOrder): void {
    this.editingId = this.idFor(order);
    this.draft = { ...order };
    this.draftLine = { productId: 0, quantity: 1, unitCost: 0 };
    this.draftLines = [];
  }

  clearDraft(): void {
    this.editingId = null;
    this.draft = this.emptyDraft();
    this.draftLine = { productId: 0, quantity: 1, unitCost: 0 };
    this.draftLines = [];
  }

  submit(order: PurchaseOrder): void { this.lifecycle(order, 'submit'); }
  approve(order: PurchaseOrder): void { this.lifecycle(order, 'approve'); }
  receive(order: PurchaseOrder): void {
    const poId = this.idFor(order);
    this.ordersService.getLineItems(poId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((lines) => {
      const receivedItems = lines
        .map((line) => {
          const quantity = line.quantity ?? line.orderedQuantity ?? 0;
          const receivedQty = line.receivedQty ?? line.receivedQuantity ?? 0;
          return {
            productId: line.productId,
            receivedQty: Math.max(quantity - receivedQty, 0)
          };
        })
        .filter((line) => line.receivedQty > 0);

      if (!receivedItems.length) {
        this.notifications.info('This purchase order has no remaining quantity to receive.');
        return;
      }

      this.ordersService.receive(poId, receivedItems).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        this.notifications.success('Order received and stock updated.');
        this.load();
      });
    });
  }
  cancel(order: PurchaseOrder): void { this.ordersService.cancel(this.idFor(order), 'Cancelled from StockPro UI').pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => { this.notifications.success('Order cancelled.'); this.load(); }); }

  lifecycle(order: PurchaseOrder, action: 'submit' | 'approve'): void {
    this.ordersService[action](this.idFor(order)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.notifications.success(`Order ${action} complete.`);
      this.load();
    });
  }

  idFor(order: PurchaseOrder): number {
    return Number(order.poId ?? order.purchaseOrderId ?? 0);
  }

  countForStatus(status: POStatusFilter): number {
    return status === 'ALL' ? this.orders().length : this.orders().filter((order) => order.status === status).length;
  }

  supplierName(id: number): string {
    return this.supplierMap().get(id)?.name || (id ? `Supplier #${id}` : 'No supplier');
  }

  warehouseName(id: number): string {
    return this.warehouseMap().get(id)?.name || (id ? `Warehouse #${id}` : 'No warehouse');
  }

  productName(id: number): string {
    const product = this.products().find((item) => item.productId === id);
    return product ? `${product.name} (${product.sku})` : (id ? `Product #${id}` : 'No product');
  }

  selectDraftProduct(productId: number): void {
    const product = this.products().find((item) => item.productId === Number(productId));
    if (product && !this.draftLine.unitCost) {
      this.draftLine.unitCost = product.costPrice || 0;
    }
  }

  addLine(): void {
    if (!this.isDraftLineComplete()) {
      this.notifications.info('Choose a product, quantity, and unit cost for the line.');
      return;
    }

    this.draftLines = [...this.draftLines, this.normalizedDraftLine()];
    this.draftLine = { productId: 0, quantity: 1, unitCost: 0 };
  }

  removeLine(index: number): void {
    this.draftLines = this.draftLines.filter((_, itemIndex) => itemIndex !== index);
  }

  draftTotal(): number {
    const savedLinesTotal = this.draftLines.reduce((sum, line) => sum + ((line.quantity || 0) * (line.unitCost || 0)), 0);
    const currentLineTotal = this.isDraftLineComplete() ? ((this.draftLine.quantity || 0) * (this.draftLine.unitCost || 0)) : 0;
    return savedLinesTotal + currentLineTotal;
  }

  statusClass(status: string): string {
    return ['APPROVED', 'RECEIVED'].includes(status) ? 'status-pill--good' : ['REJECTED', 'CANCELLED'].includes(status) ? 'status-pill--danger' : 'status-pill--warn';
  }

  iconForStatus(status: string): string {
    return status === 'PENDING' ? 'approval' : status === 'APPROVED' ? 'inventory' : status === 'DRAFT' ? 'edit_note' : 'receipt_long';
  }

  private emptyDraft(): Partial<PurchaseOrder> {
    return { supplierId: 0, warehouseId: 0, status: 'DRAFT', totalAmount: 0 };
  }

  private preparedDraftLines(): Partial<PurchaseOrderLineItem>[] {
    const lines = [...this.draftLines];
    if (this.isDraftLineComplete()) {
      lines.push(this.normalizedDraftLine());
    }
    return lines;
  }

  private isDraftLineComplete(): boolean {
    return Boolean(this.draftLine.productId && Number(this.draftLine.quantity) > 0 && Number(this.draftLine.unitCost) >= 0);
  }

  private normalizedDraftLine(): Partial<PurchaseOrderLineItem> {
    return {
      productId: Number(this.draftLine.productId),
      quantity: Number(this.draftLine.quantity),
      unitCost: Number(this.draftLine.unitCost || 0),
      receivedQty: 0
    };
  }
}
