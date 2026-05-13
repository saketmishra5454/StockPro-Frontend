import { NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize, switchMap } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { UserRole } from '@core/models/auth.models';
import { AuthService } from '@core/services/auth.service';
import { NotificationService } from '@core/services/notification.service';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [NgFor, NgIf, ReactiveFormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule, MatSelectModule],
  templateUrl: './register-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly roles: UserRole[] = ['ADMIN', 'MANAGER', 'STAFF', 'OFFICER'];
  readonly loading = signal(false);
  readonly hidePassword = signal(true);

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    role: this.fb.control<UserRole>('STAFF', [Validators.required])
  });

  get nameError(): string {
    const control = this.form.controls.name;

    if (control.hasError('required')) {
      return 'Full name is required';
    }

    if (control.hasError('minlength')) {
      return 'Name must be at least 2 characters';
    }

    return '';
  }

  get emailError(): string {
    const control = this.form.controls.email;

    if (control.hasError('required')) {
      return 'Work email is required';
    }

    if (control.hasError('email')) {
      return 'Enter a valid business email';
    }

    return '';
  }

  get passwordError(): string {
    const control = this.form.controls.password;

    if (control.hasError('required')) {
      return 'Password is required';
    }

    if (control.hasError('minlength')) {
      return 'Use at least 8 characters';
    }

    return '';
  }

  togglePasswordVisibility(): void {
    this.hidePassword.update((value) => !value);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notifications.error('Please fix the highlighted fields.');
      return;
    }

    this.loading.set(true);
    const { email, password, role } = this.form.getRawValue();

    this.auth.register(this.form.getRawValue()).pipe(
      switchMap(() => this.auth.login({ email, password })),
      finalize(() => this.loading.set(false)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (response) => {
        const nextRole = response.user?.role ?? this.auth.currentUser?.role ?? role;
        this.notifications.success('Your StockPro workspace is ready.');
        void this.router.navigateByUrl(this.redirectPathForRole(nextRole));
      },
      error: () => {
        this.notifications.info('Account created if the email was available. Please sign in to continue.');
      }
    });
  }

  private redirectPathForRole(role: UserRole): string {
    const roleHome: Record<UserRole, string> = {
      ADMIN: '/admin',
      MANAGER: '/dashboard',
      STAFF: '/stock-movements',
      OFFICER: '/purchase-orders'
    };

    return roleHome[role];
  }
}
