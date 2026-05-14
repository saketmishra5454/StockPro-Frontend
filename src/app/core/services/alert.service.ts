import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Alert } from '../models/inventory.models';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class AlertService {
  private readonly api = inject(ApiService);

  getAll(): Observable<Alert[]> {
    return this.api.get<Alert[]>('/alerts', undefined, { silentErrors: true });
  }

  getForRecipient(recipientId: string | number): Observable<Alert[]> {
    return this.api.get<Alert[]>(`/alerts/recipient/${recipientId}`, undefined, { silentErrors: true });
  }

  getUnacknowledged(recipientId: string | number): Observable<Alert[]> {
    return this.api.get<Alert[]>(`/alerts/unacknowledged/${recipientId}`, undefined, { silentErrors: true });
  }

  getUnreadCount(recipientId: string | number): Observable<{ recipientId: number; unreadCount: number }> {
    return this.api.get<{ recipientId: number; unreadCount: number }>(`/alerts/unread-count/${recipientId}`, undefined, { silentErrors: true });
  }

  send(alert: Partial<Alert>): Observable<Alert> {
    return this.api.post<Alert>('/alerts', alert);
  }

  sendBulk(payload: {
    recipientIds: number[];
    title: string;
    message?: string;
    type?: string;
    severity?: string;
    channel?: string;
    relatedProductId?: number;
    relatedWarehouseId?: number;
  }): Observable<Record<string, string>> {
    return this.api.post<Record<string, string>>('/alerts/bulk', payload);
  }

  markAsRead(id: number): Observable<Alert> {
    return this.api.put<Alert>(`/alerts/${id}/read`, {});
  }

  markAllRead(recipientId: string | number): Observable<Record<string, string>> {
    return this.api.put<Record<string, string>>(`/alerts/read-all/${recipientId}`, {});
  }

  acknowledge(id: number): Observable<Alert> {
    return this.api.put<Alert>(`/alerts/${id}/acknowledge`, {});
  }

  delete(id: number): Observable<Record<string, string>> {
    return this.api.delete<Record<string, string>>(`/alerts/${id}`);
  }
}
