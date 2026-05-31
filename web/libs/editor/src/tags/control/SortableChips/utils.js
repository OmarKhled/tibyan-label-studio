// Monotonic counter for chip ids — gives each chip entry a stable identity that
// survives index shifts (inserts, deletes, reorder). Used as the React `key` and
// as the @dnd-kit sortable item id so drag state stays attached to a specific
// chip across mutations.
let _chipIdCounter = 0;
export function nextChipId() {
  _chipIdCounter += 1;
  return `c${_chipIdCounter}`;
}

export function normaliseSource(raw) {
  if (raw == null) return [];

  let items = raw;
  if (typeof raw === "string") {
    items = raw.trim().split(/\s+/).filter(Boolean);
  }
  if (!Array.isArray(items)) return [];

  return items.map((item, sourceIndex) => {
    if (item == null) return null;
    if (typeof item === "string" || typeof item === "number") {
      const v = String(item);
      return { _id: nextChipId(), value: v, display: v, sourceIndex };
    }
    if (typeof item === "object") {
      const value = item.value != null ? String(item.value) : String(sourceIndex);
      const display = item.display != null ? String(item.display) : value;
      return { ...item, _id: nextChipId(), value, display, sourceIndex };
    }
    return null;
  }).filter(Boolean);
}

export function computeRepetitionRuns(sequence) {
  if (!sequence || sequence.length < 2) return [];

  const ids = sequence.map((c) => c?.sourceIndex);
  const n = ids.length;
  const covered = new Array(n).fill(false);
  const runs = [];

  for (let i = 1; i < n; i++) {
    if (covered[i]) continue;
    let bestLen = 0;
    for (let j = 0; j < i; j++) {
      let len = 0;
      while (
        j + len < i &&
        i + len < n &&
        ids[j + len] === ids[i + len] &&
        !covered[i + len]
      ) {
        len++;
      }
      if (len > bestLen) bestLen = len;
    }
    if (bestLen > 0) {
      runs.push({ start: i, end: i + bestLen - 1 });
      for (let k = 0; k < bestLen; k++) covered[i + k] = true;
      i += bestLen - 1;
    }
  }

  return runs;
}

export function clampSelection(start, end, length) {
  if (length === 0) return [null, null];
  if (start == null || end == null) return [null, null];
  const lo = Math.max(0, Math.min(start, end));
  const hi = Math.min(length - 1, Math.max(start, end));
  if (lo > hi) return [null, null];
  return [lo, hi];
}

export function nextSelectionAfterToggle(current, idx, length) {
  const [start, end] = current;
  if (start == null || end == null) return [idx, idx];

  if (idx === start - 1 || idx === end + 1) {
    return [Math.min(start, idx), Math.max(end, idx)];
  }
  if (idx === start && start === end) return [null, null];
  if (idx === start) return [start + 1, end];
  if (idx === end) return [start, end - 1];
  if (idx > start && idx < end) return [idx, idx];
  return [idx, idx];
}
