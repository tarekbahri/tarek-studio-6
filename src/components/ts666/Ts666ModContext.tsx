import React, { createContext, useContext, useState } from 'react';
import type { Ts666ModSource, Ts666ModTarget } from '../../types/ts666';

export interface Ts666DragState {
  source: Ts666ModSource;
  clientX: number;
  clientY: number;
  hoverTarget: Ts666ModTarget | null;
}

interface Ts666ModContextValue {
  dragState: Ts666DragState | null;
  startDrag: (
    source: Ts666ModSource,
    e: React.PointerEvent,
    onDrop: (src: Ts666ModSource, target: Ts666ModTarget) => void
  ) => void;
}

const Ts666ModContext = createContext<Ts666ModContextValue>({
  dragState: null,
  startDrag: () => {},
});

export const useTs666ModDrag = () => useContext(Ts666ModContext);

function findTargetUnderPointer(x: number, y: number): Ts666ModTarget | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const host = el.closest('[data-ts666-target]');
  if (!host) return null;
  const val = host.getAttribute('data-ts666-target');
  return val ? (val as Ts666ModTarget) : null;
}

export const Ts666ModProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dragState, setDragState] = useState<Ts666DragState | null>(null);

  const startDrag = (
    source: Ts666ModSource,
    e: React.PointerEvent,
    onDrop: (src: Ts666ModSource, target: Ts666ModTarget) => void
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const initial: Ts666DragState = {
      source,
      clientX: e.clientX,
      clientY: e.clientY,
      hoverTarget: findTargetUnderPointer(e.clientX, e.clientY),
    };
    setDragState(initial);

    const onMove = (ev: PointerEvent) => {
      setDragState({
        source,
        clientX: ev.clientX,
        clientY: ev.clientY,
        hoverTarget: findTargetUnderPointer(ev.clientX, ev.clientY),
      });
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      const target = findTargetUnderPointer(ev.clientX, ev.clientY);
      setDragState(null);
      if (target) {
        onDrop(source, target);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  return (
    <Ts666ModContext.Provider value={{ dragState, startDrag }}>
      {children}
      {dragState && (
        <div
          style={{
            position: 'fixed',
            left: dragState.clientX + 12,
            top: dragState.clientY - 14,
            zIndex: 9999,
            pointerEvents: 'none',
          }}
          className="px-2 py-0.5 rounded bg-[#DC2626] text-[#FFF1E6] font-mono-num text-[10px] font-bold shadow-lg border border-[#D9822B]"
        >
          {dragState.source}
          {dragState.hoverTarget
            ? ` → ${dragState.hoverTarget.replace('GROWL_', 'WONKEY_')}`
            : ''}
        </div>
      )}
    </Ts666ModContext.Provider>
  );
};
