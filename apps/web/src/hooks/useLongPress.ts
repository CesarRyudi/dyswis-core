import { useCallback, useRef } from 'react';

type LongPressEvent = React.TouchEvent | React.MouseEvent;

interface UseLongPressOptions {
  shouldPreventDefault?: boolean;
  delay?: number;
}

export function useLongPress(
  onLongPress: (e: LongPressEvent, currentTarget: HTMLElement) => void,
  onClick?: (e: LongPressEvent) => void,
  { shouldPreventDefault = true, delay = 500 }: UseLongPressOptions = {}
) {
  const timeout = useRef<NodeJS.Timeout | undefined>(undefined);
  const target = useRef<EventTarget | null>(null);
  const isLongPress = useRef(false);
  const hasMoved = useRef(false);
  const startPos = useRef<{x: number, y: number} | null>(null);

  const start = useCallback(
    (event: LongPressEvent) => {
      // Aborta o long press se for um gesto multi-touch (ex: zoom/pinça)
      if ('touches' in event && event.touches.length > 1) {
        if (timeout.current) {
          clearTimeout(timeout.current);
          timeout.current = undefined;
        }
        hasMoved.current = true;
        return;
      }

      if (shouldPreventDefault && event.target) {
        event.target.addEventListener('touchend', preventDefault, { passive: false });
        target.current = event.target;
      }
      isLongPress.current = false;
      hasMoved.current = false;
      
      const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
      const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
      startPos.current = { x: clientX, y: clientY };

      const currentTarget = event.currentTarget as HTMLElement; // Captura síncrona do target
      timeout.current = setTimeout(() => {
        isLongPress.current = true;
        onLongPress(event, currentTarget);
      }, delay);
    },
    [onLongPress, delay, shouldPreventDefault]
  );

  const move = useCallback((event: LongPressEvent) => {
    // Aborta o long press e click se for um gesto multi-touch (ex: zoom/pinça)
    if ('touches' in event && event.touches.length > 1) {
      if (timeout.current) {
        clearTimeout(timeout.current);
        timeout.current = undefined;
      }
      hasMoved.current = true;
      return;
    }

    if (!startPos.current) return;
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
    const dx = clientX - startPos.current.x;
    const dy = clientY - startPos.current.y;
    
    // Cancela o long press e o click se houver movimento efetivo (tolerância de 18px contra tremores touch)
    if (Math.abs(dx) > 18 || Math.abs(dy) > 18) {
      if (timeout.current) {
        clearTimeout(timeout.current);
        timeout.current = undefined;
      }
      hasMoved.current = true;
    }
  }, []);

  const clear = useCallback(
    (event: LongPressEvent, shouldTriggerClick = true) => {
      if (timeout.current) {
        clearTimeout(timeout.current);
        timeout.current = undefined;
      }
      if (shouldTriggerClick && !isLongPress.current && !hasMoved.current && onClick) {
        onClick(event);
      }
      isLongPress.current = false;
      hasMoved.current = false;
      startPos.current = null;
      if (shouldPreventDefault && target.current) {
        target.current.removeEventListener('touchend', preventDefault);
      }
    },
    [shouldPreventDefault, onClick]
  );

  return {
    onMouseDown: (e: React.MouseEvent) => start(e),
    onTouchStart: (e: React.TouchEvent) => start(e),
    onMouseMove: (e: React.MouseEvent) => move(e),
    onTouchMove: (e: React.TouchEvent) => move(e),
    onMouseUp: (e: React.MouseEvent) => clear(e),
    onMouseLeave: (e: React.MouseEvent) => clear(e, false),
    onTouchEnd: (e: React.TouchEvent) => clear(e),
  };
}

const isTouchEvent = (event: Event): event is TouchEvent => {
  return 'touches' in event;
};

const preventDefault = (event: Event) => {
  if (!isTouchEvent(event)) return;
  if (event.touches.length < 2 && event.preventDefault) {
    event.preventDefault();
  }
};
