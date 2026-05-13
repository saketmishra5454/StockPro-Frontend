import { NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  icon?: string;
  tone?: 'primary' | 'danger';
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatButtonModule, MatDialogModule, MatIconModule, NgIf],
  template: `
    <section class="confirm-dialog">
      <div class="confirm-dialog__icon" [class.confirm-dialog__icon--danger]="data.tone === 'danger'">
        <mat-icon fontSet="material-icons-round">{{ data.icon || 'help' }}</mat-icon>
      </div>
      <div>
        <h2 mat-dialog-title>{{ data.title }}</h2>
        <mat-dialog-content>{{ data.message }}</mat-dialog-content>
      </div>
    </section>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="false">{{ data.cancelLabel || 'Cancel' }}</button>
      <button
        mat-flat-button
        type="button"
        [color]="data.tone === 'danger' ? 'warn' : 'primary'"
        [mat-dialog-close]="true"
      >
        {{ data.confirmLabel }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    :host {
      display: block;
      color: var(--app-text);
    }

    .confirm-dialog {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 1rem;
      min-width: min(26rem, 82vw);
      padding: 1.25rem 1.25rem 0.25rem;
    }

    .confirm-dialog__icon {
      display: grid;
      width: 2.75rem;
      height: 2.75rem;
      place-items: center;
      border-radius: 0.75rem;
      background: rgba(37, 120, 232, 0.12);
      color: var(--app-accent);
    }

    .confirm-dialog__icon--danger {
      background: rgba(225, 29, 72, 0.12);
      color: var(--app-danger);
    }

    h2[mat-dialog-title] {
      margin: 0 0 0.35rem;
      padding: 0;
      font-size: 1.05rem;
      font-weight: 800;
    }

    mat-dialog-content {
      padding: 0;
      color: var(--app-muted);
      line-height: 1.55;
    }

    mat-dialog-actions {
      padding: 1rem 1.25rem 1.25rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConfirmDialogComponent {
  constructor(
    readonly dialogRef: MatDialogRef<ConfirmDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) readonly data: ConfirmDialogData
  ) {}
}
