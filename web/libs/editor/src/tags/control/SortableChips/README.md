# SortableChips

A constrained-vocabulary control tag for Label Studio Frontend (LSF). Annotators edit an **ordered sequence of chips** drawn from a fixed token list — reordering, duplicating contiguous segments, and deleting items entirely through direct manipulation.

```xml
<View>
  <Audio name="audio" value="$audio" />
  <SortableChips
    name="transcript"
    toName="audio"
    source="$ayah_words"
    default="$prefilled_sequence"
    direction="rtl"
    required="true"
  />
</View>
```

---

## 1. Motivation

A surprising number of annotation tasks reduce to the same shape: *given a closed inventory of tokens, produce the correct ordered sequence the annotator intends*. A free-text input is technically sufficient, but introduces problems we don't want:

- **Typing errors** — annotators slip on diacritics, hamza variants, spacing.
- **Surface-form variation** — `الله` vs `الله ` (trailing space), `أ` vs `ا`, etc.
- **Slowness** — typing long sequences is far slower than clicking.
- **Laziness** — given a text box, annotators take shortcuts; given direct manipulation, they can't.

When the valid vocabulary is known up-front, constraining annotators to it eliminates an entire class of label noise. `SortableChips` provides that constraint while keeping the editing experience fluid.

**Concrete use cases this generalises across:**

- **Quranic ASR transcript correction** — the prompt ayah is known; the annotator confirms or marks repetitions in the recitation.
- **Step ordering** — given a set of process steps, arrange them in execution order.
- **Ranked preferences** — given features, drop the irrelevant ones and order the rest (`allowDuplicate="false"`).
- **Slot filling from a closed vocabulary** — adjust a candidate sequence drawn from a fixed list.

All share the same underlying interaction: a single ordered sequence of chips prefilled from a source list, edited in place.

---

## 2. Visual layout

```
┌──────────────────────────────────────────────────────────────┐
│  ⬤ كلمة عادية   ⬤ كلمة مكررة          [↻ استعادة]            │  ← legend (top-leading), reset (top-trailing)
│                                                              │
│  ┌────────────┐                                              │
│  │ duplicate  │ delete · clear                               │  ← floating action panel (above selection only)
│  └─────▼──────┘                                              │
│  ┏━━━━━━━┓ ┌──────┐ ┌──────┐ ┌──────┐                       │  ← selection-outline (dashed) wraps selected chips
│  ┃ chip A ┃ │chip B│ │chip C│ │chip D│ ...                   │  ← chip row (flex-wrap, gap: 8px)
│  ┗━━━━━━━┛ └──────┘ └──────┘ └──────┘                       │
└──────────────────────────────────────────────────────────────┘
```

**Structural elements** (all queryable by BEM class names with the `lsf-sortable-chips__*` prefix):

| Element | Class | Purpose |
|---|---|---|
| Container | `.sortable-chips` | Soft-tinted, rounded surface holding everything. `position: relative` (anchor for absolute children). |
| Legend | `.sortable-chips__legend` | Two swatches + Arabic labels, top-leading corner. `pointer-events: none`. |
| Reset button | `.sortable-chips__reset` | Top-trailing corner. Stamped `z-index: 4` so the row's padding doesn't steal clicks. |
| Row | `.sortable-chips__row` | Flex container, `gap: 8px`, `padding-top: 24px` (reserves room for the action panel). |
| Chip | `.sortable-chips__chip` | Pill (`border-radius: 999px`), interactive, `position: relative; z-index: 1`. |
| Selection outline | `.sortable-chips__selection-outline` | Absolutely positioned dashed border around the selection. `z-index: 3`. |
| Action panel (floating) | `.sortable-chips__actions_floating` | Absolutely positioned, translated to sit above the selection's bounding box. `z-index: 5`. |
| Action button | `.sortable-chips__action` | The duplicate / delete / clear icons. |

The whole container is `dir`-aware. With `direction="rtl"`:
- Reset moves to top-LEFT (via `&[dir="rtl"] &__reset`).
- Legend moves to top-RIGHT.
- Chip flow flips automatically thanks to flex's bidi awareness.
- Action panel positions itself relative to the selection bounding box, which is computed from `offsetLeft`/`offsetTop` (transform-independent), so it lands correctly in either direction.

