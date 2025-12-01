# 🔍 BROWSE-STATE AUDIT — STRUKTURERET RAPPORT

## ✅ OPGAVE 1 — KORTLÆG AKTUEL BROWSE-STATE

### BrowseItemsPage.jsx

- **useState:**
  - `sortBy` (default: `"margin"`)
  - `order` (default: `"desc"`)
  - `currentPage` (default: `1`)
  - `searchQuery` (fra props, default: `""`)
  - `filters` (default: `{}` fra localStorage)
  - `columnSettings` (default: `allColumns` fra localStorage)
  - `items` (default: `[]`)
  - `loading` (default: `false`)
  - `totalPages` (default: `1`)
  - `totalRows` (default: `0`)

- **Initialisering:**
  - Hardcoded defaults for: `sortBy`, `order`, `currentPage`
  - Props for: `searchQuery`
  - localStorage for: `filters`, `columnSettings`
  - API fetch response for: `items`, `totalPages`, `totalRows`

- **Handlers:**
  - `handleFilterChange(field, value)` - ændrer filters, resetter page til 1
  - `onSort(col)` - ændrer sortBy/order (toggle asc/desc hvis samme column)
  - `setCurrentPage(page)` - direkte state update fra pagination buttons
  - Search input `onChange` - kalder `onSearchQueryChange` prop callback

---

## ✅ OPGAVE 2 — KORTLÆG HVORDAN API-FETCH TRIGGES

### Fetch trigger:

- **Location:** `BrowseItemsPage.jsx` linje 78-116
- **useEffect dependency array:**
  ```javascript
  [searchQuery, sortBy, order, filters, columnSettings, currentPage, isSearchFromSearchBar]
  ```
- **Hvor fetchItems kaldes:**
  - `apiFetchJson(fetchUrl, { signal: controller.signal })`
  - URL: `/api/items/browse?page=...&pageSize=50&sortBy=...&order=...&search=...`
- **Query params:**
  - `page`: `currentPage`
  - `pageSize`: `50` (hardcoded)
  - `sortBy`: `sortBy` state
  - `order`: `order` state
  - `search`: `searchQuery` prop
  - Filters: Kun hvis `isSearchFromSearchBar === false`

---

## ✅ OPGAVE 3 — KORTLÆG NAVIGATION TIL ITEMDETAIL

### Navigation:

- **Hvor vi navigerer til:** `/item/:itemId`
- **Format:** `/item/4151-abyssal-whip` (itemId-name-slug)
- **Bruges:**
  - ✅ `navigate(...)` fra `react-router-dom`
  - ❌ `<Link to={...}>` komponent
  - ❌ `div onClick` (bruges `<tr onClick>` i stedet)
- **replace used:** ❌ (push navigation - tilføjer til browser history)
- **Handler location:** `App.js` linje 64-67
  ```javascript
  const handleItemClick = (itemId, itemName) => {
      const slug = nameToSlug(itemName);
      navigate(`/item/${itemId}-${encodeURIComponent(slug)}`);
  };
  ```

---

## ✅ OPGAVE 4 — PAGINATION-KOMPONENT

### Pagination:

- **Komponent:** Inline pagination UI i `BrowseItemsPage.jsx` (linje 334-404)
- **Page kommer fra:**
  - ❌ Props
  - ✅ Lokal state (`currentPage` useState)
- **Side-skift kommunikation:**
  - Direct state update: `setCurrentPage(page)`
  - Kaldt fra: onClick handlers på pagination buttons
  - Ingen callback til parent component

---

## ✅ OPGAVE 5 — SEARCH-FLOW

### Search:

- **Search-state lever:**
  - Primary: `App.js` (`browseSearchQuery` useState)
  - SearchBar: Lokal state (`query` useState i `SearchBar.jsx`)
  - Context: ❌ (bruges props)
- **Hvordan search-state sendes til API:**
  - Via `URLSearchParams` som `search` parameter
  - Location: `BrowseItemsPage.jsx` linje 89
  - Format: `search: searchQuery` (fra props)

---

## ✅ OPGAVE 6 — NY FANE / LINK-PROBLEM (KRITISK UX-BUG)

### Browse item link rendering:

- **Hvor browse-items rendres:**
  - `BrowseTable.jsx` linje 100-170
  - `<tr>` elementer med `onClick` handler
- **Hvordan navigation sker i dag:**
  - `<tr onClick={() => onItemClick && onItemClick(item.id, item.name)}>`
  - Ikke `<div onClick>` (bruges `<tr onClick>` i stedet)
- **Findes:**
  - ❌ `<a href="...">` - INGEN ægte links
- **Bruges:**
  - ❌ `event.preventDefault()` - Ikke nødvendig da der ikke er `<a>` links
- **Ctrl/Cmd-klik:** ❌ Virker IKKE
- **Højreklik:** ❌ Virker IKKE

---

## 📋 OUTPUT-FORMAT (OBLIGATORISK)

### BrowseItemsPage.jsx

- useState:
  - sortBy (default: "margin")
  - order (default: "desc")
  - currentPage (default: 1)
  - searchQuery (fra props, default: "")

- Handlers:
  - handleFilterChange()
  - onSort() callback
  - setCurrentPage() direct
  - Search input onChange

- Fetch trigger:
  - useEffect deps: [searchQuery, sortBy, order, filters, columnSettings, currentPage, isSearchFromSearchBar]

### Navigation

- Item click uses: navigate(`/item/${itemId}-${slug}`)
- replace used: ❌

### Pagination

- Component: Inline UI i BrowseItemsPage.jsx
- Page comes from: ✅ Lokal state

### Search

- Component: SearchBar.jsx
- State location: App.js (browseSearchQuery)
- Controlled via props ✅

### Browse item link rendering

- Rendered as: <tr onClick>
- <a href> exists: ❌
- Ctrl/Cmd + klik: ❌
- Højreklik: ❌



