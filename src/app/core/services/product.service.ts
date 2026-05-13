import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Product } from '../models/inventory.models';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly api = inject(ApiService);

  getAll(): Observable<Product[]> {
    return this.api.get<Product[]>('/products/all', undefined, { silentErrors: true });
  }

  getLowStock(): Observable<Product[]> {
    return this.api.get<Product[]>('/products/low-stock', undefined, { silentErrors: true });
  }

  search(name: string): Observable<Product[]> {
    return this.api.get<Product[]>('/products/search', { name });
  }

  create(product: Partial<Product>): Observable<Product> {
    return this.api.post<Product>('/products', product);
  }

  update(id: number, product: Partial<Product>): Observable<Product> {
    return this.api.put<Product>(`/products/${id}`, product);
  }

  deactivate(id: number): Observable<Record<string, string>> {
    return this.api.put<Record<string, string>>(`/products/deactivate/${id}`, {});
  }

  activate(id: number): Observable<Record<string, string>> {
    return this.api.put<Record<string, string>>(`/products/activate/${id}`, {});
  }

  delete(id: number): Observable<Record<string, string>> {
    return this.api.delete<Record<string, string>>(`/products/${id}`);
  }
}
