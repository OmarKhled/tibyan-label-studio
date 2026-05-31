import { observer } from "mobx-react";
import { types } from "mobx-state-tree";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { AnimatePresence, motion } from "motion/react";

import InfoModal from "../../../components/Infomodal/Infomodal";
import Registry from "../../../core/Registry";
import ProcessAttrsMixin from "../../../mixins/ProcessAttrs";
import RequiredMixin from "../../../mixins/Required";
import PerRegionMixin from "../../../mixins/PerRegion";
import { AnnotationMixin } from "../../../mixins/AnnotationMixin";
import { ReadOnlyControlMixin } from "../../../mixins/ReadOnlyMixin";
import { cn } from "../../../utils/bem";
import { parseValue } from "../../../utils/data";
import ClassificationBase from "../ClassificationBase";
import ControlBase from "../Base";
import { Chip } from "./Chip";
import { ActionIcons } from "./ActionIcons";

const block = cn("sortable-chips");
import {
  clampSelection,
  computeRepetitionRuns,
  nextChipId,
  nextSelectionAfterToggle,
  normaliseSource,
} from "./utils";
import "./SortableChips.prefix.css";

/**
 * The `SortableChips` tag lets annotators edit an ordered sequence of chips, prefilled from a source list.
 * Chips can be selected (contiguously), duplicated, deleted, and reordered via drag-and-drop.
 *
 * @example
 * <View>
 *   <Audio name="audio" value="$audio" />
 *   <SortableChips name="transcript" toName="audio" source="$ayah_words" direction="rtl" required="true" />
 * </View>
 *
 * @name SortableChips
 * @meta_title SortableChips Tag for editing an ordered sequence of chips from a fixed inventory
 * @meta_description Constrain annotators to a fixed inventory of tokens and let them produce an ordered, possibly-duplicated sequence.
 * @param {string} name           Name of the tag
 * @param {string} toName         Name of the object tag this annotation refers to
 * @param {string} source         Task data field with the source list (e.g. "$items")
 * @param {boolean} [allowReorder=true]    Whether drag-to-reorder is enabled
 * @param {boolean} [allowDelete=true]     Whether the delete action icon is shown
 * @param {boolean} [allowDuplicate=true]  Whether the duplicate action icon is shown
 * @param {boolean} [allowReset=true]      Whether the reset-to-original button is shown
 * @param {boolean} [allowEmpty=true]      Whether an empty sequence is a valid annotation
 * @param {ltr|rtl} [direction=ltr]        Layout and reading direction
 * @param {boolean} [required=false]       Validate that the sequence is non-empty (unless allowEmpty)
 * @param {string}  [requiredMessage]      Message shown if validation fails
 * @param {boolean} [perRegion]            Bind this control to a region instead of the entire task
 */
const TagAttrs = types.model({
  toname: types.maybeNull(types.string),
  source: types.maybeNull(types.string),
  // Optional task-data reference (e.g. "$default_sequence") for a prefilled
  // sequence that may contain repeats. When set, the chip area initialises
  // from this on first load AND the reset button restores to it.
  default: types.maybeNull(types.string),
  value: types.optional(types.string, ""),
  allowreorder: types.optional(types.boolean, true),
  allowdelete: types.optional(types.boolean, true),
  allowduplicate: types.optional(types.boolean, true),
  allowreset: types.optional(types.boolean, true),
  allowempty: types.optional(types.boolean, true),
  direction: types.optional(types.enumeration(["ltr", "rtl"]), "ltr"),
});

const ChipEntry = types.frozen();

