import { NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { catchError, filter, finalize, of, switchMap } from 'rxjs';
import { UserProfile } from '@core/models/inventory.models';
import { AuthService } from '@core/services/auth.service';
import { NotificationService } from '@core/services/notification.service';
import { ConfirmDialogComponent } from '@shared/ui/confirm-dialog/confirm-dialog.component';
import { PageHeaderComponent } from '@shared/ui/page-header/page-header.component';

@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatIconModule, NgFor, NgIf, PageHeaderComponent],
  template: `
    <app-page-header title="Admin Panel" description="View users, roles, departments, and account status from the auth service.">
      <button mat-flat-button color="primary" type="button" (click)="load()">
        <mat-icon fontSet="material-icons-round">refresh</mat-icon>
        Refresh users
      </button>
    </app-page-header>

    <section class="module-grid module-grid--cards mb-4">
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">admin_panel_settings</mat-icon></span><span class="metric-card__label">Users</span><strong class="metric-card__value">{{ users().length }}</strong></article>
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">verified_user</mat-icon></span><span class="metric-card__label">Active</span><strong class="metric-card__value">{{ activeUsers() }}</strong></article>
      <article class="metric-card"><span class="metric-card__icon"><mat-icon fontSet="material-icons-round">badge</mat-icon></span><span class="metric-card__label">Admins</span><strong class="metric-card__value">{{ adminUsers() }}</strong></article>
    </section>

    <section class="data-panel">
      <div class="panel-head">
        <h2>User Directory</h2>
        <label class="search-field"><mat-icon fontSet="material-icons-round">search</mat-icon><input [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Search users"></label>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>User</th><th>Role</th><th>Department</th><th>Phone</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr *ngFor="let user of filteredUsers()">
              <td><strong>{{ user.fullName || user.name || user.email }}</strong><div class="muted text-sm">{{ user.email }}</div></td>
              <td><span class="status-pill">{{ user.role }}</span></td>
              <td>{{ user.department || 'Unassigned' }}</td>
              <td>{{ user.phone || '-' }}</td>
              <td>
                <span class="status-pill" [class.status-pill--good]="isActive(user)" [class.status-pill--danger]="!isActive(user)">
                  {{ isActive(user) ? 'Active' : 'Blocked' }}
                </span>
              </td>
              <td class="action-row">
                <button
                  *ngIf="isActive(user); else restoreUserAction"
                  mat-icon-button
                  type="button"
                  aria-label="Block user"
                  (click)="toggleAccess(user, false)"
                >
                  <mat-icon fontSet="material-icons-round">block</mat-icon>
                </button>
                <ng-template #restoreUserAction>
                  <button mat-icon-button color="primary" type="button" aria-label="Unblock user" (click)="toggleAccess(user, true)">
                    <mat-icon fontSet="material-icons-round">lock_open</mat-icon>
                  </button>
                </ng-template>
              </td>
            </tr>
            <tr *ngIf="loading()"><td colspan="6" class="muted">Loading users...</td></tr>
            <tr *ngIf="!loading() && !filteredUsers().length"><td colspan="6" class="muted">No users found.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly dialog = inject(MatDialog);

  readonly users = signal<UserProfile[]>([]);
  readonly loading = signal(true);
  readonly query = signal('');
  readonly filteredUsers = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.users().filter((user) => !term || [user.fullName, user.name, user.email, user.role, user.department].some((value) => value?.toLowerCase().includes(term)));
  });
  readonly activeUsers = computed(() => this.users().filter((user) => this.isActive(user)).length);
  readonly adminUsers = computed(() => this.users().filter((user) => user.role === 'ADMIN').length);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.auth.getUsers().pipe(catchError(() => of<UserProfile[]>([])), finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe((users) => this.users.set(users));
  }

  isActive(user: UserProfile): boolean {
    return user.isActive ?? user.active ?? true;
  }

  toggleAccess(user: UserProfile, restore: boolean): void {
    const id = Number(user.userId ?? user.id);
    if (!id) {
      this.notifications.info('User id is missing.');
      return;
    }

    const displayName = user.fullName || user.name || user.email;
    const action = restore ? 'unblock' : 'block';

    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: `${restore ? 'Unblock' : 'Block'} user`,
        message: `Are you sure you want to ${action} ${displayName}? ${restore ? 'They will be able to sign in again.' : 'They will lose access immediately.'}`,
        confirmLabel: restore ? 'Unblock user' : 'Block user',
        icon: restore ? 'lock_open' : 'block',
        tone: restore ? 'primary' : 'danger'
      }
    }).afterClosed().pipe(
      filter(Boolean),
      switchMap(() => restore ? this.auth.activateUser(id) : this.auth.deactivateUser(id)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      this.users.update((users) => users.map((item) => Number(item.userId ?? item.id) === id ? { ...item, isActive: restore, active: restore } : item));
      this.notifications.success(restore ? 'User unblocked.' : 'User blocked.');
      this.load();
    });
  }
}
