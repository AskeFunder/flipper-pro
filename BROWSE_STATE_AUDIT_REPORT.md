# 🔍 BROWSE-STATE AUDIT RAPPORT

## ✅ OPGAVE 1 — AKTUEL BROWSE-STATE (BrowseItemsPage.jsx)

### useState Hooks:

- **`items`** (default: `[]`)
  - Type: Array
  - Source: API fetch response
  
- **`sortBy`** (default: `"margin"`)
  - Type: String
  - Source: Hardcoded default
  
- **`order`** (default: `"desc"`)
  - Type: String ("asc" | "desc")
  - Source: Hardcoded default
  
- **`loading`** (default: `false`)
  - Type: Boolean
  - Source: Hardcoded default
  
- **`columnSettings`** (default: `allColumns`)
  - Type: Array of column objects
  - Source: localStorage (`COLUMN_SETTINGS_STORAGE_KEY`) eller `allColumns` fallback
  - Initialiseres med lazy initializer function
  
- **`showColumnPicker`** (default: `false`)
  - Type: Boolean
  - Source: Hardcoded default
  
- **`showFilterBuilder`** (default: `false`)
  - Type: Boolean
  - Source: Hardcoded default
  
- **`filters`** (default: `{}`)
  - Type: Object
  - Source: localStorage (`FILTERS_STORAGE_KEY`) eller empty object fallback
  - Initialiseres med lazy initializer function
  
- **`currentPage`** (default: `1`)
  - Type: Number
  - Source: Hardcoded default
  
- **`totalPages`** (default: `1`)
  - Type: Number
  - Source: API fetch response
  
- **`totalRows`** (default: `0`)
  - Type: Number
  - Source: API fetch response

### Props (fra App.js):

- **`searchQuery`** (default: `""`)
  - Type: String
  - Source: Props fra `App.js` (`browseSearchQuery` state)
  
- **`onSearchQueryChange`** (default: `undefined`)
  - Type: Function
  - Source: Props fra `App.js` (`setBrowseSearchQuery`)
  
- **`isSearchFromSearchBar`** (default: `false`)
  - Type: Boolean
  - Source: Props fra `App.js`
  
- **`onSearchFromSearchBarChange`** (default: `undefined`)
  - Type: Function
  - Source: Props fra `App.js` (`setIsSearchFromSearchBar`)
  
- **`onItemClick`** (default: `undefined`)
  - Type: Function
  - Source: Props fra `App.js` (`handleItemClick`)

### Handlers der ændrer state:

- **`toggleColumn(id)`**
  - Ændrer: `columnSettings`
  - Side effects: Fjerner filters for hidden columns, resetter sort hvis sorteret efter hidden column
  
- **`handleFilterChange(field, value)`**
  - Ændrer: `filters`, `currentPage` (reset til 1), `isSearchFromSearchBar` (hvis sat)
  
- **`setSortBy(col)` + `setOrder(prev => ...)`**
  - Kaldt fra: `onSort` callback i BrowseTable
  - Ændrer: `sortBy`, `order`
  - Side effects: Resetter `currentPage` til 1 (via useEffect)
  
- **`setCurrentPage(page)`**
  - Kaldt fra: Pagination buttons
  - Ændrer: `currentPage`
  
- **Search input onChange**
  - Ændrer: `searchQuery` (via prop callback)
  - Side effects: Disabler `isSearchFromSearchBar` flag, resetter `currentPage` til 1 (via useEffect)

---

## ✅ OPGAVE 2 — HVORDAN API-FETCH TRIGGES

### Fetch trigger:

**Location:** `BrowseItemsPage.jsx` linje 78-116

**useEffect dependency array:**
```javascript
[searchQuery, sortBy, order, filters, columnSettings, currentPage, isSearchFromSearchBar]
```

**Fetch URL:**
```javascript
const API_URL = `/api/items/browse`;
const fetchUrl = `${API_URL}?${q.toString()}`;
```

