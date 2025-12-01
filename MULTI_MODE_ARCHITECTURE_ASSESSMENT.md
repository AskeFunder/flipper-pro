# Multi-Mode Table Architecture Assessment
## Executive Technical Review for FlipperPro

---

## 🎯 Executive Summary

**Architecture Soundness: ✅ SOUND** - Current codebase is well-structured for mode-aware columns with minimal refactoring.

**Risk Level: ⚠️ LOW-MEDIUM** - Main risks are performance (mitigatable) and user experience confusion (manageable).

**Recommended Path: Option A (Shared State + Mode Filtering)** - Safest, simplest, most maintainable.

---

## 1️⃣ Architecture Soundness Check

### ✅ Current Architecture Analysis

**Column System Structure:**
```
constants/column.js (allColumns array)
    ↓
BrowseItemsPage.jsx (loads from localStorage, manages state)
    ↓
ColumnPicker.jsx (UI for toggling visibility)
    ↓
BrowseTable.jsx (receives visibleColumns, renders headers)
    ↓
BrowseTableRow.jsx (receives visibleColumns, renders cells)
```

**Key Architectural Strengths:**
1. ✅ **Separation of Concerns**: Column config → state → UI → rendering (clean layers)
2. ✅ **Single Source of Truth**: `allColumns` constant defines available columns
3. ✅ **State Decoupling**: Column visibility is separate from rendering logic
4. ✅ **Backend Independence**: Sorting/filtering work regardless of visible columns

**Architectural Weaknesses (Minor):**
1. ⚠️ **Tight Coupling**: `BrowseTable` assumes all visible columns are sortable
2. ⚠️ **No Mode Concept**: Current architecture doesn't have a "mode" abstraction

### ✅ Feasibility Assessment

**Is mode-aware column logic feasible?**

**YES - Highly Feasible**

**Why:**
- Column visibility is already a **filter** operation (`columnSettings.filter(c => c.visible)`)
- Adding mode-based filtering is a **natural extension** of existing pattern
- No architectural changes needed - just add another filter layer

**Code Pattern (Current):**
```javascript
// BrowseItemsPage.jsx line 270
const visible = columnSettings.filter((c) => c.visible);
```

**Code Pattern (With Mode):**
```javascript
const visible = columnSettings
  .filter((c) => c.visible)
  .filter((c) => isColumnAllowedInMode(c.id, tableMode));
```

**Architectural Impact: MINIMAL** - Just adding a filter function.

---

## 2️⃣ Risk Assessment by Component

### 🔴 HIGH RISK Areas

**None identified** - All changes are additive/extensional, not breaking.

### ⚠️ MEDIUM RISK Areas

#### 1. Column Picker UX Confusion

**Risk:** Users toggle columns in Column Picker that won't appear in restricted modes.

**Impact:**
- User enables `trend_24h` in Column Picker
- Switches to Side Panel mode
- Column doesn't appear (filtered out)
- User thinks Column Picker is broken

**Mitigation:**
- **Option A**: Show all columns in picker, but disable/grey-out restricted ones in non-horizontal modes
- **Option B**: Show only allowed columns in picker when in restricted mode
- **Recommendation**: Option B (cleaner UX, less confusion)

**Code Location:**
- `ColumnPicker.jsx` - Add mode-aware column filtering

**Risk Level: ⚠️ MEDIUM** (UX confusion, not technical failure)

#### 2. Performance with Expanded Rows

**Risk:** 10+ expanded rows with graphs/trades/metrics = performance degradation.

**Impact:**
- Initial render: 2-3 seconds (vs <500ms currently)
- Scroll jank: 60fps → 30fps
- Memory: 50-100MB increase

**Mitigation:**
- **Required**: Lazy mount expanded content (only render when expanded)
- **Optional**: Virtual scrolling for 200+ items (not needed yet)

**Code Location:**
- `BrowseTableRow.jsx` - Conditional rendering for expanded content

**Risk Level: ⚠️ MEDIUM** (Mitigatable with lazy mounting)

#### 3. Sort State Persistence

**Risk:** User sorts by `trend_24h` in horizontal, switches to side panel, sort still active but column hidden.

