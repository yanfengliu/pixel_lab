import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
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

  it('primary hex input resyncs when primaryColor changes externally (I8)', () => {
    useStore.getState().setPrimaryColor({ r: 0x10, g: 0x10, b: 0x10, a: 255 });
    const { getByLabelText } = render(<ColorPanel />);
    const input = getByLabelText('Primary hex') as HTMLInputElement;
    expect(input.value).toBe('#101010');
    // Simulate an external color change (eyedropper, swap-via-X, swatch
    // click outside ColorPanel, etc.).
    act(() => {
      useStore.getState().setPrimaryColor({ r: 0xab, g: 0xcd, b: 0xef, a: 255 });
    });
    expect(input.value).toBe('#abcdef');
  });

  it('secondary hex input resyncs on external change (I8)', () => {
    useStore.getState().setSecondaryColor({ r: 0x11, g: 0x22, b: 0x33, a: 255 });
    const { getByLabelText } = render(<ColorPanel />);
    const input = getByLabelText('Secondary hex') as HTMLInputElement;
    expect(input.value).toBe('#112233');
    act(() => {
      useStore.getState().setSecondaryColor({
        r: 0x44,
        g: 0x55,
        b: 0x66,
        a: 255,
      });
    });
    expect(input.value).toBe('#445566');
  });

  it('X-key swap flips both hex inputs (I8 via swapColors)', () => {
    useStore.getState().setPrimaryColor({ r: 0x10, g: 0x20, b: 0x30, a: 255 });
    useStore.getState().setSecondaryColor({ r: 0xf0, g: 0xe0, b: 0xd0, a: 255 });
    const { getByLabelText } = render(<ColorPanel />);
    const primary = getByLabelText('Primary hex') as HTMLInputElement;
    const secondary = getByLabelText('Secondary hex') as HTMLInputElement;
    expect(primary.value).toBe('#102030');
    expect(secondary.value).toBe('#f0e0d0');
    act(() => {
      useStore.getState().swapColors();
    });
    expect(primary.value).toBe('#f0e0d0');
    expect(secondary.value).toBe('#102030');
  });
});