**Query params bygget:**
```javascript
const q = new URLSearchParams({
    page: currentPage,
    pageSize: 50,
    sortBy,
    order,
    search: searchQuery,
    ...(isSearchFromSearchBar ? {} : filters),  // Filters kun hvis IKKE fra searchbar
});
```

**Fetch kaldes:**
```javascript
apiFetchJson(fetchUrl, { signal: controller.signal })
```

**Side notes:**
- Bruger `AbortController` til at annullere tidligere requests
- `columnSettings` er i dependency array men bruges IKKE direkte i query params (kan være dead dependency)

---

## ✅ OPGAVE 3 — NAVIGATION TIL ITEMDETAIL

### Navigation til /item/:id:

**Location:** `App.js` linje 64-67

**Handler:**
```javascript
const handleItemClick = (itemId, itemName) => {
    const slug = nameToSlug(itemName);
    navigate(`/item/${itemId}-${encodeURIComponent(slug)}`);
};
```

**Kaldt fra:**
- `BrowseTable.jsx` linje 107: `onClick={() => onItemClick && onItemClick(item.id, item.name)}`
- `SearchBar.jsx` linje 104: `onItemClick(item.id, item.name)`

**Navigation method:**
- ✅ Bruger `navigate(...)` fra `react-router-dom`
- ❌ Bruger IKKE `<Link to={...}>` komponent
- ❌ Bruger IKKE `{ replace: true }` option (bruger push navigation = tilføjer til history)

**Route definition:**
- `App.js` linje 190: `<Route path="/item/:itemId" element={<ItemDetailPage />} />`

---

## ✅ OPGAVE 4 — PAGINATION-KOMPONENT

### Pagination håndtering:

**Komponent:** Inline pagination UI i `BrowseItemsPage.jsx` (linje 334-404)

**Page source:**
- ❌ IKKE fra props
- ✅ Fra lokal state: `currentPage` (useState)

**Side-skift kommunikation:**
- Direct state update: `setCurrentPage(page)` 
- Kaldt fra: onClick handlers på pagination buttons
- Ingen callback til parent component

**Pagination UI indeholder:**
- "First" button (linje 337-344)
- "Previous" button (linje 345-352)
- Page number buttons (linje 360-385) - viser op til 5 sider
- "Next" button (linje 387-394)
- "Last" button (linje 395-402)
- Page info display (linje 354-357)

**Page reset triggers:**
- `useEffect` (linje 213-215) resetter `currentPage` til 1 når:
  - `searchQuery` ændres
  - `sortBy` ændres
  - `order` ændres
- `handleFilterChange` (linje 208) resetter til 1 når filters ændres

---

## ✅ OPGAVE 5 — SEARCH-FLOW

### Search state location:

**Primary search state:**
- ✅ Lever i `App.js`: `browseSearchQuery` (useState)
- ✅ Passes som prop til `BrowseItemsPage`: `searchQuery`

**SearchBar component:**
- `SearchBar.jsx` har egen lokal state: `query` (linje 34)
- `SearchBar.jsx` kalder `onSearch(query)` callback til parent (linje 114)

**Search flow:**

1. **Fra SearchBar:**
   - User types → lokal `query` state opdateres
   - User presses Enter → `onSearch(query.trim())` kaldes
   - `App.js` opdaterer `browseSearchQuery` og `isSearchFromSearchBar`

2. **Fra BrowseItemsPage search input:**
   - User types → `onSearchQueryChange(e.target.value)` kaldes
   - `App.js` opdaterer `browseSearchQuery`
   - `isSearchFromSearchBar` flag disables

3. **Til API:**
   - `searchQuery` (fra props) inkluderes i fetch URL params
   - Hvis `isSearchFromSearchBar === true`: Filters ignoreres (filterless search)
   - Hvis `isSearchFromSearchBar === false`: Filters inkluderes

**Search state sendes til API:**
- Via `URLSearchParams` som `search` parameter (linje 89 i BrowseItemsPage.jsx)

