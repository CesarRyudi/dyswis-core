// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { PinInput } from './PinInput';

describe('PinInput component', () => {
  afterEach(() => {
    cleanup();
  });
  it('should render the default 6 input boxes', () => {
    const handleChange = vi.fn();
    render(<PinInput value="" onChange={handleChange} />);

    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(6);
  });

  it('should display the characters corresponding to value prop', () => {
    const handleChange = vi.fn();
    render(<PinInput value="ABC" onChange={handleChange} />);

    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    expect(inputs[0].value).toBe('A');
    expect(inputs[1].value).toBe('B');
    expect(inputs[2].value).toBe('C');
    expect(inputs[3].value).toBe('');
  });

  it('should uppercase entered alphanumeric characters and call onChange', () => {
    const handleChange = vi.fn();
    render(<PinInput value="" onChange={handleChange} />);

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'k' } });

    expect(handleChange).toHaveBeenCalledWith('K');
  });

  it('should fire onComplete callback when all digits are completed', () => {
    const handleChange = vi.fn();
    const handleComplete = vi.fn();
    render(
      <PinInput
        value="ABCDE"
        onChange={handleChange}
        onComplete={handleComplete}
      />,
    );

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[5], { target: { value: 'F' } });

    expect(handleComplete).toHaveBeenCalledWith('ABCDEF');
  });

  it('should handle pasted 6-digit access code', () => {
    const handleChange = vi.fn();
    const handleComplete = vi.fn();
    render(
      <PinInput
        value=""
        onChange={handleChange}
        onComplete={handleComplete}
      />,
    );

    const inputs = screen.getAllByRole('textbox');
    fireEvent.paste(inputs[0], {
      clipboardData: {
        getData: () => 'xyz999',
      },
    });

    expect(handleChange).toHaveBeenCalledWith('XYZ999');
    expect(handleComplete).toHaveBeenCalledWith('XYZ999');
  });
});
