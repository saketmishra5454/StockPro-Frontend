import { CurrencyPipe, DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { catchError, finalize, of } from 'rxjs';
import { PurchaseOrder, PurchaseOrderLineItem } from '@core/models/inventory.models';
import { NotificationService } from '@core/services/notification.service';
import { PurchaseOrderService } from '@core/services/purchase-order.service';
import { PageHeaderComponent } from '@shared/ui/page-header/page-header.component';

@Component({
  selector: 'app-purchase-orders-page',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, MatButtonModule, MatIconModule, NgClass, NgFor, NgIf, PageHeaderComponent],
  template: `
    <app-page-header title="Purchase Orders" description="Create orders, follow approval status, and move cleanly through submit, approve, receive, and cancel states.">
      <button mat-flat-button color="primary" type="button" (click)="saveOrder()" [disabled]="saving()">
        <mat-icon fontSet="material-icons-round">add</mat-icon>
        Add PO
      </button>
    </app-page-header>

    <section class="module-grid module-grid--cards mb-4">
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">receipt_long</mat-icon></span><span class="metric-card__label">Orders</span><strong class="metric-card__value">{{ orders().length }}</strong></article>
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">pending_actions</mat-icon></span><span class="metric-card__label">Open</span><strong class="metric-card__value">{{ openOrders() }}</strong></article>
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">payments</mat-icon></span><span class="metric-card__label">Committed Value</span><strong class="metric-card__value">{{ totalValue() | currency:'INR':'symbol':'1.0-0' }}</strong></article>
    </section>

    <section class="data-panel">
      <div class="panel-head">
        <h2>Order Flow</h2>
        <label class="search-field"><mat-icon fontSet="material-icons-round">filter_alt</mat-icon><input [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)" placeholder="Filter by status"></label>
      </div>
      <form class="form-grid" (ngSubmit)="saveOrder()">
        <label class="form-field"><input name="supplierId" [(ngModel)]="draft.supplierId" type="number" min="1" placeholder="Supplier ID" required></label>
        <label class="form-field"><input name="warehouseId" [(ngModel)]="draft.warehouseId" type="number" min="1" placeholder="Warehouse ID" required></label>
        <label class="form-field"><select name="status" [(ngModel)]="draft.status"><option>DRAFT</option><option>PENDING</option><option>APPROVED</option></select></label>
        <label class="form-field"><input name="expectedDate" [(ngModel)]="draft.expectedDate" type="date" placeholder="Expected date"></label>
        <label class="form-field"><input name="totalAmount" [(ngModel)]="draft.totalAmount" type="number" min="0" placeholder="Total amount"></label>
        <label class="form-field"><input name="referenceNumber" [(ngModel)]="draft.referenceNumber" placeholder="Reference number"></label>
        <label class="form-field"><input name="lineProductId" [(ngModel)]="draftLine.productId" type="number" min="1" placeholder="Line product ID"></label>
        <label class="form-field"><input name="lineQuantity" [(ngModel)]="draftLine.quantity" type="number" min="1" placeholder="Line quantity"></label>
        <label class="form-field"><input name="lineUnitCost" [(ngModel)]="draftLine.unitCost" type="number" min="0" placeholder="Line unit cost"></label>
      </form>

      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>PO</th><th>Supplier</th><th>Warehouse</th><th>Status</th><th>Expected</th><th>Total</th><th></th></tr></thead>
          <tbody>
            <tr *ngFor="let order of filteredOrders()">
              <td><strong>#{{ idFor(order) }}</strong><div class="muted text-sm">{{ order.orderDate | date:'mediumDate' }}</div></td>
              <td>#{{ order.supplierId }}</td>
              <td>#{{ order.warehouseId }}</td>
              <td><span class="status-pill" [ngClass]="statusClass(order.status)">{{ order.status }}</span></td>
              <td>{{ order.expectedDate | date:'mediumDate' }}</td>
              <td>{{ (order.totalAmount || 0) | currency:'INR':'symbol':'1.0-0' }}</td>
              <td class="action-row">
                <button mat-icon-button type="button" aria-label="Edit order" (click)="edit(order)"><mat-icon fontSet="material-icons-round">edit</mat-icon></button>
                <button mat-icon-button type="button" aria-label="Submit order" (click)="submit(order)" [disabled]="order.status !== 'DRAFT'"><mat-icon fontSet="material-icons-round">send</mat-icon></button>
                <button mat-icon-button type="button" aria-label="Approve order" (click)="approve(order)" [disabled]="order.status !== 'PENDING'"><mat-icon fontSet="material-icons-round">done_all</mat-icon></button>
                <button mat-icon-button type="button" aria-label="Receive order" (click)="receive(order)" [disabled]="order.status !== 'APPROVED'"><mat-icon fontSet="material-icons-round">inventory</mat-icon></button>
                <button mat-icon-button type="button" aria-label="Cancel order" (click)="cancel(order)" [disabled]="['RECEIVED','CANCELLED','REJECTED'].includes(order.status)"><mat-icon fontSet="material-icons-round">cancel</mat-icon></button>
              </td>
            </tr>
            <tr *ngIf="loading()"><td colspan="7" class="muted">Loading purchase orders...</td></tr>
            <tr *ngIf="!loading() && !filteredOrders().length"><td colspan="7" class="muted">No purchase orders found.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PurchaseOrdersPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly ordersService = inject(PurchaseOrderService);
  private readonly notifications = inject(NotificationService);

  readonly orders = signal<PurchaseOrder[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly statusFilter = signal('');
  editingId: number | null = null;
  draft: Partial<PurchaseOrder> = this.emptyDraft();
  draftLine: Partial<PurchaseOrderLineItem> = { productId: 1, quantity: 1, unitCost: 0 };

  readonly filteredOrders = computed(() => {
    const status = this.statusFilter().trim().toUpperCase();
    return this.orders().filter((order) => !status || order.status.toUpperCase().includes(status));
  });
  readonly openOrders = computed(() => this.orders().filter((order) => !['RECEIVED', 'CANCELLED', 'REJECTED'].includes(order.status)).length);
  readonly totalValue = computed(() => this.orders().reduce((sum, order) => sum + (order.totalAmount || 0), 0));

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.ordersService.getAll().pipe(catchError(() => of<PurchaseOrder[]>([])), finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe((orders) => this.orders.set(orders));
  }

  saveOrder(): void {
    if (!this.draft.supplierId || !this.draft.warehouseId) {
      this.notifications.info('Supplier and warehouse IDs are required.');
      return;
    }

    this.saving.set(true);
    const lineItems = this.draftLine.productId && this.draftLine.quantity ? [this.draftLine] : [];
    const request = this.editingId ? this.ordersService.update(this.editingId, this.draft) : this.ordersService.create(this.draft, lineItems);
    request.pipe(finalize(() => this.saving.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.notifications.success(this.editingId ? 'Purchase order updated.' : 'Purchase order created.');
      this.editingId = null;
      this.draft = this.emptyDraft();
      this.draftLine = { productId: 1, quantity: 1, unitCost: 0 };
      this.load();
    });
  }

  edit(order: PurchaseOrder): void {
    this.editingId = this.idFor(order);
    this.draft = { ...order };
    this.draftLine = { productId: 1, quantity: 1, unitCost: 0 };
  }

  submit(order: PurchaseOrder): void { this.lifecycle(order, 'submit'); }
  approve(order: PurchaseOrder): void { this.lifecycle(order, 'approve'); }
  receive(order: PurchaseOrder): void { this.ordersService.receive(this.idFor(order), []).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => { this.notifications.success('Order marked received.'); this.load(); }); }
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

  statusClass(status: string): string {
    return ['APPROVED', 'RECEIVED'].includes(status) ? 'status-pill--good' : ['REJECTED', 'CANCELLED'].includes(status) ? 'status-pill--danger' : 'status-pill--warn';
  }

  private emptyDraft(): Partial<PurchaseOrder> {
    return { supplierId: 1, warehouseId: 1, status: 'DRAFT', totalAmount: 0 };
  }
}
