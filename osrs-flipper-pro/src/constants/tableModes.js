/**
 * Table Mode Constants
 * 
 * Defines the three supported table interaction modes:
 * - side: Compact scan table + right rail for deep data
 * - row: Inline expansion with 2/3 graph + 1/3 recent trades
 * - horizontal: Wide, scrollable spreadsheet with full analytics
 */

export const TABLE_MODES = {
  SIDE: 'side',
  ROW: 'expandable',
  HORIZONTAL: 'horizontal'
};

/**
 * Scan columns - the minimal set of columns allowed in restricted modes (side/row)
 * These columns are always available regardless of mode.
 */
export const SCAN_COLUMNS = new Set([
  'buy_price',
  'sell_price',
  'margin',
  'roi',
  'volume_1h',
  'limit' // Optional, but included in scan set
]);

/**
 * Mode configurations
 */
export const MODE_CONFIG = {
  [TABLE_MODES.SIDE]: {
    label: 'Side Panel',
    description: 'Compact scan table with side panel for deep data',
    allowsAllColumns: false,
    scanColumnsOnly: true
  },
  [TABLE_MODES.ROW]: {
    label: 'Expandable Rows',
    description: 'Inline expansion with graphs and recent trades',
    allowsAllColumns: false,
    scanColumnsOnly: true
  },
  [TABLE_MODES.HORIZONTAL]: {
    label: 'Horizontal',
    description: 'Wide spreadsheet with full analytics surface',
    allowsAllColumns: true,
    scanColumnsOnly: false
  }
};

/**
 * Check if a column is allowed in a given mode
 * @param {string} columnId - Column ID to check
 * @param {string} mode - Table mode
 * @returns {boolean} True if column is allowed in mode
 */
export function isColumnAllowedInMode(columnId, mode) {
  if (mode === TABLE_MODES.HORIZONTAL) {
    return true; // All columns allowed in horizontal mode
  }
  
  // In restricted modes (side/row), only scan columns are allowed
  return SCAN_COLUMNS.has(columnId);
}

/**
 * Get the default sort column for a mode
 * @param {string} mode - Table mode
 * @returns {string} Default sort column ID
 */
export function getDefaultSortForMode(mode) {
  return 'margin'; // Same default for all modes
}

/**
 * Check if a sort column is valid for a given mode
 * @param {string} sortBy - Sort column ID
 * @param {string} mode - Table mode
 * @returns {boolean} True if sort is valid for mode
 */
export function isSortValidForMode(sortBy, mode) {
  if (mode === TABLE_MODES.HORIZONTAL) {
    return true; // All sorts allowed in horizontal mode
  }
  
  // In restricted modes, only scan columns can be sorted
  return SCAN_COLUMNS.has(sortBy);
}

