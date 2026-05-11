import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);

  success(message: string): void {
    this.open(message, 'Success');
  }

  error(message: string): void {
    this.open(message, 'Dismiss');
  }

  info(message: string): void {
    this.open(message, 'OK');
  }

  private open(message: string, action: string): void {
    this.snackBar.open(message, action, {
      duration: 4200,
      horizontalPosition: 'right',
      verticalPosition: 'top'
    });
  }
}
