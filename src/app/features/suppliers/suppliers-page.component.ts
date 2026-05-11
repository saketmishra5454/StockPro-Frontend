import { NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { catchError, finalize, of } from 'rxjs';
import { Supplier } from '@core/models/inventory.models';
import { NotificationService } from '@core/services/notification.service';
import { SupplierService } from '@core/services/supplier.service';
import { PageHeaderComponent } from '@shared/ui/page-header/page-header.component';

@Component({
  selector: 'app-suppliers-page',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatIconModule, NgFor, NgIf, PageHeaderComponent],
  template: `
    <app-page-header title="Suppliers" description="Maintain supplier profiles, contact channels, locations, and performance ratings.">
      <button mat-flat-button color="primary" type="button" (click)="saveSupplier()" [disabled]="saving()">
        <mat-icon fontSet="material-icons-round">person_add</mat-icon>
        Add supplier
      </button>
    </app-page-header>

    <section class="module-grid module-grid--cards mb-4">
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">groups</mat-icon></span><span class="metric-card__label">Suppliers</span><strong class="metric-card__value">{{ suppliers().length }}</strong></article>
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">verified</mat-icon></span><span class="metric-card__label">Active</span><strong class="metric-card__value">{{ activeCount() }}</strong></article>
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">star</mat-icon></span><span class="metric-card__label">Avg Rating</span><strong class="metric-card__value">{{ averageRating() }}</strong></article>
    </section>

    <section class="data-panel">
      <div class="panel-head">
        <h2>Supplier Directory</h2>
        <label class="search-field"><mat-icon fontSet="material-icons-round">search</mat-icon><input [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Search name, city, country"></label>
      </div>
      <form class="form-grid" (ngSubmit)="saveSupplier()">
        <label class="form-field"><input name="name" [(ngModel)]="draft.name" placeholder="Supplier name" required></label>
        <label class="form-field"><input name="contactPerson" [(ngModel)]="draft.contactPerson" placeholder="Contact person"></label>
        <label class="form-field"><input name="email" [(ngModel)]="draft.email" type="email" placeholder="Email"></label>
        <label class="form-field"><input name="phone" [(ngModel)]="draft.phone" placeholder="Phone"></label>
        <label class="form-field"><input name="city" [(ngModel)]="draft.city" placeholder="City"></label>
        <label class="form-field"><input name="country" [(ngModel)]="draft.country" placeholder="Country"></label>
      </form>

      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Supplier</th><th>Contact</th><th>Location</th><th>Rating</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr *ngFor="let supplier of filteredSuppliers()">
              <td><strong>{{ supplier.name }}</strong><div class="muted text-sm">{{ supplier.email || 'Email not set' }}</div></td>
              <td>{{ supplier.contactPerson || 'Unassigned' }}<div class="muted text-sm">{{ supplier.phone || '' }}</div></td>
              <td>{{ supplier.city || 'Unknown' }}, {{ supplier.country || 'Unknown' }}</td>
              <td>{{ supplier.rating || 0 }}/5</td>
              <td><span class="status-pill" [class.status-pill--good]="supplier.isActive ?? supplier.active ?? true">{{ (supplier.isActive ?? supplier.active ?? true) ? 'Active' : 'Inactive' }}</span></td>
              <td class="action-row">
                <button mat-icon-button type="button" aria-label="Edit supplier" (click)="edit(supplier)"><mat-icon fontSet="material-icons-round">edit</mat-icon></button>
                <button mat-icon-button type="button" aria-label="Rate supplier" (click)="rate(supplier)"><mat-icon fontSet="material-icons-round">star</mat-icon></button>
                <button mat-icon-button type="button" aria-label="Deactivate supplier" (click)="deactivate(supplier)" [disabled]="!(supplier.isActive ?? supplier.active ?? true)"><mat-icon fontSet="material-icons-round">block</mat-icon></button>
              </td>
            </tr>
            <tr *ngIf="loading()"><td colspan="6" class="muted">Loading suppliers...</td></tr>
            <tr *ngIf="!loading() && !filteredSuppliers().length"><td colspan="6" class="muted">No suppliers found.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SuppliersPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly supplierService = inject(SupplierService);
  private readonly notifications = inject(NotificationService);

  readonly suppliers = signal<Supplier[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly query = signal('');
  editingId: number | null = null;
  draft: Partial<Supplier> = this.emptyDraft();

  readonly filteredSuppliers = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.suppliers().filter((supplier) => !term || [supplier.name, supplier.city, supplier.country, supplier.email].some((value) => value?.toLowerCase().includes(term)));
  });
  readonly activeCount = computed(() => this.suppliers().filter((supplier) => supplier.isActive ?? supplier.active ?? true).length);
  readonly averageRating = computed(() => {
    const rated = this.suppliers().filter((supplier) => supplier.rating);
    return rated.length ? (rated.reduce((sum, supplier) => sum + (supplier.rating ?? 0), 0) / rated.length).toFixed(1) : '0.0';
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.supplierService.getAll().pipe(catchError(() => of<Supplier[]>([])), finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe((suppliers) => this.suppliers.set(suppliers));
  }

  saveSupplier(): void {
    if (!this.draft.name) {
      this.notifications.info('Supplier name is required.');
      return;
    }

    this.saving.set(true);
    const request = this.editingId ? this.supplierService.update(this.editingId, this.draft) : this.supplierService.create(this.draft);
    request.pipe(finalize(() => this.saving.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.notifications.success(this.editingId ? 'Supplier updated.' : 'Supplier created.');
      this.editingId = null;
      this.draft = this.emptyDraft();
      this.load();
    });
  }

  edit(supplier: Supplier): void {
    this.editingId = supplier.supplierId;
    this.draft = { ...supplier };
  }

  rate(supplier: Supplier): void {
    const nextScore = Math.min(Math.round((supplier.rating || 4) + 1), 5);
    this.supplierService.updateRating(supplier.supplierId, nextScore).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.notifications.success(`Supplier rated ${nextScore}/5.`);
      this.load();
    });
  }

  deactivate(supplier: Supplier): void {
    this.supplierService.deactivate(supplier.supplierId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.notifications.success('Supplier deactivated.');
      this.load();
    });
  }

  private emptyDraft(): Partial<Supplier> {
    return { name: '', contactPerson: '', email: '', phone: '', city: '', country: '', rating: 4 };
  }
}
