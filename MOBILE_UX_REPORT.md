# Mobile Portrait UX Test Report - Browse Items Page

## Test Environment
- **Viewports Tested**: 375×812 (iPhone 12/13/14), 430×932 (iPhone 14 Pro Max / Large Android)
- **Breakpoint**: 768px (mobile detection)
- **Date**: 2025-12-01

---

## 1. What Feels Bad Right Now on Portrait Mobile

### 🔴 Critical Issues

1. **Permanent Sidebar Takes Up 30% of Screen Width**
   - 220px fixed-width sidebar on a 375px screen = 58% of available width
   - Only ~155px remaining for main content
   - Makes the entire app feel cramped and unusable

2. **Content Area Too Narrow**
   - Main content area becomes extremely narrow (155px on iPhone 12)
   - Text gets cut off or requires horizontal scrolling
   - Cards/table content feels squished

3. **Search Bar + Controls Cramped**
   - Search input, view selector, and action buttons compete for limited horizontal space
   - View selector buttons are too small for touch targets
   - "Add Columns" and "Add Filters" buttons likely overflow or wrap awkwardly

4. **Nested Scroll Containers**
   - App container has `overflowX: "hidden"` but content inside may scroll
   - Sidebar is permanent and doesn't scroll independently
   - Main content area has its own scroll
   - Can create confusing scroll behavior

5. **Pagination Placement**
   - Pagination sits at bottom but may be cut off or require scrolling
   - Not sticky, so users must scroll to bottom to change pages
   - Takes up vertical space that's already limited

### 🟡 Moderate Issues

6. **Side Panel Fullscreen Implementation**
   - Side panel becomes fullscreen on mobile (good)
   - But the permanent sidebar still visible underneath (bad)
   - Back button exists but sidebar remains visible

7. **Touch Targets Too Small**
   - View selector buttons are icon-only and small
   - Action buttons may be below recommended 44×44px touch target size
   - Navigation items in sidebar may be too small

8. **No Horizontal Scrolling Prevention**
   - Table/card content might cause accidental horizontal scroll
   - No clear indication of scroll boundaries

---

## 2. What Is Technically Causing It

### Root Causes

1. **Permanent Sidebar (App.js)**
   ```javascript
   <Drawer variant="permanent" sx={{ width: drawerWidth }} />
   ```
   - `drawerWidth = 220px` (fixed)
   - `variant="permanent"` means it's always visible
   - No mobile-specific behavior or responsive width
   - No `display: none` or `position: fixed` overlay on mobile

2. **Fixed Widths Throughout**
   - Sidebar: `220px` (no responsive breakpoint)
   - Main content: `flex: 1` but constrained by sidebar
   - Search container: likely has fixed/min-widths
   - View selector buttons: fixed small sizes

3. **No Mobile-Specific Layout**
   - `BrowseItemsPage` uses `isMobile` hook but doesn't adjust for sidebar
   - Sidebar width not subtracted from available space
   - Main content assumes full width minus sidebar, but sidebar is too wide

4. **Scroll Container Hierarchy**
   ```javascript
   // App.js
   <Box sx={{ overflowX: "hidden" }}>  // Outer container
     <Drawer />  // Permanent sidebar
     <Box component="main">  // Main content
       <BrowseItemsPage>  // Has its own scroll
   ```
   - Multiple nested scroll containers
   - Sidebar doesn't scroll independently
   - Main content scrolls but sidebar doesn't

5. **Search Container Layout**
   - Search input + view selector + action buttons in horizontal flex
   - No wrapping or stacking on mobile
   - Fixed button sizes don't adapt

---

## 3. Which Parts Are Clearly "Desktop-Only Patterns"

### Desktop-Only Elements

1. **Permanent Left Sidebar**
   - ✅ Desktop: Permanent sidebar is standard and useful
   - ❌ Mobile: Takes up too much space, should be collapsible/overlay

2. **Horizontal Table Layout**
   - ✅ Desktop: Wide table with many columns works
   - ❌ Mobile: Replaced with cards (good), but table mode still exists

3. **Multiple View Modes Visible**
   - ✅ Desktop: Side Panel, Expandable Rows, Horizontal modes all visible
   - ❌ Mobile: Only Side Panel mode should be available (already implemented)