---

## 3. Colour system

All chip styling reads from the LSF design tokens defined in `web/libs/ui/src/tokens/tokens.prefix.css`. **No hardcoded colours anywhere** — the component themes automatically with the rest of LSF.

### 3.1 Chip palette

| State | Background | Border | Text | Token family |
|---|---|---|---|---|
| Normal | `--color-neutral-background` (white) | `--color-neutral-border` | `--color-neutral-content` | neutral |
| Normal · hover | `--color-accent-blueberry-subtler` | `--color-accent-blueberry-subtle` | `--color-accent-blueberry-dark` | **blueberry** (light) |
| Duplicated | `--color-primary-emphasis` (grape-100) | `--color-primary-border` | `--color-primary-content` | **grape** |
| Duplicated · hover | same | same | same | grape (no change on hover — the colour itself communicates the state) |
| Selected | `--color-blueberry-300` | `--color-accent-blueberry-base` | `--color-accent-blueberry-dark` | **blueberry** (medium) |
| Selected · hover | same bg | `--color-accent-blueberry-bold` (darker) | same | only the border darkens — bg stays put |
| Selected + duplicated | `--color-grape-200` | `--color-primary-border` | `--color-primary-content` | **grape** (medium) |
| Selected + duplicated · hover | same bg | `--color-grape-800` (darker) | same | only the border darkens |
| While reorder-dragging | unchanged | unchanged | unchanged | adds `box-shadow` + `opacity: 0.9` + `z-index: 10` |

**The two colour stories:**

- **Blueberry = interaction.** Hover, selection, "you're touching this." The brightness ramp (`100 → 300`) signals depth of intent. Hover-on-selected darkens only the border so the chip doesn't feel "extra-pressed" — the visual weight is reserved for the act of selection itself.
- **Grape = repetition.** Whenever a chip's `sourceIndex` matches an earlier contiguous run, it's grape. Hover on a duplicated chip doesn't change the background — the grape already *is* the signal. When a duplicate is also selected, we pivot to a darker grape (rather than blueberry) so the "this is a duplicate" semantic isn't lost the moment it becomes interactive.

This split keeps the two visual layers — *what kind of chip is this* (colour family) vs *what am I doing to it* (intensity) — orthogonal and legible. The cascade is hand-tuned with `:not()` guards so no state combination falls into ambiguity; specificity ties are explicitly resolved by source order.

### 3.2 Container, outline, and chrome

| Element | Token |
|---|---|
| Container background | `--color-neutral-emphasis-subtle` |
| Container border | `--color-neutral-border-subtle` |
| Selection outline | `--color-primary-border` (dashed, 1.5 px) |
| Reset button text | `--color-neutral-content-subtle`, hover `--color-neutral-content` |
| Floating action panel bg | `--color-neutral-background` |
| Delete action hover | `--color-negative-content` / `--color-negative-border` |

### 3.3 Why these specific tokens

We tested a few palettes before landing here:

- **Mango → kiwi → blueberry/grape**. Mango (warm orange) was the first guess for "duplicated" — visually distinct from neutral. Kiwi (green) was tried next. Both worked, but neither felt at home next to the existing LSF primary (grape). Blueberry for selection + grape for repetition felt native — both are blue-violet hues, sharing a tone family, which gives the component visual cohesion with the rest of the UI without sacrificing the "two distinct states" requirement.
- **Bottom padding asymmetry** — when we first measured chip rects with `getBoundingClientRect`, the visible pill sat ~4 px shy of the rect's bottom (font descender / line-height metrics). We compensated with asymmetric outline padding (top 6, sides 5, bottom 4). After switching to `offsetTop`/`offsetHeight` (transform-independent), the rect IS the visible chip — so we equalised to 5 px on all sides.

---

## 4. Interaction model

### 4.1 Selection

Selection is always **contiguous**. The current selection is rendered with:
- A distinct background colour on each selected chip (blueberry-300 or grape-200).
- A dashed primary border drawn around the bounding box of the segment.

