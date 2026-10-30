import React, { useRef, useState } from 'react';
import { Box } from '@mui/material';

interface PinInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
}

export const PinInput: React.FC<PinInputProps> = ({
  length = 6,
  value,
  onChange,
  onComplete,
}) => {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const inputValue = e.target.value.toUpperCase();
    // Allow only alphanumeric characters
    if (!/^[A-Z0-9]*$/.test(inputValue)) return;

    // Get the last character typed
    const char = inputValue.slice(-1);

    const newValueArray = value.padEnd(length, ' ').split('');
    newValueArray[index] = char || ' ';
    const newValue = newValueArray.join('').trim();
    onChange(newValue);

    if (char && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newValue.length === length && onComplete && char) {
      onComplete(newValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace') {
      const newValueArray = value.padEnd(length, ' ').split('');
      
      if (newValueArray[index] !== ' ') {
        // Delete current char
        newValueArray[index] = ' ';
        onChange(newValueArray.join('').trimEnd());
      } else if (index > 0) {
        // Move to previous and delete
        newValueArray[index - 1] = ' ';
        onChange(newValueArray.join('').trimEnd());
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, length);
    if (pastedData) {
      onChange(pastedData);
      if (pastedData.length === length && onComplete) {
        onComplete(pastedData);
      }
      inputRefs.current[Math.min(pastedData.length, length - 1)]?.focus();
    }
  };

  const renderInputs = () => {
    const elements = [];
    for (let i = 0; i < length; i++) {
      const isFocused = focusedIndex === i;
      const char = value[i] || '';

      elements.push(
        <Box
          key={i}
          sx={{
            width: { xs: 44, sm: 54 },
            height: { xs: 54, sm: 64 },
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid',
            borderColor: isFocused ? '#38B7FF' : 'rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            boxShadow: isFocused ? '0 0 0 2px rgba(56, 183, 255, 0.2)' : 'none',
            backdropFilter: 'blur(10px)',
          }}
        >
          <input
            ref={(el) => { inputRefs.current[i] = el; }}
            value={char}
            onChange={(e) => handleChange(e, i)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            onFocus={() => setFocusedIndex(i)}
            onBlur={() => setFocusedIndex(null)}
            onPaste={handlePaste}
            maxLength={2} // Allow 2 to detect replacement
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#FFFFFF',
              fontSize: '24px',
              fontWeight: 600,
              textAlign: 'center',
              fontFamily: '"Inter", sans-serif',
            }}
          />
        </Box>
      );
    }
    return elements;
  };

  return (
    <Box sx={{ display: 'flex', gap: { xs: 1, sm: 1.5 }, justifyContent: 'center' }}>
      {renderInputs()}
    </Box>
  );
};
