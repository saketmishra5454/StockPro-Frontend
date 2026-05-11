import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  standalone: true,
  template: `
    <header class="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <div>
        <p class="text-sm font-semibold text-brand-600">{{ eyebrow() }}</p>
        <h1 class="mt-1 text-3xl font-bold text-[var(--app-text)]">{{ title() }}</h1>
        <p class="mt-2 max-w-3xl text-sm text-[var(--app-muted)]">{{ description() }}</p>
      </div>
      <ng-content />
    </header>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PageHeaderComponent {
  readonly eyebrow = input('StockPro');
  readonly title = input.required<string>();
  readonly description = input.required<string>();
}
