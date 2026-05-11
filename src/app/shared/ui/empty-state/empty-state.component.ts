import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <section class="glass-panel grid min-h-72 place-items-center rounded-2xl p-8 text-center">
      <div>
        <mat-icon class="!h-12 !w-12 !text-5xl text-brand-500" fontSet="material-icons-round">{{ icon() }}</mat-icon>
        <h2 class="mt-4 text-xl font-bold text-[var(--app-text)]">{{ title() }}</h2>
        <p class="mx-auto mt-2 max-w-xl text-sm text-[var(--app-muted)]">{{ message() }}</p>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmptyStateComponent {
  readonly icon = input('inventory_2');
  readonly title = input.required<string>();
  readonly message = input.required<string>();
}
