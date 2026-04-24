import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { NewBlankSource } from '../../src/ui/NewBlankSource';
import { useStore, resetStore } from '../../src/ui/store';

describe('NewBlankSource', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
  });

  it('does not render when closed', () => {
    const { container } = render(
      <NewBlankSource open={false} onClose={() => {}} />,
    );
    expect(container.querySelector('.new-blank-dialog')).toBeNull();
  });

  it('Sheet mode creates a one-frame sheet on Create', () => {
    const onClose = vi.fn();
    const { getByLabelText, getByText } = render(
      <NewBlankSource open={true} onClose={onClose} />,
    );
    fireEvent.click(getByLabelText('Sheet'));
    fireEvent.change(getByLabelText('Width'), { target: { value: '48' } });
    fireEvent.change(getByLabelText('Height'), { target: { value: '32' } });
    fireEvent.click(getByText('Create'));
    const state = useStore.getState();
    const created = state.project.sources[0]!;
    expect(created.kind).toBe('sheet');
    expect(created.width).toBe(48);
    expect(created.height).toBe(32);
    expect(created.editedFrames).toHaveLength(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('Animation mode creates a sequence with N frames on Create', () => {
    const { getByLabelText, getByText } = render(
      <NewBlankSource open={true} onClose={() => {}} />,
    );
    fireEvent.click(getByLabelText('Animation'));
    fireEvent.change(getByLabelText('Frame count'), { target: { value: '6' } });
    fireEvent.click(getByText('Create'));
    const created = useStore.getState().project.sources[0]!;
    expect(created.kind).toBe('sequence');
    expect(created.editedFrames).toHaveLength(6);
  });

  it('Cancel closes without creating a source', () => {
    const onClose = vi.fn();
    const { getByText } = render(
      <NewBlankSource open={true} onClose={onClose} />,
    );
    fireEvent.click(getByText('Cancel'));
    expect(useStore.getState().project.sources).toHaveLength(0);
    expect(onClose).toHaveBeenCalled();
  });

  it('ESC closes the dialog (N4)', () => {
    const onClose = vi.fn();
    render(<NewBlankSource open={true} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('ESC does nothing when the dialog is closed', () => {
    const onClose = vi.fn();
    render(<NewBlankSource open={false} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
