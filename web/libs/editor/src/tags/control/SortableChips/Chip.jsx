import { observer } from "mobx-react";
import { useCallback, useLayoutEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "../../../utils/bem";
import { animate, motion } from "motion/react";

const GESTURE_THRESHOLD_PX = 8;

export const Chip = observer(function Chip({
  index,
  entry,
  isSelected,
  isRepetition,
  isFocused,
  allowReorder,
  readonly,
  onSelectStart,
  onSelectExtend,
  onSelectEnd,
  onSelectClick,
  onFocus,
  onKeyDown,
}) {
  const {
    attributes,
    listeners: dndListeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: entry?._id ?? `chip-${index}`,
    disabled: !allowReorder || readonly,
  });

  const gestureRef = useRef(null);

  // Local ref kept in sync with dnd-kit's setNodeRef so we can read the chip's
  // DOM rect for the spawn-from-source animation below.
  const localRef = useRef(null);
  const setRefs = useCallback(
    (node) => {
      setNodeRef(node);
      localRef.current = node;
    },
    [setNodeRef],
  );

  // On first mount, if this chip was spawned via duplicate (carries
  // `_spawnFromId`), slide it in from the source chip's DOM position to its
  // natural position. Runs once per chip lifetime.
  const spawnedRef = useRef(false);
  useLayoutEffect(() => {
    if (spawnedRef.current) return;
    spawnedRef.current = true;
    const spawnFromId = entry?._spawnFromId;
    if (!spawnFromId || !localRef.current) return;
    const sourceEl = document.querySelector(`[data-chip-id="${spawnFromId}"]`);
    if (!sourceEl || sourceEl === localRef.current) return;
    const sourceRect = sourceEl.getBoundingClientRect();
    const myRect = localRef.current.getBoundingClientRect();
    const dx = sourceRect.left - myRect.left;
    const dy = sourceRect.top - myRect.top;
    if (dx === 0 && dy === 0) return;
    animate(
      localRef.current,
      { x: [dx, 0], y: [dy, 0], opacity: [0.4, 1] },
      { type: "spring", stiffness: 380, damping: 32, mass: 0.7 },
    );
  }, [entry]);

  const handlePointerDown = useCallback(
    (e) => {
      if (readonly) return;
      if (e.button !== undefined && e.button !== 0) return;
      // Do NOT touch selection here — wait for pointermove (drag) or pointerup (click).
      // Mutating selection on pointerdown would clobber the prior state that the
      // click handler needs to read for extend/shrink/reset rules.
      gestureRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        resolved: null,
        moved: false,
      };
    },
    [readonly],
  );

  const handlePointerMove = useCallback(
    (e) => {
      const g = gestureRef.current;
      if (!g || g.resolved === "reorder") return;

      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);

      if (!g.resolved) {
        if (adx < GESTURE_THRESHOLD_PX && ady < GESTURE_THRESHOLD_PX) return;
        if (allowReorder && ady > adx) {
          g.resolved = "reorder";
          dndListeners?.onPointerDown?.(e);
          return;
        }
        g.resolved = "select";
        // First confirmed selection-drag movement: anchor selection on this chip.
        onSelectStart?.(index);
      }

      if (g.resolved === "select") {
        g.moved = true;
        const target = document.elementFromPoint(e.clientX, e.clientY);
        const chipEl = target?.closest?.("[data-chip-index]");
        if (chipEl) {
          const hitIdx = Number(chipEl.getAttribute("data-chip-index"));
          if (!Number.isNaN(hitIdx)) onSelectExtend?.(hitIdx);
        }
      }
    },
    [allowReorder, dndListeners, onSelectStart, onSelectExtend, index],
  );

  const handlePointerUp = useCallback(() => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g) return;
    if (g.resolved === "select" && g.moved) {
      onSelectEnd?.();
    } else if (g.resolved === null || (g.resolved === "select" && !g.moved)) {
      onSelectClick?.(index);
    }
  }, [onSelectEnd, onSelectClick, index]);

  const handlePointerCancel = useCallback(() => {
    gestureRef.current = null;
  }, []);

  // Only attach dnd-kit's transform/transition while a reorder drag is
  // actually happening. Otherwise we'd be setting an empty `transform: ''`
  // (or `transform: none` equivalent) on the element, which can fight with
  // framer-motion's layout-animation transform — preventing layout shifts
  // from running in parallel with AnimatePresence's `popLayout` exit.
  const style = transform
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
      }
    : undefined;

  const className = cn("sortable-chips")
    .elem("chip")
    .mod({
      selected: isSelected,
      dragging: isDragging,
      repetition: isRepetition,
    })
    .toClassName();

  return (
    <motion.span
      ref={setRefs}
      style={style}
      className={className}
      data-chip-index={index}
      data-chip-id={entry?._id}
      data-source-index={entry?.sourceIndex}
      role="option"
      aria-selected={isSelected}
      tabIndex={isFocused ? 0 : -1}
      onFocus={() => onFocus?.(index)}
      onKeyDown={(e) => onKeyDown?.(e, index)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      {...attributes}
      key={entry?._id}
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      // exit={{ opacity: 0, scale: 0.8 }}
      // Single spring config applied to both the layout-shift animation
      // (`layout`) and the chip's `animate`/`exit` transitions, so it matches
      // the spawn animation's spring in Chip's useLayoutEffect.
      transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.7 }}
    >
      {entry?.display ?? entry?.value ?? ""}
    </motion.span>
  );
});