**Click rules** (handled by `nextSelectionAfterToggle` in `utils.js`):

| Current state | Action | Result |
|---|---|---|
| No selection | Click chip *idx* | Select just *idx* |
| Selection `[s, e]` | Click chip adjacent (`s−1` or `e+1`) | Extend to include it |
| Selection `[s, s]` (single chip) | Click that same chip | Clear selection |
| Selection `[s, e]`, `s ≠ e` | Click chip at `s` or `e` | Shrink by one |
| Selection `[s, e]` | Click chip *strictly between* `s` and `e` | Collapse to that chip |
| Selection `[s, e]` | Click non-adjacent unselected chip | Reset to just that chip |
| Any selection | `Esc` key or `×` button on floating panel | Clear |

**Background clicks do NOT clear the selection.** We removed that behaviour after discovering it caused accidental loss of selection when annotators clicked outside the chip row. The floating panel's `×` button is the explicit clear gesture.

**Selection-drag**: pointerdown on a chip, drag horizontally along the row, release → builds a contiguous selection covering the swept range. The drag *replaces* any prior selection. We anchor the selection only after the gesture is confirmed (≥ 8 px movement, horizontal dominant), so a quick click never overwrites the existing selection before the click handler can read it.

### 4.2 Reorder

Reorder uses `@dnd-kit/sortable` with a `PointerSensor`. Gestures share the chip's pointerdown with selection-drag and are disambiguated after ~8 px of movement:

- **Vertical component dominates** OR chip leaves the row's bounding box → reorder.
- **Otherwise** → selection-drag.

Each chip in `@dnd-kit/sortable` is keyed by its `_id` (stable across inserts/deletes/reorders), so drag state stays attached to the right chip even when the array shifts beneath it.

### 4.3 Repetition detection

**Definition**: a *repetition* is a maximal contiguous run of chips whose `sourceIndex` sequence equals an earlier contiguous run. The earliest occurrence is *never* marked — only subsequent ones are. Implemented in `computeRepetitionRuns(sequence)` in `utils.js`.

There is **no explicit "this is a repeat" flag**. The component derives `isRepetition` from the structural property of the sequence itself, which means:

- Duplicating via the action panel automatically styles the new chips as repetitions.
- Pre-filling via `default="$..."` with overlapping `sourceIndex` values lights up as repetitions automatically.
- Reordering or deleting can change the repetition layout dynamically (e.g., removing the original turns a former duplicate into the new first occurrence — the grape styling moves with it).

### 4.4 Floating action panel

When a selection exists, three icon buttons appear, absolutely-positioned above the selection's bounding box (centred horizontally over the segment, 8 px above the chip tops, with a triangle pointer):

| Icon | Action | Hotkey |
|---|---|---|
| **Copy** | Duplicate the selected segment immediately after the original; new copies become the selection. | `D` |
| **Trash** | Delete the selected chips; selection clears. | `Del` / `Backspace` |
| **×** | Clear the selection. | `Esc` |

The panel position is recomputed in a `useLayoutEffect` whenever the selection or sequence changes, using natural-position measurement (`offsetLeft`/`offsetTop` summed up the offsetParent chain) so that mid-animation transforms on chips don't shift it.

### 4.5 Reset

A button in the container's top-trailing corner (top-LEFT in RTL, top-RIGHT in LTR) labelled **استعادة**. Clicking it:

1. Clears the selection.
2. Restores `sequence` to the **initial prefilled state** — which is `defaultItems` if `default="$..."` is set, else `sourceItems`.
3. Re-issues fresh `_id`s for every chip so AnimatePresence treats them as new entries (and the enter animation plays).
4. Goes through MST so the action is undoable via `Cmd+Z`.

**Why reset doesn't just use `sourceItems`**: the original v1 always reset to the bare source list, which silently destroyed any pre-filled repeats that came from the task data. We added a `default="$..."` task-data reference so prefilled-with-repeats sequences round-trip correctly through reset. Default lives in immutable task data, so it survives save/reload cycles cleanly.

### 4.6 Keyboard support

