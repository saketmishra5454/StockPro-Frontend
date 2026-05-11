import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PurchaseOrder, PurchaseOrderLineItem } from '../models/inventory.models';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class PurchaseOrderService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  getAll(): Observable<PurchaseOrder[]> {
    return this.api.get<PurchaseOrder[]>('/purchase-orders', undefined, { silentErrors: true });
  }

  getByStatus(status: string): Observable<PurchaseOrder[]> {
    return this.api.get<PurchaseOrder[]>(`/purchase-orders/status/${status}`);
  }

  getLineItems(id: number): Observable<PurchaseOrderLineItem[]> {
    return this.api.get<PurchaseOrderLineItem[]>(`/purchase-orders/${id}/lines`);
  }

  create(purchaseOrder: Partial<PurchaseOrder>, lineItems: Partial<PurchaseOrderLineItem>[] = []): Observable<PurchaseOrder> {
    const createdById = Number(this.auth.currentUser?.id ?? purchaseOrder.createdById ?? 1);
    const normalizedLines = lineItems.map((item) => ({
      ...item,
      unitCost: item.unitCost ?? item.unitPrice ?? 0,
      quantity: item.quantity ?? item.orderedQuantity ?? 0,
      receivedQty: item.receivedQty ?? item.receivedQuantity ?? 0
    }));

    return this.api.post<PurchaseOrder>('/purchase-orders', {
      purchaseOrder: {
        ...purchaseOrder,
        createdById,
        status: purchaseOrder.status ?? 'DRAFT'
      },
      lineItems: normalizedLines
    });
  }

  update(id: number, purchaseOrder: Partial<PurchaseOrder>): Observable<PurchaseOrder> {
    return this.api.put<PurchaseOrder>(`/purchase-orders/${id}`, purchaseOrder);
  }

  submit(id: number): Observable<PurchaseOrder> {
    return this.api.post<PurchaseOrder>(`/purchase-orders/${id}/submit`, {});
  }

  approve(id: number): Observable<PurchaseOrder> {
    return this.api.post<PurchaseOrder>(`/purchase-orders/${id}/approve`, {});
  }

  reject(id: number, reason: string): Observable<PurchaseOrder> {
    return this.api.post<PurchaseOrder>(`/purchase-orders/${id}/reject`, { reason });
  }

  receive(id: number, receivedItems: Partial<PurchaseOrderLineItem>[]): Observable<PurchaseOrder> {
    return this.api.post<PurchaseOrder>(`/purchase-orders/${id}/receive`, { receivedItems });
  }

  cancel(id: number, reason: string): Observable<PurchaseOrder> {
    return this.api.post<PurchaseOrder>(`/purchase-orders/${id}/cancel`, { reason });
  }
}
