import { NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { UserRole } from '@core/models/auth.models';
import { AuthService } from '@core/services/auth.service';
import { NotificationService } from '@core/services/notification.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [
    NgIf,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly loading = signal(false);
  readonly resetting = signal(false);
  readonly showReset = signal(false);
  readonly hidePassword = signal(true);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    rememberDevice: [true]
  });

  readonly resetForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]]
  });

  constructor() {
    const currentUser = this.auth.currentUser;

    if (currentUser) {
      void this.router.navigateByUrl(this.redirectPathForRole(currentUser.role));
    }
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
      return 'Password must be at least 8 characters';
    }

    return '';
  }

  get resetEmailError(): string {
    const control = this.resetForm.controls.email;

    if (control.hasError('required')) {
      return 'Account email is required';
    }

    if (control.hasError('email')) {
      return 'Enter a valid business email';
    }

    return '';
  }

  togglePasswordVisibility(): void {
    this.hidePassword.update((value) => !value);
  }

  toggleReset(): void {
    this.showReset.update((value) => !value);
    this.resetForm.patchValue({ email: this.form.controls.email.value });
  }

  resetPassword(): void {
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      this.notifications.error('Please enter a valid account email.');
      return;
    }

    this.resetting.set(true);
    const { email } = this.resetForm.getRawValue();

    this.auth.requestPasswordReset(email).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.notifications.success('If this email is registered, reset instructions have been sent.');
        this.form.patchValue({ email });
        this.showReset.set(false);
        this.resetting.set(false);
      },
      error: () => this.resetting.set(false)
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notifications.error('Please fix the highlighted fields.');
      return;
    }

    this.loading.set(true);
    const { email, password } = this.form.getRawValue();

    this.auth.login({ email, password }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        const role = response.user?.role ?? this.auth.currentUser?.role;
        this.notifications.success('Welcome back to StockPro.');
        void this.router.navigateByUrl(role ? this.redirectPathForRole(role) : '/dashboard');
      },
      error: () => this.loading.set(false)
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
