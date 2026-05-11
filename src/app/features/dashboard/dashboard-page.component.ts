import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { catchError, forkJoin, map, of } from 'rxjs';
import { Alert, Product, PurchaseOrder, StockLevel, StockMovement, StockValueSummary, Supplier, Warehouse } from '@core/models/inventory.models';
import { AlertService } from '@core/services/alert.service';
import { AuthService } from '@core/services/auth.service';
import { ProductService } from '@core/services/product.service';
import { PurchaseOrderService } from '@core/services/purchase-order.service';
import { ReportService } from '@core/services/report.service';
import { MovementService } from '@core/services/movement.service';
import { SupplierService } from '@core/services/supplier.service';
import { WarehouseService } from '@core/services/warehouse.service';
import { PageHeaderComponent } from '@shared/ui/page-header/page-header.component';

interface KpiCard {
  label: string;
  value: string;
  trend: string;
  icon: string;
  tone: 'blue' | 'teal' | 'amber' | 'rose';
  detail: string;
}

interface AlertItem {
  title: string;
  description: string;
  time: string;
  severity: 'critical' | 'warning' | 'info';
  icon: string;
}

interface LowStockItem {
  sku: string;
  product: string;
  warehouse: string;
  available: number;
  reorderPoint: number;
  status: 'Critical' | 'Low' | 'Watch';
}

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    NgClass,
    BaseChartDirective,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
    PageHeaderComponent
  ],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private readonly products = inject(ProductService);
  private readonly warehouses = inject(WarehouseService);
  private readonly purchaseOrders = inject(PurchaseOrderService);
  private readonly suppliers = inject(SupplierService);
  private readonly movements = inject(MovementService);
  private readonly alerts = inject(AlertService);
  private readonly reports = inject(ReportService);

  readonly lowStockColumns = ['product', 'warehouse', 'available', 'reorderPoint', 'status', 'action'];
  readonly dataSource = signal<'backend' | 'empty'>('empty');

  readonly kpis = signal<KpiCard[]>([
    {
      label: 'Inventory Value',
      value: '₹0',
      trend: 'Waiting for report data',
      icon: 'payments',
      tone: 'blue',
      detail: 'Across all warehouses'
    },
    {
      label: 'Active SKUs',
      value: '0',
      trend: '0 active',
      icon: 'inventory_2',
      tone: 'teal',
      detail: 'Catalog health stable'
    },
    {
      label: 'Low Stock',
      value: '0',
      trend: 'Healthy',
      icon: 'warning',
      tone: 'amber',
      detail: 'Requires replenishment'
    },
    {
      label: 'Open POs',
      value: '0',
      trend: '0 active suppliers',
      icon: 'receipt_long',
      tone: 'rose',
      detail: '5 awaiting approval'
    }
  ]);

  readonly stockValueChartData = signal<ChartConfiguration<'line'>['data']>({
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'],
    datasets: [
      {
        label: 'Stock Value',
        data: [0, 0, 0, 0, 0, 0, 0],
        borderColor: '#2578e8',
        backgroundColor: 'rgba(37, 120, 232, 0.14)',
        pointBackgroundColor: '#2578e8',
        pointBorderColor: '#ffffff',
        pointHoverRadius: 6,
        pointRadius: 4,
        tension: 0.42,
        fill: true
      },
      {
        label: 'Committed PO Value',
        data: [0, 0, 0, 0, 0, 0, 0],
        borderColor: '#14b8a6',
        backgroundColor: 'rgba(20, 184, 166, 0.10)',
        pointBackgroundColor: '#14b8a6',
        pointBorderColor: '#ffffff',
        pointHoverRadius: 6,
        pointRadius: 4,
        tension: 0.42,
        fill: true
      }
    ]
  });

  readonly stockValueChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index'
    },
    plugins: {
      legend: {
        display: true,
        labels: {
          usePointStyle: true,
          boxWidth: 8,
          boxHeight: 8
        }
      },
      tooltip: {
        callbacks: {
          label: (context) => `${context.dataset.label}: ${new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
          }).format(Number(context.raw))}`
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        }
      },
      y: {
        ticks: {
          callback: (value) => `₹${Number(value) / 1000}k`
        },
        border: {
          display: false
        },
        grid: {
          color: 'rgba(148, 163, 184, 0.18)'
        }
      }
    }
  };

  readonly categoryChartData = signal<ChartConfiguration<'doughnut'>['data']>({
    labels: ['No catalog data'],
    datasets: [
      {
        data: [1],
        backgroundColor: ['#2578e8', '#14b8a6', '#f59e0b', '#e11d48'],
        borderColor: 'rgba(255,255,255,0.72)',
        borderWidth: 3,
        hoverOffset: 8
      }
    ]
  });

  readonly categoryChartOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          usePointStyle: true,
          boxWidth: 8,
          boxHeight: 8,
          padding: 18
        }
      }
    }
  };

  readonly recentAlerts = signal<AlertItem[]>([]);
  readonly lowStockItems = signal<LowStockItem[]>([]);

  constructor() {
    const userId = this.auth.currentUser?.id ?? 1;

    forkJoin({
      products: this.products.getAll().pipe(catchError(() => of<Product[]>([]))),
      lowProducts: this.products.getLowStock().pipe(catchError(() => of<Product[]>([]))),
      warehouses: this.warehouses.getAll().pipe(catchError(() => of<Warehouse[]>([]))),
      lowStock: this.warehouses.getLowStock().pipe(catchError(() => of<StockLevel[]>([]))),
      purchaseOrders: this.purchaseOrders.getAll().pipe(catchError(() => of<PurchaseOrder[]>([]))),
      suppliers: this.suppliers.getActive().pipe(catchError(() => of<Supplier[]>([]))),
      movements: this.movements.getAll().pipe(catchError(() => of<StockMovement[]>([]))),
      alerts: this.alerts.getUnacknowledged(userId).pipe(catchError(() => of<Alert[]>([]))),
      stockValue: this.reports.getTotalStockValue().pipe(catchError(() => of<StockValueSummary | null>(null)))
    }).pipe(
      map((data) => this.toDashboardState(data)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((state) => {
      this.dataSource.set(state.hasBackendData ? 'backend' : 'empty');
      this.kpis.set(state.kpis);
      this.recentAlerts.set(state.alerts);
      this.lowStockItems.set(state.lowStockItems);
      this.stockValueChartData.set(state.chartData);
      this.categoryChartData.set(state.categoryChartData);
    });
  }

  stockRatio(item: LowStockItem): number {
    return Math.min(Math.round((item.available / item.reorderPoint) * 100), 100);
  }

  severityClass(severity: AlertItem['severity']): string {
    return {
      critical: 'alert--critical',
      warning: 'alert--warning',
      info: 'alert--info'
    }[severity];
  }

  statusClass(status: LowStockItem['status']): string {
    return {
      Critical: 'status--critical',
      Low: 'status--low',
      Watch: 'status--watch'
    }[status];
  }

  private toDashboardState(data: {
    products: Product[];
    lowProducts: Product[];
    warehouses: Warehouse[];
    lowStock: StockLevel[];
    purchaseOrders: PurchaseOrder[];
    suppliers: Supplier[];
    movements: StockMovement[];
    alerts: Alert[];
    stockValue: StockValueSummary | null;
  }): {
    hasBackendData: boolean;
    kpis: KpiCard[];
    alerts: AlertItem[];
    lowStockItems: LowStockItem[];
    chartData: ChartConfiguration<'line'>['data'];
    categoryChartData: ChartConfiguration<'doughnut'>['data'];
  } {
    const inventoryValue = data.stockValue?.totalStockValue ?? this.estimateInventoryValue(data.products);
    const lowStockCount = Math.max(data.lowProducts.length, data.lowStock.length);
    const openPurchaseOrders = data.purchaseOrders.filter((po) => !['RECEIVED', 'CANCELLED', 'REJECTED'].includes(po.status)).length;
    const committedPoValue = data.purchaseOrders
      .filter((po) => !['RECEIVED', 'CANCELLED', 'REJECTED'].includes(po.status))
      .reduce((sum, po) => sum + (po.totalAmount || 0), 0);
    const hasBackendData = Boolean(
      data.products.length ||
      data.warehouses.length ||
      data.purchaseOrders.length ||
      data.suppliers.length ||
      data.movements.length ||
      data.alerts.length ||
      data.stockValue
    );

    return {
      hasBackendData,
      kpis: [
        {
          label: 'Inventory Value',
          value: this.currency(inventoryValue, data.stockValue?.currency ?? 'INR'),
          trend: data.stockValue ? `Live as of ${data.stockValue.asOf}` : 'Estimated from catalog',
          icon: 'payments',
          tone: 'blue',
          detail: 'Across all warehouses'
        },
        {
          label: 'Active SKUs',
          value: new Intl.NumberFormat('en-US').format(data.products.length),
          trend: `${data.products.filter((product) => product.isActive ?? product.active ?? true).length} active`,
          icon: 'inventory_2',
          tone: 'teal',
          detail: 'Backend catalog'
        },
        {
          label: 'Low Stock',
          value: String(lowStockCount),
          trend: lowStockCount > 0 ? 'Needs review' : 'Healthy',
          icon: 'warning',
          tone: 'amber',
          detail: 'Products and stock levels'
        },
        {
          label: 'Open POs',
          value: String(openPurchaseOrders),
          trend: `${data.suppliers.length} active suppliers`,
          icon: 'receipt_long',
          tone: 'rose',
          detail: `${data.movements.length} stock movements`
        }
      ],
      alerts: data.alerts.slice(0, 3).map((alert) => ({
        title: alert.title,
        description: alert.message ?? alert.type,
        time: this.relativeDate(alert.createdAt),
        severity: this.alertSeverity(alert.severity),
        icon: alert.severity === 'CRITICAL' ? 'priority_high' : alert.severity === 'WARNING' ? 'approval' : 'info'
      })),
      lowStockItems: this.lowStockFromBackend(data.lowProducts, data.lowStock, data.products, data.warehouses),
      chartData: {
        ...this.stockValueChartData(),
        datasets: this.stockValueChartData().datasets.map((dataset, index) => ({
          ...dataset,
          data: index === 0
            ? this.trendFromValue(inventoryValue)
            : this.trendFromValue(committedPoValue)
        }))
      },
      categoryChartData: this.categoryDataFromProducts(data.products)
    };
  }

  private lowStockFromBackend(lowProducts: Product[], stock: StockLevel[], products: Product[], warehouses: Warehouse[]): LowStockItem[] {
    const productMap = new Map(products.map((product) => [product.productId, product]));
    const lowProductRows = lowProducts.slice(0, 6).map((product) => ({
      sku: product.sku,
      product: product.name,
      warehouse: 'All warehouses',
      available: 0,
      reorderPoint: Math.max(product.reorderLevel, 1),
      status: 'Critical' as const
    }));

    const stockRows = stock.slice(0, 6).map((item) => {
      const product = productMap.get(item.productId);
      const warehouse = warehouses.find((entry) => entry.warehouseId === item.warehouseId);
      const available = item.availableQuantity ?? item.quantity - item.reservedQuantity;
      const reorderPoint = Math.max(product?.reorderLevel ?? item.quantity + item.reservedQuantity, 1);

      return {
        sku: product?.sku ?? `PID-${item.productId}`,
        product: product?.name ?? `Product ${item.productId}`,
        warehouse: warehouse?.name ?? `Warehouse ${item.warehouseId}`,
        available,
        reorderPoint,
        status: available <= reorderPoint * 0.25 ? 'Critical' as const : available <= reorderPoint ? 'Low' as const : 'Watch' as const
      };
    });

    return [...stockRows, ...lowProductRows].slice(0, 6);
  }

  private estimateInventoryValue(products: Product[]): number {
    return products.reduce((total, product) => total + product.costPrice * Math.max(product.reorderLevel, 1), 0);
  }

  private currency(value: number, currency: string): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(value);
  }

  private trendFromValue(value: number): number[] {
    const base = Math.max(value, 0);
    return [0.62, 0.68, 0.74, 0.71, 0.83, 0.91, 1].map((ratio) => Math.round(base * ratio));
  }

  private categoryDataFromProducts(products: Product[]): ChartConfiguration<'doughnut'>['data'] {
    const counts = products.reduce((acc, product) => {
      const key = product.category || 'Uncategorized';
      acc.set(key, (acc.get(key) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());

    if (!counts.size) {
      return {
        labels: ['No catalog data'],
        datasets: [{ data: [1], backgroundColor: ['rgba(148, 163, 184, 0.35)'], borderColor: 'rgba(255,255,255,0.72)', borderWidth: 3 }]
      };
    }

    return {
      labels: [...counts.keys()],
      datasets: [{
        data: [...counts.values()],
        backgroundColor: ['#2578e8', '#14b8a6', '#f59e0b', '#e11d48', '#7c3aed', '#0f766e'],
        borderColor: 'rgba(255,255,255,0.72)',
        borderWidth: 3,
        hoverOffset: 8
      }]
    };
  }

  private alertSeverity(severity: string): AlertItem['severity'] {
    if (severity === 'CRITICAL') {
      return 'critical';
    }

    if (severity === 'WARNING') {
      return 'warning';
    }

    return 'info';
  }

  private relativeDate(date?: string): string {
    if (!date) {
      return 'Just now';
    }

    const diffMs = Date.now() - new Date(date).getTime();
    const minutes = Math.max(Math.floor(diffMs / 60000), 0);

    if (minutes < 60) {
      return `${minutes || 1} min ago`;
    }

    return `${Math.floor(minutes / 60)} hr ago`;
  }
}