**Impact:**
- Confusing UX (sort indicator not visible)
- Data still sorted correctly, but user doesn't know why

**Mitigation:**
- Reset sort to default (`margin desc`) when switching to restricted mode if current sort is invalid
- Or: Show sort indicator even if column hidden (less ideal)

**Code Location:**
- `BrowseItemsPage.jsx` - `useEffect` watching `tableMode` changes

**Risk Level: ⚠️ MEDIUM** (UX issue, not breaking)

### ✅ LOW RISK Areas

#### 1. localStorage Persistence

**Risk:** Corrupting user presets during migration.

**Mitigation:**
- **Option A**: No migration needed (use existing structure)
- **Option B**: Migration script with validation and rollback

**Recommendation:** Option A eliminates this risk entirely.

**Risk Level: ✅ LOW** (Option A) or ⚠️ MEDIUM (Option B)

#### 2. Backend Sort Validation

**Risk:** Frontend restricts sorts, but backend accepts them.

**Impact:** None - Backend validation is safety net.

**Risk Level: ✅ VERY LOW** - Backend handles invalid sorts gracefully

#### 3. Navigation Logic

**Risk:** Mode-aware onClick handler becomes complex.

**Mitigation:**
- Keep handler simple (delegate to mode-specific callbacks)
- Extract mode logic to separate functions

**Risk Level: ✅ LOW** - Clean separation possible

---

## 3️⃣ Where This Could Blow Up Later

### 🧨 Failure Point 1: State Drift Between Modes

**Scenario:**
- User configures columns in Horizontal mode
- Switches to Side Panel mode
- Columns are filtered, but user doesn't understand why
- User thinks app is broken

**Prevention:**
- Clear visual indicators of mode restrictions
- Tooltip/help text explaining mode limitations
- Option to "save mode-specific preset" if user wants different configs

**Code Location:**
- `ColumnPicker.jsx` - Add mode indicator and restricted column messaging

### 🧨 Failure Point 2: Performance Degradation Over Time

**Scenario:**
- Initial implementation works fine (lazy mounting)
- Later, someone adds heavy computation to expanded rows
- Performance degrades, but lazy mounting mask isn't enough
- Need virtual scrolling, but architecture doesn't support it easily

**Prevention:**
- Document performance requirements (max expanded rows, max DOM nodes)
- Add performance monitoring
- Design expanded row content to be lightweight

**Code Location:**
- `BrowseTableRow.jsx` - Keep expanded content lightweight
- Add performance monitoring hooks

### 🧨 Failure Point 3: Mode State Management Complexity

**Scenario:**
- Start with 3 modes (horizontal, side, expandable)
- Later add more modes (compact, detailed, etc.)
- Mode logic scattered across multiple components
- Hard to maintain, easy to introduce bugs

**Prevention:**
- Centralize mode logic in a custom hook: `useTableMode()`
- Define mode behavior in a configuration object
- Use TypeScript (if available) for mode type safety

**Code Location:**
- Create `hooks/useTableMode.js` - Centralize mode logic
- Create `constants/tableModes.js` - Define mode configurations

### 🧨 Failure Point 4: Column Picker Preset Migration

**Scenario:**
- User has saved presets in old format
- Later decide to add per-mode presets
- Need to migrate old presets
- Risk of data loss or corruption