| Key | Effect |
|---|---|
| `Tab` / `Shift+Tab` | Move focus between chips |
| `Space` / `Enter` on focused chip | Toggle that chip (same rules as click) |
| `Esc` | Clear selection |
| `D` (selection present) | Duplicate selection |
| `Delete` / `Backspace` (selection present) | Delete selection |
| `Alt+ArrowLeft` / `Alt+ArrowRight` (mirrored under RTL) | Move the focused chip one position |

---

## 5. Animation system

Built on **`motion/react`** (Framer Motion). The animation layer is intentionally lean — every motion uses the **same spring config**:

```js
{ type: "spring", stiffness: 380, damping: 32, mass: 0.7 }
```

…so layout shifts, chip enter/exit, and the duplicate's spawn-from-source slide all read as one continuous physical system.

### 5.1 Layout shift (existing chips moving)

Each chip has `layout` on its `motion.span`. Whenever the sequence changes (insert, delete, reorder), framer-motion captures previous positions and animates from old → new with the shared spring.

### 5.2 Enter / exit

`AnimatePresence mode="popLayout" initial={false}` wraps the chip map.

- `initial={{ opacity: 0, scale: 0.8 }}` → `animate={{ opacity: 1, scale: 1 }}` on mount.
- `exit={{ opacity: 0, scale: 0.8 }}` on unmount.
- `mode="popLayout"`: when a chip exits, it's pulled out of the flex flow immediately (set to `position: absolute`) so the surviving chips can layout-shift to close the gap *in parallel* with the exit animation, not after.
- `initial={false}` suppresses the entrance animation on first render so opening a task doesn't fly every chip in.

### 5.3 Spawn-from-source

When `duplicateSelection()` runs, each new copy is stamped with `_spawnFromId: c._id` pointing at the chip it was copied from. On the new chip's first mount, a one-shot `useLayoutEffect` in `Chip.jsx`:

1. Finds the source element via `document.querySelector('[data-chip-id="..."]')`.
2. Measures both the source and the new chip's natural rects.
3. Computes the offset `(dx, dy)`.
4. Calls `animate(node, { x: [dx, 0], y: [dy, 0], opacity: [0.4, 1] }, spring)`.

`useLayoutEffect` runs after DOM commit but **before browser paint**, so the new chip's first painted frame is already at the source's position — no flicker. Then it springs into its natural slot.

### 5.4 Why measurement uses `offsetLeft`, not `getBoundingClientRect`

Children's `useLayoutEffect` runs before the parent's. By the time the parent measures chip positions for the selection outline + floating action panel, the chip's `useLayoutEffect` has already applied the spawn transform — so `getBoundingClientRect` returns the *transformed* (spawn-source) position, and the outline draws around the wrong place.

`offsetLeft` / `offsetTop` / `offsetWidth` / `offsetHeight` ignore CSS transforms entirely. We walk up the `offsetParent` chain from each chip to the container to compute the chip's *natural layout slot*, regardless of any in-flight animation. The outline and action panel always land where the chips *will* be when their animations settle.

### 5.5 Why `style.transform` is conditional

The chip's `style` only carries `transform` and `transition` *while dnd-kit is actively dragging it*:

```js
const style = transform
  ? { transform: CSS.Transform.toString(transform), transition }
  : undefined;
```

