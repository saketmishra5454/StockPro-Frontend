import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { InventoryTurnoverSummary, ProductMovementSummary, StockValueSummary, WarehouseStockValue } from '../models/inventory.models';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly api = inject(ApiService);

  getTotalStockValue(): Observable<StockValueSummary> {
    return this.api.get<StockValueSummary>('/reports/stock-value/total', undefined, { silentErrors: true });
  }

  getLowStockReport(): Observable<Array<Record<string, unknown>>> {
    return this.api.get<Array<Record<string, unknown>>>('/reports/low-stock', undefined, { silentErrors: true });
  }

  getStockValueByWarehouse(warehouseId: number): Observable<WarehouseStockValue> {
    return this.api.get<WarehouseStockValue>(`/reports/stock-value/warehouse/${warehouseId}`, undefined, { silentErrors: true });
  }

  getTurnover(warehouseId: number, from: string, to: string): Observable<InventoryTurnoverSummary> {
    return this.api.get<InventoryTurnoverSummary>(`/reports/turnover/${warehouseId}`, { from, to }, { silentErrors: true });
  }

  getTopMoving(limit = 10): Observable<ProductMovementSummary[]> {
    return this.api.get<ProductMovementSummary[]>('/reports/top-moving', { limit }, { silentErrors: true });
  }

  getSlowMoving(limit = 10): Observable<ProductMovementSummary[]> {
    return this.api.get<ProductMovementSummary[]>('/reports/slow-moving', { limit }, { silentErrors: true });
  }

  getDeadStock(): Observable<Array<Record<string, unknown>>> {
    return this.api.get<Array<Record<string, unknown>>>('/reports/dead-stock', undefined, { silentErrors: true });
  }

  getPOSummary(from: string, to: string): Observable<Record<string, unknown>> {
    return this.api.get<Record<string, unknown>>('/reports/po-summary', { from, to }, { silentErrors: true });
  }

  takeSnapshotAll(): Observable<Record<string, string>> {
    return this.api.post<Record<string, string>>('/reports/snapshot/all', {});
  }
}
