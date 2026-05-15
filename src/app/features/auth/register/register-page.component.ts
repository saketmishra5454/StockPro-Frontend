import { NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
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
  styleUrl: './register-page.component.scss',
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
  readonly passwordScore = signal(0);
  readonly passwordStrengthLabel = signal('Use uppercase, number, and symbol');
  readonly roleLabels: Record<UserRole, string> = {
    ADMIN: 'Administrator',
    MANAGER: 'Inventory Manager',
    STAFF: 'Warehouse Staff',
    OFFICER: 'Purchase Officer'
  };

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.pattern(/^[+()\-\s\d]{7,20}$/)]],
    password: ['', [Validators.required, Validators.minLength(8), this.strongPasswordValidator]],
    confirmPassword: ['', [Validators.required]],
    role: this.fb.control<UserRole>('STAFF', [Validators.required])
  }, { validators: this.passwordsMatchValidator });

  constructor() {
    this.form.controls.password.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((password) => {
      const score = this.scorePassword(password);
      this.passwordScore.set(score);
      this.passwordStrengthLabel.set(this.labelForPasswordScore(score));
      this.form.controls.confirmPassword.updateValueAndValidity({ onlySelf: true, emitEvent: false });
      this.form.updateValueAndValidity({ onlySelf: true, emitEvent: false });
    });
  }

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

  get phoneError(): string {
    const control = this.form.controls.phone;

    if (control.hasError('pattern')) {
      return 'Enter a valid phone number';
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
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notifications.error('Please fix the highlighted fields.');
      return;
    }

    this.loading.set(true);
    const { name, email, password, phone, role } = this.form.getRawValue();
    const payload = {
      name,
      fullName: name,
      email,
      password,
      phone: phone || undefined,
      role
    };

    this.auth.register(payload).pipe(
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
    const confirmPasswordControl = control.get('confirmPassword');
    const confirmPassword = confirmPasswordControl?.value;

    if (!confirmPasswordControl) {
      return null;
    }

    const existingErrors = confirmPasswordControl.errors ?? {};
    const hasMismatch = Boolean(password && confirmPassword && password !== confirmPassword);

    if (hasMismatch) {
      confirmPasswordControl.setErrors({ ...existingErrors, passwordMismatch: true });
      return { passwordMismatch: true };
    }

    if (existingErrors['passwordMismatch']) {
      const { passwordMismatch, ...remainingErrors } = existingErrors;
      confirmPasswordControl.setErrors(Object.keys(remainingErrors).length ? remainingErrors : null);
    }

    return null;
  }

  private scorePassword(password: string): number {
    let score = 0;

    if (password.length >= 8) score += 25;
    if (/[A-Z]/.test(password)) score += 25;
    if (/\d/.test(password)) score += 25;
    if (/[^A-Za-z0-9]/.test(password)) score += 25;

    return score;
  }

  private labelForPasswordScore(score: number): string {
    if (score >= 100) return 'Strong password';
    if (score >= 75) return 'Almost there';
    if (score >= 50) return 'Medium strength';
    return 'Use uppercase, number, and symbol';
  }
}
