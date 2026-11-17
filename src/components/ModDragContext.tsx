import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ModSource, ModTarget } from '../types/synth';

interface ModDragState {
  source: ModSource;
  x: number;
  y: number;
  hoverTarget: ModTarget | null;
}

interface ModDragContextValue {
  dragState: ModDragState | null;
  startModDrag: (source: ModSource, clientX: number, clientY: number) => void;
}

const ModDragContext = createContext<ModDragContextValue>({
  dragState: null,
  startModDrag: () => {},
});

export function useModDrag(): ModDragContextValue {
  return useContext(ModDragContext);
}

interface ModDragProviderProps {
  onAssignModRoute: (source: ModSource, target: ModTarget) => void;
  children: React.ReactNode;
}

const SOURCE_LABELS: Record<ModSource, string> = {
  LFO1: 'LFO 1',
  LFO2: 'LFO 2',
  LFO3: 'LFO 3',
  MOD_ENV: 'MOD ENV',
  AMP_ENV: 'AMP ENV',
  MOD_WHEEL: 'MOD WHL',
};

export const ModDragProvider: React.FC<ModDragProviderProps> = ({
  onAssignModRoute,
  children,
}) => {
  const [dragState, setDragState] = useState<ModDragState | null>(null);
  const activeSourceRef = useRef<ModSource | null>(null);

  const resolveTargetAt = (x: number, y: number): ModTarget | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const hit = el?.closest('[data-mod-target]') as HTMLElement | null;
    const target = hit?.dataset.modTarget as ModTarget | undefined;
    return target ?? null;
  };

  const startModDrag = useCallback((source: ModSource, clientX: number, clientY: number) => {
    activeSourceRef.current = source;
    setDragState({
      source,
      x: clientX,
      y: clientY,
      hoverTarget: resolveTargetAt(clientX, clientY),
    });
  }, []);

  useEffect(() => {
    if (!dragState) return;

    const onPointerMove = (e: PointerEvent) => {
      if (!activeSourceRef.current) return;
      const hoverTarget = resolveTargetAt(e.clientX, e.clientY);
      setDragState({
        source: activeSourceRef.current,
        x: e.clientX,
        y: e.clientY,
        hoverTarget,
      });
    };

    const onPointerUp = (e: PointerEvent) => {
      const src = activeSourceRef.current;
      if (src) {
        const target = resolveTargetAt(e.clientX, e.clientY);
        if (target) {
          onAssignModRoute(src, target);
        }
      }
      activeSourceRef.current = null;
      setDragState(null);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [dragState !== null, onAssignModRoute]);

  return (
    <ModDragContext.Provider value={{ dragState, startModDrag }}>
      {children}
      {dragState && (
        <div
          style={{
            left: dragState.x,
            top: dragState.y,
            transform: 'translate(-50%, -140%)',
          }}
          className={`fixed z-[100] pointer-events-none px-2.5 py-1 rounded-md border text-[11px] font-display font-bold shadow-lg whitespace-nowrap ${
            dragState.hoverTarget
              ? 'bg-emerald-400 border-emerald-200 text-slate-950'
              : 'bg-amber-500 border-amber-200 text-slate-950'
          }`}
        >
          {SOURCE_LABELS[dragState.source]}
          {dragState.hoverTarget ? ` → Drop to Link` : ' → Drop on Knob'}
        </div>
      )}
    </ModDragContext.Provider>
  );
};
