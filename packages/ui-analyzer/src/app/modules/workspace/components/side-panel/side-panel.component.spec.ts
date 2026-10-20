import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SidePanelComponent } from './side-panel.component';

@Component({
  imports: [SidePanelComponent],
  template: `
    <app-side-panel title="Log entry" closeLabel="close entry" [width]="404" (closeRequested)="close()">
      <span sidePanelLead class="lead">◈</span>
      <span sidePanelMeta class="meta">801 of 812</span>
      <button sidePanelActions class="action" type="button">next</button>
      <div class="body">record</div>
    </app-side-panel>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class PanelHostComponent {
  public readonly close = vi.fn();
}

const renderPanel = () => {
  const fixture = TestBed.createComponent(PanelHostComponent);
  const host: HTMLElement = fixture.nativeElement;

  fixture.detectChanges();

  return { fixture, panel: host.querySelector<HTMLElement>('app-side-panel') };
};

describe('SidePanelComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('heads the panel with what leads it, its title, its details, its actions and a named ×, in that order, over the body', () => {
    const { panel } = renderPanel();
    const header = panel?.querySelector('.side-panel-header');

    expect(Array.from(header?.children ?? []).map((child) => child.className)).toEqual([
      'lead',
      'side-panel-title',
      'meta',
      'spacer',
      'action',
      'side-panel-close',
    ]);
    expect(header?.querySelector('.side-panel-title')?.textContent).toBe('Log entry');
    expect(header?.querySelector('.side-panel-close')?.getAttribute('aria-label')).toBe('close entry');
    expect(panel?.lastElementChild?.className).toBe('body');
  });

  it('is as wide as it is told, and asks to close from its ×', () => {
    const { fixture, panel } = renderPanel();

    panel?.querySelector<HTMLElement>('.side-panel-close')?.click();

    expect(panel?.style.getPropertyValue('--side-panel-width')).toBe('404px');
    expect(fixture.componentInstance.close).toHaveBeenCalledTimes(1);
  });

  it('on a narrow window lies over the charts instead of beside them, so it cannot squeeze them to nothing', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(max-width: 759px)', addEventListener: vi.fn(), removeEventListener: vi.fn() }));

    const narrow = renderPanel().panel;

    vi.unstubAllGlobals();

    expect(narrow?.classList.contains('side-panel-compact')).toBe(true);
    expect(renderPanel().panel?.classList.contains('side-panel-compact')).toBe(false);
  });
});
