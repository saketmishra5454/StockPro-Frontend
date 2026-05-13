import { CurrencyPipe, NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { catchError, finalize, of } from 'rxjs';
import { Product } from '@core/models/inventory.models';
import { ProductService } from '@core/services/product.service';
import { NotificationService } from '@core/services/notification.service';
import { PageHeaderComponent } from '@shared/ui/page-header/page-header.component';

@Component({
  selector: 'app-products-page',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, MatButtonModule, MatIconModule, NgFor, NgIf, PageHeaderComponent],
  template: `
    <app-page-header title="Products" description="Manage SKU metadata, pricing, reorder rules, and catalog health from the product service.">
      <button mat-flat-button color="primary" type="button" (click)="saveProduct()" [disabled]="saving()">
        <mat-icon fontSet="material-icons-round">add</mat-icon>
        Add product
      </button>
    </app-page-header>

    <section class="module-grid module-grid--cards mb-4">
      <article class="metric-card">
        <span class="metric-card__icon"><mat-icon fontSet="material-icons-round">inventory_2</mat-icon></span>
        <span class="metric-card__label">Total SKUs</span>
        <strong class="metric-card__value">{{ products().length }}</strong>
      </article>
      <article class="metric-card">
        <span class="metric-card__icon"><mat-icon fontSet="material-icons-round">warning</mat-icon></span>
        <span class="metric-card__label">Below Reorder</span>
        <strong class="metric-card__value">{{ lowStockCount() }}</strong>
      </article>
      <article class="metric-card">
        <span class="metric-card__icon"><mat-icon fontSet="material-icons-round">category</mat-icon></span>
        <span class="metric-card__label">Categories</span>
        <strong class="metric-card__value">{{ categoryCount() }}</strong>
      </article>
    </section>

    <section class="data-panel">
      <div class="panel-head">
        <h2>Catalog</h2>
        <label class="search-field">
          <mat-icon fontSet="material-icons-round">search</mat-icon>
          <input name="productSearch" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Search by name, SKU, category">
        </label>
      </div>

      <form class="form-grid" (ngSubmit)="saveProduct()">
        <label class="form-field"><input name="sku" [(ngModel)]="draft.sku" placeholder="SKU" required></label>
        <label class="form-field"><input name="name" [(ngModel)]="draft.name" placeholder="Product name" required></label>
        <label class="form-field"><input name="category" [(ngModel)]="draft.category" placeholder="Category"></label>
        <label class="form-field"><input name="brand" [(ngModel)]="draft.brand" placeholder="Brand"></label>
        <label class="form-field"><input name="costPrice" [(ngModel)]="draft.costPrice" type="number" min="0" placeholder="Cost price"></label>
        <label class="form-field"><input name="sellingPrice" [(ngModel)]="draft.sellingPrice" type="number" min="0" placeholder="Selling price"></label>
        <label class="form-field"><input name="reorderLevel" [(ngModel)]="draft.reorderLevel" type="number" min="0" placeholder="Reorder level"></label>
        <label class="form-field"><input name="maxStockLevel" [(ngModel)]="draft.maxStockLevel" type="number" min="0" placeholder="Max stock"></label>
      </form>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>SKU</th><th>Product</th><th>Category</th><th>Cost</th><th>Selling</th><th>Policy</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            <tr *ngFor="let product of filteredProducts()">
              <td>{{ product.sku }}</td>
              <td><strong>{{ product.name }}</strong><div class="muted text-sm">{{ product.brand || 'No brand' }}</div></td>
              <td>{{ product.category || 'General' }}</td>
              <td>{{ product.costPrice | currency:'INR':'symbol':'1.0-0' }}</td>
              <td>{{ product.sellingPrice | currency:'INR':'symbol':'1.0-0' }}</td>
              <td>{{ product.reorderLevel }} / {{ product.maxStockLevel }}</td>
              <td><span class="status-pill" [class.status-pill--good]="isActive(product)" [class.status-pill--danger]="!isActive(product)">{{ isActive(product) ? 'Active' : 'Inactive' }}</span></td>
              <td>
                <div class="action-row">
                  <button mat-icon-button type="button" aria-label="Edit product" (click)="edit(product)"><mat-icon fontSet="material-icons-round">edit</mat-icon></button>
                  <button *ngIf="isActive(product); else restoreProductAction" mat-icon-button type="button" aria-label="Deactivate product" (click)="deactivate(product)"><mat-icon fontSet="material-icons-round">block</mat-icon></button>
                  <ng-template #restoreProductAction>
                    <button mat-icon-button color="primary" type="button" aria-label="Activate product" (click)="activate(product)"><mat-icon fontSet="material-icons-round">lock_open</mat-icon></button>
                  </ng-template>
                </div>
              </td>
            </tr>
            <tr *ngIf="!loading() && !filteredProducts().length"><td colspan="8" class="muted">No products found.</td></tr>
            <tr *ngIf="loading()"><td colspan="8" class="muted">Loading products...</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductsPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly productService = inject(ProductService);
  private readonly notifications = inject(NotificationService);

  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly query = signal('');
  editingId: number | null = null;
  draft: Partial<Product> = this.emptyDraft();

  readonly filteredProducts = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.products().filter((product) => !term ||
      [product.name, product.sku, product.category, product.brand].some((value) => value?.toLowerCase().includes(term)));
  });
  readonly lowStockCount = computed(() => this.products().filter((product) => product.reorderLevel > 0).length);
  readonly categoryCount = computed(() => new Set(this.products().map((product) => product.category).filter(Boolean)).size);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.productService.getAll().pipe(
      catchError(() => of<Product[]>([])),
      finalize(() => this.loading.set(false)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((products) => this.products.set(products));
  }

  saveProduct(): void {
    if (!this.draft.sku || !this.draft.name) {
      this.notifications.info('Add SKU and product name first.');
      return;
    }

    this.saving.set(true);
    const request = this.editingId
      ? this.productService.update(this.editingId, this.draft)
      : this.productService.create(this.draft);

    request.pipe(finalize(() => this.saving.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.notifications.success(this.editingId ? 'Product updated.' : 'Product created.');
        this.draft = this.emptyDraft();
        this.editingId = null;
        this.load();
      }
    });
  }

  edit(product: Product): void {
    this.editingId = product.productId;
    this.draft = { ...product };
  }

  isActive(product: Product): boolean {
    return product.isActive ?? product.active ?? true;
  }

  deactivate(product: Product): void {
    this.productService.deactivate(product.productId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.notifications.success('Product deactivated.');
      this.load();
    });
  }

  activate(product: Product): void {
    this.productService.activate(product.productId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.notifications.success('Product activated.');
      this.load();
    });
  }

  private emptyDraft(): Partial<Product> {
    return { sku: '', name: '', category: '', brand: '', costPrice: 0, sellingPrice: 0, reorderLevel: 0, maxStockLevel: 0, leadTimeDays: 0, unitOfMeasure: 'PCS' };
  }
}