**Prevention:**
- **Option A**: Never migrate - keep shared presets forever
- **Option B**: Migration script with validation, backup, rollback
- **Recommendation**: Option A, or add per-mode presets as optional feature (don't migrate)

**Code Location:**
- `ColumnPicker.jsx` - Preset save/load logic

### 🧨 Failure Point 5: Backend API Changes

**Scenario:**
- Frontend restricts columns per mode
- Backend adds new sortable columns
- Frontend doesn't know about them
- Users can't sort by new columns in restricted modes (even if they should be allowed)

**Prevention:**
- Keep scan column list in sync with backend capabilities
- Or: Fetch available columns from backend (more complex)
- Document scan column requirements

**Code Location:**
- `constants/column.js` - Keep scan columns list updated
- `routes/browse.js` - Document sortable columns

---

## 4️⃣ Cleanest Implementation Path

### Phase 1: Foundation (Low Risk)

**Goal:** Add mode concept without breaking existing functionality.

**Steps:**
1. Create `constants/tableModes.js` - Define mode configurations
2. Create `hooks/useTableMode.js` - Centralize mode state management
3. Add mode selector UI (toggle/buttons)
4. **No column changes yet** - Just add mode state

**Risk: ✅ VERY LOW** - Additive only, no existing code changes

**Time: 1-2 hours**

### Phase 2: Column Filtering (Low Risk)

**Goal:** Filter columns based on mode at render time.

**Steps:**
1. Add `getVisibleColumnsForMode()` function
2. Update `BrowseTable` to use mode-filtered columns
3. Update `ColumnPicker` to show only allowed columns in restricted modes
4. Add visual indicators (tooltips, disabled state)

**Risk: ✅ LOW** - Filtering is additive, existing code still works

**Time: 2-3 hours**

### Phase 3: Sort Validation (Low Risk)

**Goal:** Prevent sorting by restricted columns.

**Steps:**
1. Add `getSortableColumnsForMode()` function
2. Update `BrowseTable` to only show sortable headers
3. Add `useEffect` to reset invalid sorts when switching modes
4. Test sort persistence across mode switches

**Risk: ✅ LOW** - Backend validation is safety net

**Time: 1-2 hours**

### Phase 4: Navigation Logic (Low Risk)

**Goal:** Mode-aware row click handlers.

**Steps:**
1. Add mode-specific callback props (`onSidePanelOpen`, `onRowExpand`)
2. Update `BrowseTableRow` with mode-aware `handleRowClick`
3. Add side panel state management
4. Add expandable row state management

**Risk: ✅ LOW** - Clean separation, no routing conflicts

**Time: 2-3 hours**

### Phase 5: Performance Optimization (Medium Risk)

**Goal:** Lazy mount heavy content.

**Steps:**
1. Add conditional rendering for expanded row content
2. Add conditional rendering for side panel content
3. Add loading states/skeletons
4. Performance testing (measure render times, scroll FPS)

**Risk: ⚠️ MEDIUM** - Performance is critical, needs testing

**Time: 3-4 hours**

### Phase 6: Polish & Testing (Low Risk)

**Goal:** UX improvements and comprehensive testing.

**Steps:**
1. Add keyboard navigation (Enter/Space for row actions)
2. Add ARIA attributes for accessibility
3. Add visual mode indicators
4. Test all mode transitions
5. Test column picker in all modes
6. Test sort/filter persistence

**Risk: ✅ LOW** - Polish only, no core logic changes

**Time: 2-3 hours**

---

## 5️⃣ Recommended Implementation Strategy

### ✅ Option A: Shared State + Mode Filtering (RECOMMENDED)

**Why:**
1. **Lowest Risk** - No data migration, preserves user preferences
2. **Simplest** - Minimal code changes, easy to understand
3. **Flexible** - Can add per-mode presets later without breaking changes
4. **Maintainable** - Single source of truth for column state

**Implementation:**
```javascript
// Single localStorage key (unchanged)
"osrs-flipper-column-settings": [...columns...]

// Filter at render time based on mode
const visibleColumns = useMemo(() => {
  const allVisible = columnSettings.filter(c => c.visible);
  if (mode === 'horizontal') return allVisible;
  return allVisible.filter(c => SCAN_COLUMNS.has(c.id));
}, [columnSettings, mode]);
```

**Migration Required:** ❌ None

**Risk Level:** ✅ LOW

### ⚠️ Option B: Per-Mode State (NOT RECOMMENDED)

**Why Not:**
1. **Higher Risk** - Requires data migration, risk of data loss
2. **More Complex** - Multiple state sources, harder to maintain
3. **User Confusion** - Users lose existing preferences during migration
4. **Over-Engineering** - Solves a problem that doesn't exist yet

**Only Consider If:**
- Users explicitly request per-mode presets
- UX research shows shared state is confusing
- Can be added later as optional feature

---

## 6️⃣ Critical Design Decisions

### Decision 1: Column Picker Behavior in Restricted Modes

**Option A:** Show all columns, but disable/grey-out restricted ones
- ✅ Users see what's available
- ⚠️ Can be confusing (why disabled?)

**Option B:** Show only allowed columns
- ✅ Cleaner UX
- ⚠️ Users might not know other columns exist

**Recommendation: Option B with "Show all columns" toggle**

### Decision 2: Sort Reset Behavior

**Option A:** Reset to default when switching to restricted mode if sort is invalid
- ✅ Clear UX
- ⚠️ Loses user's sort preference

**Option B:** Keep sort active, but don't show indicator
- ✅ Preserves user preference
- ⚠️ Confusing (sort active but not visible)

**Recommendation: Option A with user notification**

### Decision 3: Mode Persistence

**Option A:** Persist mode in localStorage
- ✅ Remembers user preference
- ⚠️ Need migration if mode names change

**Option B:** Mode in URL query param
- ✅ Shareable/bookmarkable
- ⚠️ URL gets longer

**Recommendation: Option A (localStorage) with URL param as fallback**

---

## 7️⃣ Testing Checklist

### Unit Tests
- [ ] Mode filtering function (all modes, all column types)
- [ ] Sort validation (invalid sorts reset correctly)
- [ ] Column picker (shows/hides columns based on mode)
- [ ] Navigation handlers (correct action per mode)

### Integration Tests
- [ ] Mode switch preserves column visibility where possible
- [ ] Mode switch resets invalid sorts
- [ ] Column picker saves/loads presets correctly
- [ ] Side panel opens/closes correctly
- [ ] Expandable rows expand/collapse correctly

### Performance Tests
- [ ] Initial render <500ms (50 items)
- [ ] Mode switch <200ms
- [ ] Scroll 60fps with 10 expanded rows
- [ ] Memory usage <100MB with 50 items, 10 expanded

### UX Tests
- [ ] Column picker is clear in all modes
- [ ] Sort indicators are visible when applicable
- [ ] Mode restrictions are communicated to user
- [ ] Keyboard navigation works
- [ ] Screen reader compatible (ARIA)

---

## 8️⃣ Final Recommendations

### ✅ Proceed with Implementation

**Confidence Level: HIGH**

**Rationale:**
1. Architecture is sound - changes are additive/extensional
2. Risks are manageable - all have clear mitigations
3. Implementation path is clear - phased approach reduces risk
4. Performance concerns are addressable - lazy mounting solves them

### 🎯 Critical Success Factors

1. **Lazy Mounting** - Must implement from start (not optional)
2. **Mode Centralization** - Use custom hook to avoid scattered logic
3. **User Communication** - Clear indicators of mode restrictions
4. **Performance Monitoring** - Measure and optimize as you go

### ⚠️ Red Flags to Watch For

1. **Performance Degradation** - If render times exceed 1s, investigate
2. **State Drift** - If modes get out of sync, centralize logic
3. **User Confusion** - If users report "broken" column picker, improve UX
4. **Code Complexity** - If mode logic spreads across many files, refactor

### 📋 Implementation Order

1. **Foundation** (Phase 1) - Add mode concept
2. **Column Filtering** (Phase 2) - Core functionality
3. **Sort Validation** (Phase 3) - Prevent confusion
4. **Navigation** (Phase 4) - Enable mode-specific actions
5. **Performance** (Phase 5) - Optimize rendering
6. **Polish** (Phase 6) - UX improvements

**Total Estimated Time: 11-17 hours**

---

## Conclusion

**Architecture Soundness: ✅ SOUND**

The current FlipperPro codebase is well-structured for mode-aware columns. The column system is already decoupled from rendering, making mode filtering a natural extension.

**Risk Level: ⚠️ LOW-MEDIUM**

Main risks are UX confusion (manageable with clear indicators) and performance (mitigatable with lazy mounting). No breaking architectural risks identified.

**Recommended Path: Option A (Shared State + Mode Filtering)**

Safest, simplest, most maintainable. Can be enhanced with per-mode presets later if needed, without breaking changes.

**Confidence: HIGH** - Proceed with implementation.

