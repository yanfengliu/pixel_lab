import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { ColorPanel } from '../../src/ui/ColorPanel';
import { useStore, resetStore } from '../../src/ui/store';

describe('ColorPanel', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
  });

  it('renders primary and secondary chips with current colors', () => {
    useStore.getState().setPrimaryColor({ r: 255, g: 0, b: 0, a: 255 });
    const { getByLabelText } = render(<ColorPanel />);
    const primary = getByLabelText('Primary color');
    expect(primary.style.backgroundColor).toMatch(/rgb\(255, ?0, ?0\)/);
  });

  it('clicking the swap button exchanges primary and secondary', () => {
    useStore.getState().setPrimaryColor({ r: 1, g: 1, b: 1, a: 255 });
    useStore.getState().setSecondaryColor({ r: 9, g: 9, b: 9, a: 255 });
    const { getByLabelText } = render(<ColorPanel />);
    fireEvent.click(getByLabelText('Swap colors'));
    expect(useStore.getState().primaryColor.r).toBe(9);
    expect(useStore.getState().secondaryColor.r).toBe(1);
  });

  it('typing into the primary hex field updates primaryColor', () => {
    const { getByLabelText } = render(<ColorPanel />);
    const input = getByLabelText('Primary hex') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '#80a020' } });
    const c = useStore.getState().primaryColor;
    expect(c.r).toBe(0x80);
    expect(c.g).toBe(0xa0);
    expect(c.b).toBe(0x20);
    expect(c.a).toBe(255);
  });

  it('clicking the add-swatch button captures the current primary', () => {
    useStore.getState().setPrimaryColor({ r: 0xab, g: 0xcd, b: 0xef, a: 255 });
    const { getByLabelText } = render(<ColorPanel />);
    fireEvent.click(getByLabelText('Add swatch'));
    expect(useStore.getState().project.swatches).toContain('#abcdef');
  });

  it('clicking a swatch sets primaryColor to that hex', () => {
    useStore.getState().addSwatch('#112233');
    const { getByLabelText } = render(<ColorPanel />);
    const swatch = getByLabelText('Swatch #112233');
    fireEvent.click(swatch);
    const c = useStore.getState().primaryColor;
    expect(c.r).toBe(0x11);
    expect(c.g).toBe(0x22);
    expect(c.b).toBe(0x33);
  });

  it('right-clicking a swatch removes it', () => {
    useStore.getState().addSwatch('#aa0000');
    useStore.getState().addSwatch('#00bb00');
    const { getByLabelText } = render(<ColorPanel />);
    fireEvent.contextMenu(getByLabelText('Swatch #aa0000'));
    expect(useStore.getState().project.swatches).toEqual(['#00bb00']);
  });

  it('opacity slider updates store', () => {
    const { getByLabelText } = render(<ColorPanel />);
    const slider = getByLabelText('Opacity') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '50' } });
    expect(useStore.getState().opacity).toBeCloseTo(0.5, 2);
  });
});
