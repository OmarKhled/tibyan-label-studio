import { observer } from "mobx-react";
import { cn } from "../../../utils/bem";
import { motion } from "motion/react";

const block = cn("sortable-chips");

const CopyIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const TrashIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
  </svg>
);

const CloseIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const ActionIcons = observer(function ActionIcons({
  showDuplicate,
  showDelete,
  showClear = true,
  onDuplicate,
  onDelete,
  onClear,
  style,
  floating = false,
}) {
  if (!showDuplicate && !showDelete && !showClear) return null;
  return (
    <motion.span
      className={block.elem("actions").mod({ floating }).toClassName()}
      role="toolbar"
      aria-label="Selection actions"
      onPointerDown={(e) => e.stopPropagation()}
      key="action-icons"
      style={{
        transformOrigin: "bottom center",
      }}
      transition={{ duration: 0.1 }}
      initial={{
        opacity: 0,
        ...style,
        transform: "translate(-50%, calc(-100% - 8px)) scale(0.8)",
      }}
      animate={{
        opacity: 1,
        ...style,
        transform: "translate(-50%, calc(-100% - 8px)) scale(1)",
      }}
      exit={{
        opacity: 0,
        scale: 0.2,
        transform: "translate(-50%, calc(-100% - 8px)) scale(0.2)",
      }}
      transition={{ duration: 0.15 }}
    >
      {showDuplicate && (
        <button
          type="button"
          className={block
            .elem("action")
            .mod({ duplicate: true })
            .toClassName()}
          aria-label="Duplicate selection"
          title="Duplicate (D)"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate?.();
          }}
        >
          {CopyIcon}
        </button>
      )}
      {showDelete && (
        <button
          type="button"
          className={block.elem("action").mod({ delete: true }).toClassName()}
          aria-label="Delete selection"
          title="Delete (Del)"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.();
          }}
        >
          {TrashIcon}
        </button>
      )}
      {showClear && (
        <button
          type="button"
          className={block.elem("action").mod({ clear: true }).toClassName()}
          aria-label="Clear selection"
          title="Clear selection (Esc)"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onClear?.();
          }}
        >
          {CloseIcon}
        </button>
      )}
    </motion.span>
  );
});
