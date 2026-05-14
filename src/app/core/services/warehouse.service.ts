import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { StockLevel, Warehouse } from '../models/inventory.models';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class WarehouseService {
  private readonly api = inject(ApiService);

  getAll(): Observable<Warehouse[]> {
    return this.api.get<Warehouse[]>('/warehouses', undefined, { silentErrors: true });
  }

  getLowStock(): Observable<StockLevel[]> {
    return this.api.get<StockLevel[]>('/stock/low', undefined, { silentErrors: true });
  }

  getStockByWarehouse(warehouseId: number): Observable<StockLevel[]> {
    return this.api.get<StockLevel[]>(`/stock/warehouse/${warehouseId}`);
  }

  create(warehouse: Partial<Warehouse>): Observable<Warehouse> {
    return this.api.post<Warehouse>('/warehouses', warehouse);
  }

  update(id: number, warehouse: Partial<Warehouse>): Observable<Warehouse> {
    return this.api.put<Warehouse>(`/warehouses/${id}`, warehouse);
  }

  deactivate(id: number): Observable<Record<string, string>> {
    return this.api.put<Record<string, string>>(`/warehouses/deactivate/${id}`, {});
  }

  activate(id: number): Observable<Record<string, string>> {
    return this.api.put<Record<string, string>>(`/warehouses/activate/${id}`, {});
  }

  initializeStock(warehouseId: number, productId: number, initialQuantity: number): Observable<StockLevel> {
    return this.api.post<StockLevel>(
      `/stock/initialize?warehouseId=${warehouseId}&productId=${productId}&initialQuantity=${initialQuantity}`,
      null
    );
  }

  updateStock(warehouseId: number, productId: number, delta: number): Observable<StockLevel> {
    return this.api.put<StockLevel>(
      `/stock/update?warehouseId=${warehouseId}&productId=${productId}&delta=${delta}`,
      null
    );
  }

  reserveStock(warehouseId: number, productId: number, quantity: number): Observable<StockLevel> {
    return this.api.post<StockLevel>(
      `/stock/reserve?warehouseId=${warehouseId}&productId=${productId}&quantity=${quantity}`,
      null
    );
  }

  releaseReservation(warehouseId: number, productId: number, quantity: number): Observable<StockLevel> {
    return this.api.post<StockLevel>(
      `/stock/release?warehouseId=${warehouseId}&productId=${productId}&quantity=${quantity}`,
      null
    );
  }

  transferStock(fromWarehouseId: number, toWarehouseId: number, productId: number, quantity: number): Observable<Record<string, string>> {
    return this.api.post<Record<string, string>>('/stock/transfer', {
      fromWarehouseId,
      toWarehouseId,
      productId,
      quantity
    });
  }
}
