import { NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '@core/services/auth.service';
import { NotificationService } from '@core/services/notification.service';

@Component({
  selector: 'app-reset-password-page',
  standalone: true,
  imports: [NgIf, ReactiveFormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule],
  templateUrl: './reset-password-page.component.html',
  styleUrl: './reset-password-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResetPasswordPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly hidePassword = signal(true);
  readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';

  readonly form = this.fb.group({
    password: ['', [Validators.required, Validators.minLength(8), this.strongPasswordValidator]],
    confirmPassword: ['', [Validators.required]]
  }, { validators: this.passwordsMatchValidator });

  get passwordError(): string {
    const control = this.form.controls.password;

    if (control.hasError('required')) {
      return 'New password is required';
    }

    if (control.hasError('minlength')) {
      return 'Use at least 8 characters';
    }

    if (control.hasError('weakPassword')) {
      return 'Use uppercase, a number, and a symbol';
    }

    return '';
  }

  get confirmPasswordError(): string {
    const control = this.form.controls.confirmPassword;

    if (control.hasError('required')) {
      return 'Confirm your password';
    }

    if (this.form.hasError('passwordMismatch') && control.touched) {
      return 'Passwords do not match';
    }

    return '';
  }

  togglePasswordVisibility(): void {
    this.hidePassword.update((value) => !value);
  }

  submit(): void {
    if (!this.token) {
      this.notifications.error('Password reset link is invalid or expired.');
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notifications.error('Please fix the highlighted fields.');
      return;
    }

    this.loading.set(true);
    const { password } = this.form.getRawValue();

    this.auth.resetPasswordWithToken(this.token, password).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.notifications.success('Password reset. You can sign in now.');
        void this.router.navigateByUrl('/auth/login');
      },
      error: () => this.loading.set(false)
    });
  }

  private strongPasswordValidator(control: AbstractControl): ValidationErrors | null {
    const password = String(control.value ?? '');

    if (!password) {
      return null;
    }

    const isStrong = /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);

    return isStrong ? null : { weakPassword: true };
  }

  private passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;

    return password && confirmPassword && password !== confirmPassword ? { passwordMismatch: true } : null;
  }
}
