// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';

describe('ConfirmDeleteDialog component', () => {
  afterEach(() => {
    cleanup();
  });

  it('should render dialog with title and description when open is true', () => {
    const handleClose = vi.fn();
    const handleConfirm = vi.fn();

    render(
      <ConfirmDeleteDialog
        open={true}
        title="Delete Annotation?"
        description="Are you sure you want to permanently delete this item?"
        onClose={handleClose}
        onConfirm={handleConfirm}
      />,
    );

    expect(screen.getByText('Delete Annotation?')).toBeDefined();
    expect(
      screen.getByText('Are you sure you want to permanently delete this item?'),
    ).toBeDefined();
  });

  it('should call onClose when cancel button is clicked', () => {
    const handleClose = vi.fn();
    const handleConfirm = vi.fn();

    render(
      <ConfirmDeleteDialog
        open={true}
        cancelLabel="Cancel Action"
        onClose={handleClose}
        onConfirm={handleConfirm}
      />,
    );

    const cancelButton = screen.getByText('Cancel Action');
    fireEvent.click(cancelButton);

    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(handleConfirm).not.toHaveBeenCalled();
  });

  it('should call onConfirm when confirm button is clicked', () => {
    const handleClose = vi.fn();
    const handleConfirm = vi.fn();

    render(
      <ConfirmDeleteDialog
        open={true}
        confirmLabel="Confirm Deletion"
        onClose={handleClose}
        onConfirm={handleConfirm}
      />,
    );

    const confirmButton = screen.getByText('Confirm Deletion');
    fireEvent.click(confirmButton);

    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });
});
