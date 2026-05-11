import { DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { catchError, finalize, of } from 'rxjs';
import { StockMovement } from '@core/models/inventory.models';
import { MovementService } from '@core/services/movement.service';
import { NotificationService } from '@core/services/notification.service';
import { PageHeaderComponent } from '@shared/ui/page-header/page-header.component';

@Component({
  selector: 'app-stock-movements-page',
  standalone: true,
  imports: [DatePipe, FormsModule, MatButtonModule, MatIconModule, NgClass, NgFor, NgIf, PageHeaderComponent],
  template: `
    <app-page-header title="Stock Movements" description="Record and audit inbound, outbound, transfer, and adjustment movements.">
      <button mat-flat-button color="primary" type="button" (click)="record()" [disabled]="saving()">
        <mat-icon fontSet="material-icons-round">sync_alt</mat-icon>
        Record movement
      </button>
    </app-page-header>

    <section class="module-grid module-grid--cards mb-4">
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">timeline</mat-icon></span><span class="metric-card__label">Audit Rows</span><strong class="metric-card__value">{{ movements().length }}</strong></article>
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">south_west</mat-icon></span><span class="metric-card__label">Inbound Units</span><strong class="metric-card__value">{{ inboundUnits() }}</strong></article>
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">north_east</mat-icon></span><span class="metric-card__label">Outbound Units</span><strong class="metric-card__value">{{ outboundUnits() }}</strong></article>
    </section>

    <section class="data-panel">
      <div class="panel-head">
        <h2>Movement Ledger</h2>
        <label class="search-field"><mat-icon fontSet="material-icons-round">search</mat-icon><input [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Filter by type or reference"></label>
      </div>
      <form class="form-grid" (ngSubmit)="record()">
        <label class="form-field"><input name="productId" [(ngModel)]="draft.productId" type="number" min="1" placeholder="Product ID" required></label>
        <label class="form-field"><input name="warehouseId" [(ngModel)]="draft.warehouseId" type="number" min="1" placeholder="Warehouse ID" required></label>
        <label class="form-field"><select name="movementType" [(ngModel)]="draft.movementType"><option>STOCK_IN</option><option>STOCK_OUT</option><option>TRANSFER</option><option>ADJUSTMENT</option></select></label>
        <label class="form-field"><input name="quantity" [(ngModel)]="draft.quantity" type="number" min="1" placeholder="Quantity" required></label>
        <label class="form-field"><input name="referenceType" [(ngModel)]="draft.referenceType" placeholder="Reference type"></label>
        <label class="form-field"><input name="referenceId" [(ngModel)]="draft.referenceId" type="number" min="0" placeholder="Reference ID"></label>
      </form>

      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Movement</th><th>Product</th><th>Warehouse</th><th>Type</th><th>Quantity</th><th>Reference</th><th>Date</th></tr></thead>
          <tbody>
            <tr *ngFor="let movement of filteredMovements()">
              <td><strong>#{{ movement.movementId }}</strong></td>
              <td>#{{ movement.productId }}</td>
              <td>#{{ movement.warehouseId }}</td>
              <td><span class="status-pill" [ngClass]="typeClass(typeOf(movement))">{{ typeOf(movement) }}</span></td>
              <td>{{ movement.quantity }}</td>
              <td>{{ movement.referenceType || 'Manual' }} {{ movement.referenceId || '' }}</td>
              <td>{{ (movement.createdAt || movement.movementDate) | date:'medium' }}</td>
            </tr>
            <tr *ngIf="loading()"><td colspan="7" class="muted">Loading movements...</td></tr>
            <tr *ngIf="!loading() && !filteredMovements().length"><td colspan="7" class="muted">No movements found.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StockMovementsPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly movementsService = inject(MovementService);
  private readonly notifications = inject(NotificationService);

  readonly movements = signal<StockMovement[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly query = signal('');
  draft: Partial<StockMovement> = { productId: 1, warehouseId: 1, movementType: 'STOCK_IN', quantity: 1, referenceType: 'MANUAL' };

  readonly filteredMovements = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.movements().filter((movement) => !term || [this.typeOf(movement), movement.referenceType].some((value) => value?.toLowerCase().includes(term)));
  });
  readonly inboundUnits = computed(() => this.movements().filter((movement) => this.typeOf(movement).includes('IN')).reduce((sum, movement) => sum + movement.quantity, 0));
  readonly outboundUnits = computed(() => this.movements().filter((movement) => this.typeOf(movement).includes('OUT')).reduce((sum, movement) => sum + movement.quantity, 0));

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.movementsService.getAll().pipe(catchError(() => of<StockMovement[]>([])), finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe((movements) => this.movements.set(movements));
  }

  record(): void {
    if (!this.draft.productId || !this.draft.warehouseId || !this.draft.quantity) {
      this.notifications.info('Product, warehouse, and quantity are required.');
      return;
    }

    this.saving.set(true);
    this.movementsService.record(this.draft).pipe(finalize(() => this.saving.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.notifications.success('Movement recorded.');
      this.draft = { productId: 1, warehouseId: 1, movementType: 'STOCK_IN', quantity: 1, referenceType: 'MANUAL' };
      this.load();
    });
  }

  typeOf(movement: StockMovement): string {
    return movement.movementType || movement.type || 'UNKNOWN';
  }

  typeClass(type: string): string {
    return type.includes('OUT') ? 'status-pill--danger' : type.includes('IN') ? 'status-pill--good' : 'status-pill--warn';
  }
}