4. **Inline Action Buttons**
   - ✅ Desktop: "Add Columns", "Add Filters" buttons inline with search
   - ❌ Mobile: Should be in menu or stacked vertically

5. **Dense Information Display**
   - ✅ Desktop: Many columns, compact spacing
   - ❌ Mobile: Cards are better, but still might be too dense

6. **Pagination at Bottom (Non-Sticky)**
   - ✅ Desktop: Works fine, users can scroll
   - ❌ Mobile: Should be sticky or more accessible

---

## 4. Suggestions for Mobile Improvements

### 🎯 High Priority (Must Fix)

1. **Collapsible/Overlay Sidebar on Mobile**
   - Convert permanent sidebar to `variant="temporary"` or `variant="persistent"` on mobile
   - Add hamburger menu button to open/close
   - Use `position: fixed` overlay when open
   - Hide sidebar by default on mobile, show on tap

2. **Full-Width Content Area on Mobile**
   - When sidebar is closed, main content should use 100% width
   - Adjust `BrowseItemsPage` padding/margins for mobile
   - Ensure cards use full available width

3. **Stack Search Controls Vertically on Mobile**
   - Search input: full width, top
   - View selector: hide on mobile (already forced to "side" mode)
   - Action buttons: stack vertically or move to menu

4. **Remove Nested Scroll Containers**
   - Single main scroll container
   - Sidebar should scroll independently if needed
   - Prevent horizontal scrolling

### 🟡 Medium Priority (Should Fix)

5. **Sticky Pagination on Mobile**
   - Make pagination sticky at bottom of viewport
   - Or add floating action button for "Next/Previous Page"
   - Reduce pagination height/padding

6. **Larger Touch Targets**
   - Minimum 44×44px for all interactive elements
   - Increase button padding on mobile
   - Add more spacing between cards

7. **Optimize Card Layout**
   - Ensure cards use full width (minus padding)
   - Increase card padding for better touch targets
   - Consider swipe gestures for actions

8. **Side Panel Back Button Enhancement**
   - Ensure back button closes side panel properly
   - Hide sidebar when side panel is open
   - Smooth transitions

### 🟢 Low Priority (Nice to Have)

9. **Horizontal Scrollable Granularity Selector**
   - Already implemented in charts
   - Ensure it works smoothly on touch

10. **Pull-to-Refresh**
    - Add pull-to-refresh gesture for item list
    - Native mobile pattern

11. **Bottom Navigation Bar**
    - Consider bottom nav for main navigation on mobile
    - More thumb-friendly than left sidebar

12. **Optimize Typography**
    - Slightly larger font sizes on mobile
    - Better line-height for readability

---

## 5. Technical Implementation Notes

### Current Mobile Detection
- Hook: `useMobile()` - detects `window.innerWidth < 768px`
- Used in: `BrowseItemsPage`, `SidePanel`, `ExpandedRowContent`, `PriceChart`, `AdvancedMetrics`
- **Issue**: Sidebar in `App.js` doesn't use this hook

### Recommended Changes

1. **App.js Sidebar**
   ```javascript
   const isMobile = useMobile();
   <Drawer 
     variant={isMobile ? "temporary" : "permanent"}
     open={isMobile ? sidebarOpen : true}
     onClose={() => setSidebarOpen(false)}
   />
   ```

2. **BrowseItemsPage Layout**
   - Adjust padding: `padding: isMobile ? "1rem" : "2rem 2rem 0.75rem 2rem"`
   - Full width search: `width: isMobile ? "100%" : "auto"`

3. **Search Container**
   - Stack vertically on mobile
   - Hide view selector (already done)
   - Move action buttons to menu or stack

---

## Summary

**Main Problem**: The permanent 220px sidebar consumes 58% of mobile screen width, leaving only 155px for content. This makes the entire app feel cramped and unusable.

**Solution**: Convert sidebar to temporary/overlay on mobile, giving content 100% width. Stack controls vertically, increase touch targets, and optimize spacing.

**Priority**: Fix sidebar first (highest impact), then optimize layout and controls.

