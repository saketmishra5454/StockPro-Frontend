import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { StockMovement } from '../models/inventory.models';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class MovementService {
  private readonly api = inject(ApiService);

  getAll(): Observable<StockMovement[]> {
    return this.api.get<StockMovement[]>('/movements/all', undefined, { silentErrors: true });
  }

  record(movement: Partial<StockMovement>): Observable<StockMovement> {
    return this.api.post<StockMovement>('/movements', movement);
  }

  getByProduct(productId: number): Observable<StockMovement[]> {
    return this.api.get<StockMovement[]>(`/movements/product/${productId}`);
  }

  getByWarehouse(warehouseId: number): Observable<StockMovement[]> {
    return this.api.get<StockMovement[]>(`/movements/warehouse/${warehouseId}`);
  }

  getByType(type: string): Observable<StockMovement[]> {
    return this.api.get<StockMovement[]>(`/movements/type/${type}`);
  }

  getByDateRange(from: string, to: string): Observable<StockMovement[]> {
    return this.api.get<StockMovement[]>('/movements/date-range', { from, to });
  }

  getHistory(productId: number, warehouseId: number): Observable<StockMovement[]> {
    return this.api.get<StockMovement[]>(`/movements/history/${productId}/${warehouseId}`);
  }
}
