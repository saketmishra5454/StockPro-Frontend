import { CurrencyPipe, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { catchError, forkJoin, of } from 'rxjs';
import { ProductMovementSummary, StockValueSummary } from '@core/models/inventory.models';
import { NotificationService } from '@core/services/notification.service';
import { ReportService } from '@core/services/report.service';
import { PageHeaderComponent } from '@shared/ui/page-header/page-header.component';

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, MatButtonModule, MatIconModule, NgFor, NgIf, PageHeaderComponent],
  template: `
    <app-page-header title="Reports & Analytics" description="Live valuation, low-stock risk, product velocity, dead stock, and purchase summaries from reporting APIs.">
      <button mat-flat-button color="primary" type="button" (click)="snapshotAll()">
        <mat-icon fontSet="material-icons-round">camera</mat-icon>
        Snapshot all
      </button>
    </app-page-header>

    <section class="module-grid module-grid--cards mb-4">
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">payments</mat-icon></span><span class="metric-card__label">Total Stock Value</span><strong class="metric-card__value">{{ (stockValue()?.totalStockValue || 0) | currency:'INR':'symbol':'1.0-0' }}</strong></article>
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">warning</mat-icon></span><span class="metric-card__label">Low Stock Rows</span><strong class="metric-card__value">{{ lowStock().length }}</strong></article>
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">trending_up</mat-icon></span><span class="metric-card__label">Top Movers</span><strong class="metric-card__value">{{ topMoving().length }}</strong></article>
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">inventory_2</mat-icon></span><span class="metric-card__label">Dead Stock</span><strong class="metric-card__value">{{ deadStock().length }}</strong></article>
    </section>

    <section class="module-grid" style="grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr));">
      <article class="data-panel">
        <div class="panel-head"><h2>Top Moving Products</h2></div>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Product</th><th>Moved</th></tr></thead><tbody>
          <tr *ngFor="let row of topMoving()"><td>{{ row.productName || row.sku || ('Product ' + row.productId) }}</td><td>{{ row.totalMoved || row.totalQuantity || row.movementCount || 0 }}</td></tr>
          <tr *ngIf="!topMoving().length"><td colspan="2" class="muted">No movement data yet.</td></tr>
        </tbody></table></div>
      </article>

      <article class="data-panel">
        <div class="panel-head"><h2>Slow Moving Products</h2></div>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Product</th><th>Moved</th></tr></thead><tbody>
          <tr *ngFor="let row of slowMoving()"><td>{{ row.productName || row.sku || ('Product ' + row.productId) }}</td><td>{{ row.totalMoved || row.totalQuantity || row.movementCount || 0 }}</td></tr>
          <tr *ngIf="!slowMoving().length"><td colspan="2" class="muted">No slow movers found.</td></tr>
        </tbody></table></div>
      </article>
    </section>

    <section class="data-panel mt-4">
      <div class="panel-head">
        <h2>Purchase Summary</h2>
        <div class="toolbar-row">
          <label class="form-field"><input type="date" [ngModel]="from()" (ngModelChange)="from.set($event)"></label>
          <label class="form-field"><input type="date" [ngModel]="to()" (ngModelChange)="to.set($event)"></label>
          <button mat-stroked-button type="button" (click)="loadPoSummary()">Run</button>
        </div>
      </div>
      <pre class="m-0 overflow-auto p-4 text-sm text-[var(--app-text)]">{{ poSummaryText() }}</pre>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReportsPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly reports = inject(ReportService);
  private readonly notifications = inject(NotificationService);

  readonly stockValue = signal<StockValueSummary | null>(null);
  readonly lowStock = signal<Array<Record<string, unknown>>>([]);
  readonly deadStock = signal<Array<Record<string, unknown>>>([]);
  readonly topMoving = signal<ProductMovementSummary[]>([]);
  readonly slowMoving = signal<ProductMovementSummary[]>([]);
  readonly poSummaryText = signal('Run a date range to view purchase summary.');
  readonly from = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  readonly to = signal(new Date().toISOString().slice(0, 10));

  constructor() {
    forkJoin({
      stockValue: this.reports.getTotalStockValue().pipe(catchError(() => of(null))),
      lowStock: this.reports.getLowStockReport().pipe(catchError(() => of([]))),
      deadStock: this.reports.getDeadStock().pipe(catchError(() => of([]))),
      topMoving: this.reports.getTopMoving(8).pipe(catchError(() => of([]))),
      slowMoving: this.reports.getSlowMoving(8).pipe(catchError(() => of([])))
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((data) => {
      this.stockValue.set(data.stockValue);
      this.lowStock.set(data.lowStock);
      this.deadStock.set(data.deadStock);
      this.topMoving.set(data.topMoving);
      this.slowMoving.set(data.slowMoving);
    });
  }

  loadPoSummary(): void {
    this.reports.getPOSummary(this.from(), this.to()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((summary) => {
      this.poSummaryText.set(JSON.stringify(summary, null, 2));
    });
  }

  snapshotAll(): void {
    this.reports.takeSnapshotAll().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.notifications.success('Snapshots triggered for all warehouses.'));
  }
}
