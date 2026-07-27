"use client";

import * as React from "react";

/**
 * Drag-to-scroll con mouse sobre un contenedor scrolleable.
 *
 * Nació en el calendario (con muchos países la única forma de moverse era la
 * scrollbar del fondo) y se compartió con la ocupación del planner. En touch no
 * hace nada: el scroll nativo ya funciona.
 *
 * Detalles que importan:
 *  - Umbral de 5px para distinguir un drag de un click.
 *  - El click posterior a un drag se suprime en fase de captura, para no abrir
 *    el detalle de una celda sin querer al soltar.
 *  - No arranca sobre controles (links, botones, inputs) para no romperlos.
 *  - Usa pointer capture, así el drag sigue aunque el cursor salga del contenedor.
 */
export function useDragScroll<T extends HTMLElement = HTMLDivElement>(
  axis: "x" | "y" | "both" = "x",
  /** ref existente del contenedor, si el componente ya lo usa para otra cosa */
  externalRef?: React.RefObject<T | null>,
) {
  const internalRef = React.useRef<T | null>(null);
  const ref = externalRef ?? internalRef;
  const state = React.useRef({
    down: false,
    dragged: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
  });

  const onPointerDown = (e: React.PointerEvent<T>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = ref.current;
    if (!el) return;
    const canX = axis !== "y" && el.scrollWidth > el.clientWidth;
    const canY = axis !== "x" && el.scrollHeight > el.clientHeight;
    if (!canX && !canY) return;
    if ((e.target as HTMLElement).closest("a, button, input, select, textarea")) return;
    state.current = {
      down: true,
      dragged: false,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: el.scrollLeft,
      startTop: el.scrollTop,
    };
  };

  const onPointerMove = (e: React.PointerEvent<T>) => {
    const s = state.current;
    const el = ref.current;
    if (!s.down || !el) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (!s.dragged && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    if (!s.dragged) {
      s.dragged = true;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
      el.style.userSelect = "none";
    }
    if (axis !== "y") el.scrollLeft = s.startLeft - dx;
    if (axis !== "x") el.scrollTop = s.startTop - dy;
  };

  const onPointerUp = (e: React.PointerEvent<T>) => {
    const s = state.current;
    const el = ref.current;
    s.down = false;
    if (el) {
      if (s.dragged && el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
      el.style.cursor = "";
      el.style.userSelect = "";
    }
  };

  const onClickCapture = (e: React.MouseEvent<T>) => {
    if (state.current.dragged) {
      e.preventDefault();
      e.stopPropagation();
      state.current.dragged = false;
    }
  };

  return {
    ref,
    /** Se esparce sobre el contenedor scrolleable: `<div ref={ref} {...handlers}>` */
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onClickCapture,
    },
  };
}