When idle, dnd-kit returns `null` for `transform`. If we still attached the resulting empty `style={{ transform: "" }}`, framer-motion would refuse to write its own layout-transform to the element (it doesn't overwrite controlled styles). That blocked `popLayout` from working. The fix: leave the chip's inline style untouched when not dragging, freeing framer to drive its transform.

---

## 6. Data flow

```
┌──────────────────┐    ┌─────────────────┐    ┌──────────────┐
│  task data       │───▶│  Model.updateValue│──▶│  _value      │
│  ("$ayah_words") │    │  (parseValue)    │   │  _default    │
└──────────────────┘    └─────────────────┘    └──────┬───────┘
                                                      │
                                                      ▼
                                            ┌────────────────┐
                                            │  sourceItems   │
                                            │  defaultItems  │
                                            └────────┬───────┘
                                                     │
                                                     ▼
┌──────────────────┐    ┌─────────────────┐    ┌──────────────┐
│  existing result │───▶│  needsUpdate     │──▶│  sequence    │
│  (annotation)    │    │  (restore or init)│   │  (MST array) │
└──────────────────┘    └─────────────────┘    └──────┬───────┘
                                                      │
                                                      ▼
                                            ┌────────────────┐
                                            │  _persist      │
                                            │  (strips _id)  │
                                            └────────┬───────┘
                                                     │
                                                     ▼
                                            ┌────────────────┐
                                            │  result.value  │
                                            │  .sortablechips│
                                            └────────────────┘
```

### 6.1 Attribute resolution

`updateValue(store)` is called by LSF's lifecycle once the task's `dataObj` is available. It resolves `source` and `default` using `parseValue` from `utils/data.js`:

```js
updateValue(store) {
  const target = self.source || self.value;
  const taskData = store?.task?.dataObj ?? {};
  self._value = parseValue(target, taskData);
  if (self.default) {
    self._default = parseValue(self.default, taskData);
  }
}
```

`_value` (the resolved source) and `_default` (the resolved default sequence) are kept on volatile state — they're a function of task data, not user edits.

### 6.2 Initial sequence

On first mount, `needsUpdate()` is called:

```js
needsUpdate() {
  const existing = self.result?.mainValue;
  if (existing && existing.length) {
    self._restoreFromResult(existing);   // user has prior annotation → use it
  } else if (!self._initialised) {
    self._initialiseFromSource();         // fresh task → use default || source
  }
  self._initialised = true;
}

_initialiseFromSource() {
  const items = self.defaultItems.length ? self.defaultItems : self.sourceItems;
  self.sequence.replace(items);
}
```

### 6.3 The `_id` field

Every chip carries a `_id` (monotonic counter in `utils.js` → `nextChipId()`). This serves two purposes:

- **React key** for `<Chip>` components — survives index shifts so AnimatePresence can correctly identify which chips are entering, exiting, or just relocating.
- **`@dnd-kit/sortable` item id** — drag state stays attached to a specific chip even when its index changes.

`_id` is UI-only. `_persist()` strips it before writing to the result so it never pollutes the serialized output:

```js
const data = self.sequenceSnapshot.map(({ _id, ...rest }) => rest);
```

When restoring a saved result on task reopen, fresh `_id`s are re-issued.

### 6.4 Output schema

The result `value` is:

```json
{
  "sequence": [...]  // ← this key is `sortablechips` in the framework's value object
}
```

The full serialized result:

```json
{
  "from_name": "transcript",
  "to_name": "ayah_display",
  "type": "sortablechips",
  "value": {
    "sortablechips": [
      { "value": "قل",     "display": "قل",     "sourceIndex": 0 },
      { "value": "يا عبادي", "display": "يا عبادي", "sourceIndex": 1 },
      { "value": "يا عبادي", "display": "يا عبادي", "sourceIndex": 1 },
      { "value": "الذين",  "display": "الذين",  "sourceIndex": 2 }
    ]
  }
}
```

Each entry preserves:

- `value` — canonical identifier of the source item.
- `display` — human-readable form, denormalised for convenience.
- `sourceIndex` — index in the original source list. **Duplicates share a `sourceIndex` with the original.**
- Any extra fields the user attached to source objects pass through.

---

## 7. Attributes

| Attribute | Type | Default | Description |
|---|---|---|---|
| `name` | string | required | Standard LSF control attribute. |
| `toName` | string | required | Object tag this annotation refers to. |
| `source` | task-data ref | required | List of strings, `{value, display, ...}` objects, or a single string (split on whitespace). |
| `default` | task-data ref | — | Optional prefilled sequence (may contain repeats). Used for initial load + reset target. Accepts indices, strings, or objects. |
| `allowReorder` | boolean | `true` | Whether drag-to-reorder is enabled. |
| `allowDelete` | boolean | `true` | Whether the delete icon is shown. |
| `allowDuplicate` | boolean | `true` | Whether the duplicate icon is shown. |
| `allowReset` | boolean | `true` | Whether the reset button is shown. |
| `allowEmpty` | boolean | `true` | Whether an empty sequence is valid. |
| `direction` | `"ltr"` \| `"rtl"` | `"ltr"` | Layout direction. |
| `required` | boolean | `false` | Inherited from `RequiredMixin`. |
| `requiredMessage` | string | — | Inherited. |
| `perRegion` | boolean | `false` | Inherited from `PerRegionMixin`. |

### 7.1 `source` shapes

```jsonc
// 1. Array of strings
["alpha", "beta", "gamma"]

// 2. Array of objects with value + display + arbitrary extras
[
  { "value": "w0", "display": "بِسْمِ", "ayah": 1, "wordIdx": 0 },
  { "value": "w1", "display": "اللَّهِ", "ayah": 1, "wordIdx": 1 }
]

// 3. Single string — split on whitespace, treated as (1)
"alpha beta gamma"
```

### 7.2 `default` shapes

```jsonc
// 1. Array of source indices (compact for repeats)
[0, 0, 1, 2, 3, 4, 5, 6, 7, 6, 7, 8, 9, 10]

// 2. Array of strings (matched against source value or display)
["قل", "قل", "يا عبادي"]

// 3. Array of objects with sourceIndex
[ { "sourceIndex": 0 }, { "sourceIndex": 0 }, { "sourceIndex": 1 } ]

// 4. Array of objects with value
[ { "value": "قل" }, { "value": "قل" } ]
```

Repetitions are auto-detected — duplicate `sourceIndex` entries get grape styling without any flag.

---

## 8. MST model architecture

```js
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
```

**Composition order matters**: `Model` is composed LAST so its `updateValue` override (which reads `source` first) wins the cascade over `ProcessAttrsMixin.updateValue`. Same trick `Choices` uses.

### 8.1 Persistent state

- `type: "sortablechips"` — model discriminator.
- `_value: types.frozen([])` — resolved source data from task.
- `sequence: types.array(types.frozen())` — the live chip sequence. Every mutation goes through an MST action, so it integrates with LSF's TimeTraveller undo/redo middleware.

### 8.2 Volatile state (excluded from undo history)

- `selectionStart`, `selectionEnd` — inclusive indices, or `null`.
- `focusedIndex` — for keyboard navigation.
- `_initialised` — guards against repeated re-init on the same mount.
- `_default` — resolved task data for the prefilled sequence.

**Why volatile**: TimeTraveller records via `onSnapshot`, which by definition excludes `.volatile(...)` fields. Sequence mutations stay in undo history; selection changes do not, matching the spec.

### 8.3 Core actions

```js
setSelection(start, end)        // clamps to bounds, sets selection
clearSelection()
toggleChipAt(idx)               // applies the click rules
extendSelectionTo(idx)          // for drag-select
deleteSelection()               // removes [start..end], clears selection
duplicateSelection()            // inserts copies after originals, selects copies
moveChip(fromIdx, toIdx)        // for reorder
resetToSource()                 // restores defaultItems || sourceItems
_persist()                      // pushes sequence into result.value
_initialiseFromSource()         // fresh-task init
_restoreFromResult(value)       // task-reopen restore
updateValue(store)              // resolves source/default from task
needsUpdate()                   // lifecycle entry
beforeSend()                    // ensures a result exists at submit
validateValue(value)            // honours allowEmpty
requiredModal()                 // RequiredMixin hook
```

### 8.4 Views

```js
get valueType()        // "sortablechips" — drives Result.value.sortablechips
get isRTL()            // direction === "rtl"
get sourceItems()      // normalised from _value
get defaultItems()     // normalised from _default vs sourceItems
get hasSelection()
get selectionRange()
get repetitionRuns()   // computed run boundaries for grape styling
get sequenceSnapshot()
selectedValues()       // for ClassificationBase
get holdsState()       // for RequiredMixin
```

---

## 9. Implementation notes & gotchas

### 9.1 Tag registration

`Registry.addTag("sortablechips", SortableChipsModel, HtxSortableChips)` registers the tag globally. BUT — LSF's container tags (`View`, `Collapse`, `PagedView`) maintain their own *hand-coded children allowlists* via `Types.unionArray([...])`. The tag won't render inside any of them unless explicitly added to that allowlist.

All three lists were updated:

```
web/libs/editor/src/tags/visual/View.jsx
web/libs/editor/src/tags/visual/Collapse.jsx
web/libs/editor/src/tags/object/PagedView.jsx
```

Without this, you get `ConfigurationError: Not expecting tag: sortablechips` even though `Registry.addTag` ran successfully.

### 9.2 CSS prefix system

LSF's webpack config sets `localIdentName: lsf-[local]` for `.prefix.css` files. So a CSS class `.sortable-chips__chip_selected` is rewritten to `.lsf-sortable-chips__chip_selected` in the bundled stylesheet. JSX **must** emit matching prefixed names. We use the `cn()` BEM helper from `web/libs/core/src/lib/utils/bem.tsx`:

```js
const block = cn("sortable-chips");
// ...
block.elem("chip").mod({ selected, dragging, repetition }).toClassName()
// → "lsf-sortable-chips__chip lsf-sortable-chips__chip_selected ..."
```

The earlier `lsf-` hardcoding in compound selectors caused double-prefixing (`lsf-lsf-...`) and was replaced with `&_repetition&_selected` — two `&`s in PostCSS-nested syntax expand to `.parent_repetition.parent_selected`, then css-modules prefixes both halves once.

### 9.3 DOM measurement order

```
parent.useLayoutEffect ← runs AFTER children's useLayoutEffect
```

So Chip's spawn animation effect (which applies a transform via `animate()`) runs before SortableChips' outline-position effect. If the outline effect used `getBoundingClientRect`, it would measure transformed positions. Hence the `offsetLeft`/`offsetTop` walk.

### 9.4 dnd-kit interplay

- **Item ids**: chip `_id` (matching React key) so drag state survives index shifts.
- **Conditional `style.transform`**: only attached during active drag (see § 5.5).
- **Gesture routing**: pointerdown stored in `gestureRef`. On `pointermove`, after threshold, we decide: vertical → hand off to dnd-kit's listener; horizontal → start selection drag. Selection's `onSelectStart` only fires after the gesture is confirmed.

### 9.5 Result type registration

`Result.js` was extended with:

```js
const resultTypes = [..., "sortablechips"];
const resultValues = { ..., sortablechips: types.frozen() };
```

`types.frozen()` matches the precedent set by `taxonomy` (an array of mixed-shape objects). The control's `valueType` getter returns `"sortablechips"`, which is what `Result.value[valueType]` reads from / writes to.

### 9.6 Z-index stacking

| Layer | z-index | Element |
|---|---|---|
| 0 (default) | — | row, container background |
| 1 | chip | base chip layer |
| 2 | — | (reserved, free) |
| 3 | selection outline | dashed border above chips |
| 4 | legend, reset | top corners |
| 5 | floating action panel | sits above selection |
| 10 | chip · dragging | lifted above everything during reorder |

---

## 10. Out of scope (v1)

Decided not to ship in the first iteration:

- **Inline editing of `display` values**. Chips are immutable — the whole point is constraining to a closed vocabulary.
- **Non-contiguous selection**. The spec says contiguous; the UX is simpler.
- **Drag-to-place duplication**. Click-to-duplicate-in-place is sufficient; drag-duplicate adds ambiguity with reorder drag.
- **Insertions of net-new items not in the source**. Handled by the off-prompt-flag pattern in the example config (see § 11).
- **Palette of unused source items**. The "always-prefilled, no palette" decision means the annotator works in place; no separate UI surface for source-not-yet-used items.
- **Time-aligned segmentation (audio region linking)**. Could be a future enhancement.
- **Joiner SVGs between adjacent duplicates**. We prototyped them; the user preferred the simpler "grape colour, no joiner" treatment.

---

## 11. Example: Quranic ASR transcript correction

The motivating use case. The prompt ayah is known; the annotator confirms (zero clicks if the recitation matched) or marks repetitions. Off-prompt recitations are flagged via an external `Choices` and the chip sequence is ignored for those by downstream code.

**`config.xml`** (RTL, IBM Plex Sans Arabic):

```xml
<View>
  <Style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@100;200;300;400;500;600;700&display=swap');
    .root * { font-family: 'IBM Plex Sans Arabic', sans-serif !important; direction: rtl; }
    .bold { font-weight: 700 !important; }
  </Style>
  <View className="root">
    <Header value="الاية الاصلية" />
    <Text name="ayah_display" value="$ayah_text" />
    <SortableChips
      name="transcript"
      toName="ayah_display"
      source="$ayah_words"
      default="$default_sequence"
      direction="rtl"
      required="true"
    />
    <View className="cols">
      <View className="flex1">
        <Text name="quality_label" value="جودة التسجيل" className="bold" />
        <Choices name="quality" toName="quality_label" choice="single">
          <Choice value="الصوت نظيف" />
          <Choice value="هناك ضوضاء فى الخلفية" />
          <Choice value="لا يمكن تمييز الكلام" />
          <Choice value="الصوت يحتوى على اية مختلفة" />
        </Choices>
      </View>
    </View>
  </View>
</View>
```

**`tasks.json`**:

```json
[
  {
    "data": {
      "ayah_text": "قل يا عبادي الذين أسرفوا على أنفسهم لا تقنطوا من رحمة الله",
      "ayah_words": ["قل","يا عبادي","الذين","أسرفوا","على","أنفسهم","لا","تقنطوا","من","رحمة","الله"],
      "default_sequence": [0, 1, 2, 3, 4, 5, 6, 7, 6, 7, 8, 9, 10]
    },
    "predictions": []
  }
]
```

The default sequence repeats `لا تقنطوا` — the reciter said it twice. The duplicate pair renders in grape immediately on task open; the rest in white. Reset returns to this exact prefilled state.

---

## 12. Dev / inspection cheat sheet

**Run the LSF playground:**

```bash
cd web
yarn lsf:serve         # http://localhost:3000
```

**Edit the example** to test changes:

```
web/libs/editor/src/examples/sortablechips/
├── config.xml            ← labelling config
├── tasks.json            ← task data
├── annotations/0.json    ← prefilled annotation stub
└── index.js              ← bundles all three
```

Swapped into the playground via `web/libs/editor/src/env/development.js`:

```js
import { SortableChipsExample } from "../examples/sortablechips";
const data = SortableChipsExample;
```

**Inspect the live MST store** from the browser console:

```js
// Current serialized annotation (what would be submitted):
window.Htx.annotationStore.selected.serializeAnnotation()

// The SortableChips tag's current sequence:
window.Htx.annotationStore.selected.names.get("transcript").sequenceSnapshot

// Selection state:
window.Htx.annotationStore.selected.names.get("transcript").selectionRange
```

**Log every submission** by patching `web/libs/editor/src/env/development.js` `onSubmitAnnotation`:

```js
onSubmitAnnotation: (ls, annotation) =>
  console.log("submitted →", annotation.serializeAnnotation()),
```

**Build the Docker image** (production):

```bash
docker build -t tibyan-label-studio:sortablechips -f Dockerfile .
docker run --rm -p 8080:8080 -v $HOME/label-studio-data:/label-studio/data tibyan-label-studio:sortablechips
```

---

## 13. File map

```
web/libs/editor/src/tags/control/SortableChips/
├── SortableChips.jsx          ← MST model + HtxSortableChips view + Registry.addTag
├── Chip.jsx                   ← individual chip with gesture routing + spawn anim
├── ActionIcons.jsx            ← floating panel (duplicate / delete / clear)
├── SortableChips.prefix.css   ← all styling, BEM-named
├── utils.js                   ← normaliseSource, computeRepetitionRuns,
│                                clampSelection, nextSelectionAfterToggle, nextChipId
└── README.md                  ← you are here
```

Modified during integration (not created):

```
web/libs/editor/src/tags/control/index.js   ← re-export SortableChipsModel
web/libs/editor/src/regions/Result.js       ← added "sortablechips" to resultTypes + resultValues
web/libs/editor/src/tags/visual/View.jsx    ← added to children allowlist
web/libs/editor/src/tags/visual/Collapse.jsx
web/libs/editor/src/tags/object/PagedView.jsx
web/package.json                            ← @dnd-kit/{core,sortable,utilities}, motion
web/libs/editor/package.json
```
