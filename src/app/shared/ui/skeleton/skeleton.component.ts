import { NgFor } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  imports: [NgFor],
  template: `
    <div class="grid gap-3">
      <span
        *ngFor="let item of rows()"
        class="block h-4 animate-pulse rounded-full bg-slate-200/80 dark:bg-slate-700/70"
        [style.width]="item"
      ></span>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SkeletonComponent {
  readonly rows = input<string[]>(['88%', '76%', '92%', '64%']);
}
