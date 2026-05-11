import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Supplier } from '../models/inventory.models';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class SupplierService {
  private readonly api = inject(ApiService);

  getAll(): Observable<Supplier[]> {
    return this.api.get<Supplier[]>('/suppliers', undefined, { silentErrors: true });
  }

  getActive(): Observable<Supplier[]> {
    return this.api.get<Supplier[]>('/suppliers/active', undefined, { silentErrors: true });
  }

  search(name: string): Observable<Supplier[]> {
    return this.api.get<Supplier[]>('/suppliers/search', { name });
  }

  create(supplier: Partial<Supplier>): Observable<Supplier> {
    return this.api.post<Supplier>('/suppliers', supplier);
  }

  update(id: number, supplier: Partial<Supplier>): Observable<Supplier> {
    return this.api.put<Supplier>(`/suppliers/${id}`, supplier);
  }

  updateRating(id: number, score: number): Observable<Supplier> {
    return this.api.put<Supplier>(`/suppliers/${id}/rating`, { score });
  }

  deactivate(id: number): Observable<Record<string, string>> {
    return this.api.put<Record<string, string>>(`/suppliers/${id}/deactivate`, {});
  }

  delete(id: number): Observable<void> {
    return this.api.delete<void>(`/suppliers/${id}`);
  }
}
