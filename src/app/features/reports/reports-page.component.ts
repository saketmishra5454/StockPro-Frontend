import { CurrencyPipe, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
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
      <button mat-stroked-button type="button" (click)="exportCsv()">
        <mat-icon fontSet="material-icons-round">download</mat-icon>
        Export CSV
      </button>
    </app-page-header>

    <section class="module-grid module-grid--cards mb-4">
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">payments</mat-icon></span><span class="metric-card__label">Total Stock Value</span><strong class="metric-card__value">{{ (stockValue()?.totalStockValue || 0) | currency:'INR':'symbol':'1.0-0' }}</strong></article>
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">warning</mat-icon></span><span class="metric-card__label">Low Stock Rows</span><strong class="metric-card__value">{{ lowStock().length }}</strong></article>
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">trending_up</mat-icon></span><span class="metric-card__label">Top Movers</span><strong class="metric-card__value">{{ filteredTopMoving().length }}</strong></article>
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">inventory_2</mat-icon></span><span class="metric-card__label">Dead Stock</span><strong class="metric-card__value">{{ deadStock().length }}</strong></article>
    </section>

    <section class="module-grid" style="grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr));">
      <article class="data-panel">
        <div class="panel-head"><h2>Top Moving Products</h2></div>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Product</th><th>Moved</th></tr></thead><tbody>
          <tr *ngFor="let row of filteredTopMoving()"><td>{{ row.productName || row.sku || ('Product ' + row.productId) }}</td><td>{{ moved(row) }}</td></tr>
          <tr *ngIf="!filteredTopMoving().length"><td colspan="2" class="muted">No movement data yet.</td></tr>
        </tbody></table></div>
      </article>

      <article class="data-panel">
        <div class="panel-head"><h2>Slow Moving Products</h2></div>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Product</th><th>Moved</th></tr></thead><tbody>
          <tr *ngFor="let row of filteredSlowMoving()"><td>{{ row.productName || row.sku || ('Product ' + row.productId) }}</td><td>{{ moved(row) }}</td></tr>
          <tr *ngIf="!filteredSlowMoving().length"><td colspan="2" class="muted">No slow movers found.</td></tr>
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
  private readonly route = inject(ActivatedRoute);

  readonly stockValue = signal<StockValueSummary | null>(null);
  readonly lowStock = signal<Array<Record<string, unknown>>>([]);
  readonly deadStock = signal<Array<Record<string, unknown>>>([]);
  readonly topMoving = signal<ProductMovementSummary[]>([]);
  readonly slowMoving = signal<ProductMovementSummary[]>([]);
  readonly poSummaryText = signal('Run a date range to view purchase summary.');
  readonly query = signal('');
  readonly from = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  readonly to = signal(new Date().toISOString().slice(0, 10));
  readonly filteredTopMoving = computed(() => this.filterMovementRows(this.topMoving()));
  readonly filteredSlowMoving = computed(() => this.filterMovementRows(this.slowMoving()));

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.query.set(params.get('q')?.trim() ?? '');
    });
    this.loadReports();
  }

  loadReports(): void {
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
    this.reports.takeSnapshotAll().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        this.notifications.success(response['message'] ?? 'Snapshots triggered for all warehouses.');
        this.loadReports();
      },
      error: () => this.notifications.error('Snapshot all failed. Check report-service and warehouse-service logs.')
    });
  }

  moved(row: ProductMovementSummary): number {
    return row.totalUnitsMoved ?? row.totalMoved ?? row.totalQuantity ?? row.movementCount ?? 0;
  }

  private filterMovementRows(rows: ProductMovementSummary[]): ProductMovementSummary[] {
    const term = this.query().trim().toLowerCase();

    if (!term || /(report|reports|analytics|valuation|turnover|snapshot|export)/.test(term)) {
      return rows;
    }

    return rows.filter((row) => [
      row.productName,
      row.sku,
      String(row.productId),
      String(this.moved(row))
    ].some((value) => value?.toLowerCase().includes(term)));
  }

  exportCsv(): void {
    const rows = [
      ['Section', 'Product', 'Moved', 'Value'],
      ...this.topMoving().map((row) => ['Top Moving', row.productName ?? row.sku ?? `Product ${row.productId}`, String(this.moved(row)), String(row.totalValue ?? '')]),
      ...this.slowMoving().map((row) => ['Slow Moving', row.productName ?? row.sku ?? `Product ${row.productId}`, String(this.moved(row)), String(row.totalValue ?? '')]),
      ...this.lowStock().map((row) => ['Low Stock', String(row['productName'] ?? `Product ${row['productId']}`), String(row['availableQuantity'] ?? ''), String(row['warehouseId'] ?? '')]),
      ...this.deadStock().map((row) => ['Dead Stock', String(row['productId'] ?? ''), String(row['quantity'] ?? ''), String(row['stockValue'] ?? '')])
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stockpro-reports-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