---

## ✅ OPGAVE 6 — NY FANE / LINK-PROBLEM (KRITISK UX-BUG)

### Browse items rendering:

**Location:** `BrowseTable.jsx` linje 100-170

**Hvordan items rendres:**
- ✅ `<tr>` elementer (table rows)
- ❌ IKKE `<a>` links
- ✅ `<div>` elementer (for item icon + name)

**Navigation implementation:**
```javascript
<tr 
    key={item.id} 
    style={rowStyle}
    onClick={() => onItemClick && onItemClick(item.id, item.name)}
    className="browse-table-row"
>
```

**Problemer identificeret:**
- ❌ **Ctrl/Cmd-klik virker IKKE** - Ingen `<a>` element, så browseren kan ikke åbne i ny fane
- ❌ **Højreklik → "Åbn i ny fane" virker IKKE** - Ingen `<a>` element, så context menu viser ikke link-optioner
- ❌ **Ingen href attribute** - Browseren kan ikke se det som et link
- ✅ **onClick handler eksisterer** - Navigation virker ved normal klik
- ❌ **Ingen `event.preventDefault()`** - Ikke nødvendig da der ikke er `<a>` links

**CSS styling:**
- `rowStyle` (linje 201-205) har `cursor: "pointer"` - viser at det er klikbart, men ikke et rigtigt link

**Current navigation flow:**
1. User klikker på `<tr>` element
2. `onClick` handler kalder `onItemClick(item.id, item.name)`
3. `App.js` `handleItemClick` kalder `navigate()`
4. React Router navigerer til `/item/:itemId`

---

## 📋 SUMMARY

### BrowseItemsPage.jsx State:

- **useState hooks:**
  - `sortBy` (default: "margin")
  - `order` (default: "desc")
  - `currentPage` (default: 1)
  - `searchQuery` (fra props, default: "")
  - `filters` (default: {} fra localStorage)
  - `columnSettings` (default: allColumns fra localStorage)

- **Handlers:**
  - `handleFilterChange()` - ændrer filters
  - `onSort()` callback - ændrer sortBy/order
  - Direct `setCurrentPage()` - pagination buttons
  - Search input `onChange` - ændrer searchQuery via prop callback

- **Fetch trigger:**
  - `useEffect` deps: `[searchQuery, sortBy, order, filters, columnSettings, currentPage, isSearchFromSearchBar]`

### Navigation:

- **Item click uses:** `navigate()` fra `react-router-dom`
- **Replace used:** ❌ (push navigation = tilføjer til history)
- **Route:** `/item/:itemId` format: `/item/4151-abyssal-whip`

### Pagination:

- **Component:** Inline UI i BrowseItemsPage.jsx
- **Page comes from:** ✅ Lokal state (`currentPage`)
- **Page change:** Direct state update via `setCurrentPage()`

### Search:

- **State location:** 
  - Primary: `App.js` (`browseSearchQuery`)
  - SearchBar: Lokal state (`query`)
- **Sent to API:** ✅ Via `search` query parameter

### Browse item link rendering:

- **Rendered as:** `<tr>` med `onClick` handler
- **`<a href>` exists:** ❌
- **Ctrl/Cmd + klik:** ❌ Virker IKKE
- **Højreklik:** ❌ Virker IKKE
- **event.preventDefault():** ❌ Ikke nødvendig (ingen `<a>` links)

---

## 🚨 KRITISKE FINDINGS

1. **Ingen ægte links i browse table** - Items er `<tr>` elementer med onClick, ikke `<a>` links
2. **Ingen URL-baseret state** - Sort, page, search, filters er KUN i React state/localStorage, ikke i URL
3. **Pagination er inline komponent** - Ikke en separat komponent, hvilket gør det svært at refaktoreres
4. **Search state er split** - Primary state i App.js, men BrowseItemsPage har også lokal search input
5. **ColumnSettings i fetch deps** - Er i dependency array men bruges ikke i query params (måske dead dependency)