const Model = types
  .model({
    type: "sortablechips",
    _value: types.optional(types.frozen(), []),
    sequence: types.optional(types.array(ChipEntry), []),
  })
  .volatile(() => ({
    selectionStart: null,
    selectionEnd: null,
    focusedIndex: null,
    _initialised: false,
    _default: null,
  }))
  .views((self) => ({
    get valueType() {
      return "sortablechips";
    },
    get isRTL() {
      return self.direction === "rtl";
    },
    get sourceItems() {
      const raw = self._value && self._value.length ? self._value : self.value;
      return normaliseSource(raw);
    },
    // Normalise `_default` against `sourceItems`. Accepts any of:
    //   - array of indices into source:           [0, 0, 1, 2]
    //   - array of source values/displays:        ["قل", "قل", "يا عبادي"]
    //   - array of objects with `sourceIndex`:    [{sourceIndex:0}, ...]
    //   - array of objects with `value`:          [{value:"قل"}, ...]
    // Returns an empty array if no default or items couldn't be resolved.
    // Duplicate sourceIndex entries auto-style as repetitions — no flag needed.
    get defaultItems() {
      const raw = self._default;
      if (!Array.isArray(raw) || raw.length === 0) return [];
      const src = self.sourceItems;
      if (!src.length) return [];
      return raw
        .map((item) => {
          let idx;
          if (typeof item === "number") {
            idx = item;
          } else if (typeof item === "string") {
            idx = src.findIndex((s) => s.value === item || s.display === item);
          } else if (item && typeof item === "object") {
            if (typeof item.sourceIndex === "number") {
              idx = item.sourceIndex;
            } else if (item.value != null) {
              idx = src.findIndex((s) => s.value === String(item.value));
            }
          }
          if (typeof idx !== "number" || idx < 0 || idx >= src.length) {
            return null;
          }
          // Preserve any extra fields the user attached on the default entry
          // (e.g. metadata), then overlay the canonical source data.
          const extras =
            item && typeof item === "object" && !Array.isArray(item)
              ? item
              : {};
          return { ...extras, ...src[idx], _id: nextChipId() };
        })
        .filter(Boolean);
    },
    get hasSelection() {
      return self.selectionStart != null && self.selectionEnd != null;
    },
    get selectionRange() {
      if (!self.hasSelection) return null;
      return [self.selectionStart, self.selectionEnd];
    },
    get repetitionRuns() {
      return computeRepetitionRuns(self.sequence);
    },
    get sequenceSnapshot() {
      return self.sequence.map((c) => ({ ...c }));
    },
    selectedValues() {
      return self.sequenceSnapshot;
    },
    get holdsState() {
      return self.sequence.length > 0;
    },
  }))
  .actions((self) => ({
    _persist() {
      // Strip the UI-only `_id` field before persisting — it's just for stable
      // React keys, not part of the serialized result.
      const data = self.sequenceSnapshot.map(({ _id, ...rest }) => rest);
      if (self.perregion) {
        self.updateResult?.();
        return;
      }
      if (self.result) {
        self.result.setValue(data);
      } else {
        self.annotation.createResult(
          {},
          { sortablechips: data },
          self,
          self.toname,
        );
      }
    },

    _initialiseFromSource() {
      // Prefer `default` (prefilled sequence, may contain repeats) over the
      // bare source list when both are present.
      const items = self.defaultItems.length
        ? self.defaultItems
        : self.sourceItems;
      self.sequence.replace(items);
    },

    _restoreFromResult(value) {
      if (!Array.isArray(value)) return;
      // Re-issue ids when restoring — saved results don't include `_id`.
      self.sequence.replace(value.map((c) => ({ ...c, _id: nextChipId() })));
    },

    updateFromResult(value) {
      self._restoreFromResult(value);
    },

    updateValue(store) {
      // Resolve `source` (spec) preferentially; fall back to `value` for compatibility.
      const target = self.source || self.value;
      const taskData = store?.task?.dataObj ?? {};
      self._value = parseValue(target, taskData);
      // Resolve the optional `default` task-data reference too.
      if (self.default) {
        self._default = parseValue(self.default, taskData);
      }
    },

    afterCreate() {
      // Initialisation happens in needsUpdate(), which fires after updateValue has
      // resolved `_value` and Annotation deserialization has linked any existing result.
    },

    needsUpdate() {
      const existing = self.result?.mainValue;
      if (existing && existing.length) {
        self._restoreFromResult(existing);
      } else if (!self._initialised) {
        self._initialiseFromSource();
      }
      self._initialised = true;
    },

    setSequence(next) {
      self.sequence.replace(next.map((c) => ({ ...c })));
      self._persist();
    },

    resetToSource() {
      self.clearSelection();
      // Reset target: `default` if provided, else bare `source`. Re-issue ids
      // so the chips animate as fresh entries.
      const items = self.defaultItems.length
        ? self.defaultItems
        : self.sourceItems;
      self.sequence.replace(items.map((c) => ({ ...c, _id: nextChipId() })));
      self._persist();
    },

    duplicateSelection() {
      if (!self.hasSelection) return;
      if (!self.allowduplicate) return;
      const [start, end] = self.selectionRange;
      // New copies get fresh `_id`s so React/@dnd-kit see them as distinct
      // chips. `_spawnFromId` points at the source chip's `_id` so the Chip
      // component can animate from the source's DOM position on first mount.
      const segment = self.sequence
        .slice(start, end + 1)
        .map((c) => ({ ...c, _id: nextChipId(), _spawnFromId: c._id }));
      const before = self.sequence.slice(0, end + 1).map((c) => ({ ...c }));
      const after = self.sequence.slice(end + 1).map((c) => ({ ...c }));
      const next = [...before, ...segment, ...after];
      self.sequence.replace(next);
      const newStart = end + 1;
      const newEnd = newStart + (end - start);
      self.setSelection(newStart, newEnd);
      self._persist();
    },

    deleteSelection() {
      if (!self.hasSelection) return;
      if (!self.allowdelete) return;
      const [start, end] = self.selectionRange;
      const next = [
        ...self.sequence.slice(0, start).map((c) => ({ ...c })),
        ...self.sequence.slice(end + 1).map((c) => ({ ...c })),
      ];
      self.sequence.replace(next);
      self.clearSelection();
      self._persist();
    },

    moveChip(fromIdx, toIdx) {
      if (fromIdx === toIdx) return;
      if (!self.allowreorder) return;
      const next = arrayMove(self.sequenceSnapshot, fromIdx, toIdx);
      self.sequence.replace(next);
      self.clearSelection();
      self._persist();
    },

    setSelection(start, end) {
      const [lo, hi] = clampSelection(start, end, self.sequence.length);
      self.selectionStart = lo;
      self.selectionEnd = hi;
    },

    clearSelection() {
      self.selectionStart = null;
      self.selectionEnd = null;
    },

    toggleChipAt(idx) {
      const current = [self.selectionStart, self.selectionEnd];
      const [ns, ne] = nextSelectionAfterToggle(
        current,
        idx,
        self.sequence.length,
      );
      self.setSelection(ns, ne);
    },

    extendSelectionTo(idx) {
      if (self.selectionStart == null) {
        self.setSelection(idx, idx);
        return;
      }
      self.setSelection(self.selectionStart, idx);
    },

    setFocusedIndex(idx) {
      self.focusedIndex = idx;
    },

    requiredModal() {
      InfoModal.warning(
        self.requiredmessage || `Sequence "${self.name}" is required.`,
      );
    },

    validateValue(value) {
      if (!self.allowempty) {
        if (!value || value.length === 0) return false;
      }
      return true;
    },

    beforeSend() {
      if (!self.result && self.sequence.length > 0) {
        self._persist();
      }
    },
  }));

const SortableChipsModel = types.compose(
  "SortableChipsModel",
  ControlBase,
  ClassificationBase,
  ProcessAttrsMixin,
  RequiredMixin,
  PerRegionMixin,
  AnnotationMixin,
  ReadOnlyControlMixin,
  TagAttrs,
  Model,
);

const HtxSortableChips = observer(function HtxSortableChips({ item }) {
  const containerRef = useRef(null);

  // Ensure initialisation runs once dependencies are ready
  useEffect(() => {
    if (!item._initialised) {
      item.needsUpdate();
    }
  }, [item, item._initialised, item.sourceItems.length]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8, tolerance: 5, delay: 0 },
    }),
  );

  // dnd-kit items keyed by chip `_id` (matches React key) so the drag state
  // stays attached to a specific chip across inserts/deletes.
  const sortableIds = useMemo(
    () => item.sequence.map((c) => c?._id).filter(Boolean),
    [item.sequence.map((c) => c?._id).join(",")],
  );

  const handleDragEnd = useCallback(
    (event) => {
      const { active, over } = event;
      if (!over) return;
      const from = item.sequence.findIndex((c) => c?._id === active.id);
      const to = item.sequence.findIndex((c) => c?._id === over.id);
      if (from < 0 || to < 0) return;
      item.moveChip(from, to);
    },
    [item],
  );

  // Background-click no longer clears selection — use the ✕ icon in the floating panel
  // or the Escape key instead. This avoids accidentally losing selection when clicking
  // outside the chip row.
  const handleBackgroundPointerDown = useCallback(() => {}, []);

  const handleKeyDown = useCallback(
    (e, idx) => {
      const key = e.key;
      if (key === "Escape") {
        item.clearSelection();
        e.preventDefault();
        return;
      }
      if (key === " " || key === "Enter") {
        item.toggleChipAt(idx);
        e.preventDefault();
        return;
      }
      if (key === "Delete" || key === "Backspace") {
        if (item.hasSelection) {
          item.deleteSelection();
          e.preventDefault();
        }
        return;
      }
      if ((key === "d" || key === "D") && !e.metaKey && !e.ctrlKey) {
        if (item.hasSelection) {
          item.duplicateSelection();
          e.preventDefault();
        }
        return;
      }
      if (e.altKey && (key === "ArrowLeft" || key === "ArrowRight")) {
        const dir = key === "ArrowLeft" ? -1 : 1;
        const effective = item.isRTL ? -dir : dir;
        const next = idx + effective;
        if (next >= 0 && next < item.sequence.length) {
          item.moveChip(idx, next);
          item.setFocusedIndex(next);
        }
        e.preventDefault();
      }
    },
    [item],
  );

  const isReadOnly = item.isReadOnly?.() ?? false;

  const containerClass = block.mod({ readonly: isReadOnly }).toClassName();

  const [actionsPos, setActionsPos] = useState(null);
  const [outlineRect, setOutlineRect] = useState(null);

  // Compute a chip's natural position relative to the container, IGNORING any
  // CSS transforms currently on it (spawn-from-source animations, layout-shift
  // transforms, etc.). Walks the offsetParent chain because `offsetLeft` /
  // `offsetTop` are transform-independent — unlike `getBoundingClientRect`,
  // which reflects the live transformed position.
  const naturalRect = (el, containerEl) => {
    let left = 0;
    let top = 0;
    let node = el;
    while (node && node !== containerEl) {
      left += node.offsetLeft;
      top += node.offsetTop;
      node = node.offsetParent;
    }
    return {
      left,
      top,
      right: left + el.offsetWidth,
      bottom: top + el.offsetHeight,
    };
  };

  // Compute a bounding rect for a chip index range. Returns null if any chip is missing.
  // Queries the DOM directly via `data-chip-index` so we don't rely on a ref-map that
  // can go stale when chips are deleted (React's ref-callback ordering during
  // unmount/remount can leave a Map keyed by index inconsistent).
  // Asymmetric pad compensates for the chip's bounding-rect extending a few px below
  // its visible pill due to font descender / line-height metrics.
  const computeRangeRect = useCallback(
    (startIdx, endIdx, padTop, padSides, padBottom) => {
      const container = containerRef.current;
      if (!container) return null;
      const startEl = container.querySelector(
        `[data-chip-index="${startIdx}"]`,
      );
      const endEl = container.querySelector(`[data-chip-index="${endIdx}"]`);
      if (!startEl || !endEl) return null;
      const startRect = naturalRect(startEl, container);
      const endRect = naturalRect(endEl, container);
      const left = Math.min(startRect.left, endRect.left);
      const right = Math.max(startRect.right, endRect.right);
      const top = Math.min(startRect.top, endRect.top);
      const bottom = Math.max(startRect.bottom, endRect.bottom);
      return {
        left: left - padSides,
        top: top - padTop,
        width: right - left + padSides * 2,
        height: bottom - top + padTop + padBottom,
        // expose the un-padded edges for actions positioning
        _innerLeft: left,
        _innerRight: right,
        _innerTop: top,
      };
    },
    [],
  );

  useLayoutEffect(() => {
    // Selection outline + floating actions position
    if (!item.hasSelection) {
      setActionsPos(null);
      setOutlineRect(null);
    } else {
      // padTop, padSides, padBottom — equalized now that we measure via
      // offsetLeft/offsetTop (transform-free). The earlier asymmetric values
      // existed to compensate for getBoundingClientRect's font-descender quirk
      // which no longer applies.
      const rect = computeRangeRect(
        item.selectionStart,
        item.selectionEnd,
        5,
        5,
        5,
      );
      if (rect) {
        setOutlineRect(rect);
        setActionsPos({
          left: (rect._innerLeft + rect._innerRight) / 2,
          top: rect._innerTop,
        });
      } else {
        setOutlineRect(null);
        setActionsPos(null);
      }
    }
  }, [
    item.hasSelection,
    item.selectionStart,
    item.selectionEnd,
    item.sequence.length,
    item.sequence.map((c) => c?.sourceIndex).join(","),
    computeRangeRect,
  ]);

  return (
    <div
      ref={containerRef}
      className={containerClass}
      dir={item.direction}
      role="listbox"
      aria-multiselectable="true"
      onPointerDown={handleBackgroundPointerDown}
    >
      <div className={block.elem("legend").toClassName()} aria-hidden="true">
        <span className={block.elem("legend-item").toClassName()}>
          <span
            className={block
              .elem("legend-swatch")
              .mod({ normal: true })
              .toClassName()}
          />
          <span>كلمة عادية</span>
        </span>
        <span className={block.elem("legend-item").toClassName()}>
          <span
            className={block
              .elem("legend-swatch")
              .mod({ duplicate: true })
              .toClassName()}
          />
          <span>كلمة مكررة</span>
        </span>
      </div>

      {item.allowreset && (
        <button
          type="button"
          className={block.elem("reset").toClassName()}
          onClick={() => item.resetToSource()}
          aria-label="استعادة الكلمات الأصلية"
          title="استعادة الكلمات الأصلية"
          disabled={isReadOnly}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          <span>استعادة</span>
        </button>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortableIds}
          strategy={horizontalListSortingStrategy}
        >
          <div
            className={block.elem("row").toClassName()}
            onClick={handleBackgroundPointerDown}
          >
            <AnimatePresence mode="sync" initial={false}>
              {item.sequence.map((entry, index) => {
                const isSelected =
                  item.hasSelection &&
                  index >= item.selectionStart &&
                  index <= item.selectionEnd;
                const isRepetition = item.repetitionRuns.some(
                  (run) => index >= run.start && index <= run.end,
                );
                const isFocused = item.focusedIndex === index;
                return (
                  <Chip
                    key={entry?._id}
                    index={index}
                    entry={entry}
                    isSelected={isSelected}
                    isRepetition={isRepetition}
                    isFocused={isFocused}
                    allowReorder={item.allowreorder && !isReadOnly}
                    readonly={isReadOnly}
                    onSelectStart={(i) => item.setSelection(i, i)}
                    onSelectExtend={(i) => item.extendSelectionTo(i)}
                    onSelectClick={(i) => item.toggleChipAt(i)}
                    onFocus={(i) => item.setFocusedIndex(i)}
                    onKeyDown={handleKeyDown}
                  />
                );
              })}
            </AnimatePresence>
          </div>
        </SortableContext>
      </DndContext>

      {item.hasSelection && outlineRect ? (
        <AnimatePresence>
          <motion.div
            className={block.elem("selection-outline").toClassName()}
            initial={{
              left: outlineRect.left,
              top: outlineRect.top,
              width: outlineRect.width,
              height: outlineRect.height,
              opacity: 0,
            }}
            animate={{
              left: outlineRect.left,
              top: outlineRect.top,
              width: outlineRect.width,
              height: outlineRect.height,
              opacity: 1,
            }}
          />
        </AnimatePresence>
      ) : null}

      <AnimatePresence>
        {item.hasSelection && actionsPos ? (
          <ActionIcons
            floating
            showDuplicate={item.allowduplicate && !isReadOnly}
            showDelete={item.allowdelete && !isReadOnly}
            showClear
            onDuplicate={() => item.duplicateSelection()}
            onDelete={() => item.deleteSelection()}
            onClear={() => item.clearSelection()}
            style={{ left: actionsPos.left, top: actionsPos.top }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
});

Registry.addTag("sortablechips", SortableChipsModel, HtxSortableChips);
Registry.addObjectType(SortableChipsModel);

export { HtxSortableChips, SortableChipsModel, TagAttrs };
