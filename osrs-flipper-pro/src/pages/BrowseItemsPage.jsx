import React, { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import "../styles/shimmer.css";
import "../styles/browse.css";
import {
    formatCompact,
    formatPriceFull,
    formatColoredNumber,
    formatRoi,
    timeAgo,
    parseHumanNumber,
} from "../utils/formatting";
import BrowseTable from "../components/BrowseTable";
import ColumnPicker from "../components/ColumnPicker";
import FilterBuilder from "../components/FilterBuilder";
import TableModeSelector from "../components/TableModeSelector";
import SidePanel from "../components/SidePanel";
import { TABLE_MODES } from "../constants/tableModes";
import { allColumns } from "../constants/column";
import { apiFetch, apiFetchJson } from "../utils/api";
import { useTableMode } from "../hooks/useTableMode";
import { isColumnAllowedInMode, isSortValidForMode, getDefaultSortForMode } from "../constants/tableModes";

const API_URL = `/api/items/browse`;
const FILTERS_STORAGE_KEY = "osrs-flipper-filters";
const COLUMN_SETTINGS_STORAGE_KEY = "osrs-flipper-column-settings";

export default function BrowseItemsPage({ onItemClick, isSearchFromSearchBar = false, onSearchFromSearchBarChange }) {
    const [searchParams, setSearchParams] = useSearchParams();
    
    // Table mode management
    const { mode: tableMode, setMode: setTableMode, isHorizontal, isSide, isRow } = useTableMode();
    
    // Navigation state management
    const [sidePanelItemId, setSidePanelItemId] = useState(null);
    const [expandedRowIds, setExpandedRowIds] = useState(new Set());
    
    // Keyboard navigation state
    const [focusedRowId, setFocusedRowId] = useState(null);
    
    // Read state from URL params (source of truth)
    const sortBy = searchParams.get("sortBy") || "margin";
    const order = searchParams.get("order") || "desc";
    const currentPage = Number(searchParams.get("page") || 1);
    const searchQuery = searchParams.get("search") || "";
    
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    
    // Load column settings from localStorage on mount
    const [columnSettings, setColumnSettings] = useState(() => {
        try {
            const saved = localStorage.getItem(COLUMN_SETTINGS_STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                // Merge with allColumns to ensure we have all columns, even if new ones were added
                const merged = allColumns.map(col => {
                    const savedCol = parsed.find(c => c.id === col.id);
                    return savedCol ? { ...col, visible: savedCol.visible } : col;
                });
                return merged;
            }
        } catch (e) {
            console.error("Failed to load column settings from localStorage:", e);
        }
        return allColumns;
    });
    
    const [showColumnPicker, setShowColumnPicker] = useState(false);
    const [showFilterBuilder, setShowFilterBuilder] = useState(false);
    
    // Load filters from localStorage on mount
    const [filters, setFilters] = useState(() => {
        try {
            const saved = localStorage.getItem(FILTERS_STORAGE_KEY);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.error("Failed to load filters from localStorage:", e);
        }
        return {};
    });
    
    const [totalPages, setTotalPages] = useState(1);
    const [totalRows, setTotalRows] = useState(0);

    // Normalize filter keys like "price_min" or "volume_5m_max"
    const normalizeField = (raw) => {
        const m = raw.match(/^(.*)_(min|max)$/);
        if (m) {
            const [, base, bound] = m;
            return `${bound}${base.charAt(0).toUpperCase()}${base.slice(1)}`;
        }
        return raw;
    };

    // Fetch items whenever query params change
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(null); // Clear previous errors

        // New endpoint doesn't need columns param - it returns all columns
        // If search came from searchbar, ignore filters (filterless search)
        const q = new URLSearchParams({
            page: currentPage,
            pageSize: 50,
            sortBy,
            order,
            search: searchQuery,
            // Only include filters if search did NOT come from searchbar
            ...(isSearchFromSearchBar ? {} : filters),
        });

        const fetchUrl = `${API_URL}?${q.toString()}`;
        
        apiFetch(fetchUrl, { signal: controller.signal })
            .then(async (response) => {
                if (!controller.signal.aborted) {
                    if (!response.ok) {
                        // Check for rate limit (429) or other errors
                        if (response.status === 429) {
                            setError({
                                type: 'rate_limit',
                                message: 'Too many requests. Please wait a moment and try again.',
                                status: 429
                            });
                            setItems([]);
                            setTotalPages(1);
                            setTotalRows(0);
                        } else {
                            setError({
                                type: 'api_error',
                                message: `Error loading items (${response.status}). Please try again.`,
                                status: response.status
                            });
                            setItems([]);
                            setTotalPages(1);
                            setTotalRows(0);
                        }
                    } else {
                        const d = await response.json();
                        console.log('[BrowseItemsPage] Response data:', d);
                        console.log('[BrowseItemsPage] Items count:', d.items?.length || 0);
                        setItems(d.items || []);
                        setTotalPages(d.totalPages || 1);
                        setTotalRows(d.totalRows || 0);
                        setError(null); // Clear any previous errors
                    }
                }
            })
            .catch((e) => {
                if (e.name !== "AbortError" && !controller.signal.aborted) {
                    console.error('[BrowseItemsPage] Fetch error:', e);
                    // Check if it's a network error or rate limit
                    if (e.message && e.message.includes('429')) {
                        setError({
                            type: 'rate_limit',
                            message: 'Too many requests. Please wait a moment and try again.',
                            status: 429
                        });
                    } else {
                        setError({
                            type: 'network_error',
                            message: 'Network error. Please check your connection and try again.',
                            status: null
                        });
                    }
                    setItems([]);
                    setTotalPages(1);
                    setTotalRows(0);
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [searchQuery, sortBy, order, filters, currentPage, isSearchFromSearchBar]);

    // Reset sort if current sort is invalid for the current mode
    // Also cleanup navigation state when switching modes
    useEffect(() => {
        if (!isSortValidForMode(sortBy, tableMode)) {
            const defaultSort = getDefaultSortForMode(tableMode);
            setSearchParams({
                sortBy: defaultSort,
                order: "desc",
                page: "1",
                ...(searchQuery ? { search: searchQuery } : {})
            });
        }
        
        // Cleanup navigation state when switching modes
        // Close side panel if switching away from side mode
        if (tableMode !== TABLE_MODES.SIDE) {
            setSidePanelItemId(null);
        }
        // Collapse all rows if switching away from expandable mode
        if (tableMode !== TABLE_MODES.ROW) {
            setExpandedRowIds(new Set());
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tableMode]); // Only run when mode changes

    // Save column settings to localStorage whenever they change
    useEffect(() => {
        try {
            localStorage.setItem(COLUMN_SETTINGS_STORAGE_KEY, JSON.stringify(columnSettings));
        } catch (e) {
            console.error("Failed to save column settings to localStorage:", e);
        }
    }, [columnSettings]);

    // Listen for import events from ColumnPicker and FilterBuilder
    useEffect(() => {
        const handleColumnImport = (event) => {
            setColumnSettings(event.detail);
        };
        const handleFilterImport = (event) => {
            setFilters(event.detail);
        };
        window.addEventListener('importColumnSettings', handleColumnImport);
        window.addEventListener('importFilters', handleFilterImport);
        return () => {
            window.removeEventListener('importColumnSettings', handleColumnImport);
            window.removeEventListener('importFilters', handleFilterImport);
        };
    }, []);

    // Toggle column visibility and drop any associated filters
    const toggleColumn = (id) => {
        const current = columnSettings.find((c) => c.id === id);
        const isVisible = current?.visible;
        const newSettings = columnSettings.map((c) =>
            c.id === id ? { ...c, visible: !c.visible } : c
        );
        setColumnSettings(newSettings);

        if (isVisible) {
            // If we hid a column, remove filters for it
            setFilters((prev) => {
                const next = { ...prev };
                Object.keys(next).forEach((key) => {
                    if (
                        key.toLowerCase() === id.toLowerCase() ||
                        key.toLowerCase().includes(id.toLowerCase())
                    ) {
                        delete next[key];
                    }
                });
                return next;
            });

            // Reset sort if we were sorting by the hidden column
            if (sortBy === id) {
                setSearchParams({
                    sortBy: "margin",
                    order: "desc",
                    page: "1",
                    ...(searchQuery ? { search: searchQuery } : {})
                });
            }
        }
    };

    // Save filters to localStorage whenever they change
    useEffect(() => {
        try {
            localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
        } catch (e) {
            console.error("Failed to save filters to localStorage:", e);
        }
    }, [filters]);

    // Reset columns to default visibility
    const resetColumnsToDefaults = () => {
        setColumnSettings(allColumns.map(col => ({ ...col })));
    };

    // Clear all filters
    const clearAllFilters = () => {
        setFilters({});
    };

    // Handle filter changes
    const handleFilterChange = (field, value) => {
        const key = normalizeField(field);
        setFilters((f) => {
            const next = { ...f };
            if (value == null || value === "") delete next[key];
            else next[key] = value;
            return next;
        });
        // When filters are changed, enable them (disable search-from-searchbar mode)
        if (isSearchFromSearchBar && onSearchFromSearchBarChange) {
            onSearchFromSearchBarChange(false);
        }
        // Reset to page 1 when filters change
        setSearchParams({
            sortBy,
            order,
            page: "1",
            ...(searchQuery ? { search: searchQuery } : {})
        });
    };

    // Mode-aware column filtering
    // In horizontal mode: show all visible columns
    // In restricted modes (side/row): only show scan columns that are visible
    const visible = useMemo(() => {
        const allVisible = columnSettings.filter((c) => c.visible);
        
        if (isHorizontal()) {
            return allVisible; // All visible columns in horizontal mode
        }
        
        // In restricted modes, only show scan columns
        return allVisible.filter((c) => isColumnAllowedInMode(c.id, tableMode));
    }, [columnSettings, tableMode, isHorizontal]);

    // Mode-aware row click handlers
    const handleRowClick = (itemId, itemName) => {
        if (isHorizontal()) {
            // Horizontal mode: navigate to item detail page
            if (onItemClick) {
                onItemClick(itemId, itemName);
            }
        } else if (isSide()) {
            // Side panel mode: open side panel
            setSidePanelItemId(itemId);
        } else if (isRow()) {
            // Expandable row mode: toggle row expansion (only one row can be expanded at a time)
            setExpandedRowIds(prev => {
                // If clicking the same row that's already expanded, close it
                if (prev.has(itemId)) {
                    return new Set();
                }
                // Otherwise, expand only this row (close any previously expanded row)
                return new Set([itemId]);
            });
        }
    };

    // Close side panel
    const handleCloseSidePanel = () => {
        setSidePanelItemId(null);
    };

    // Check if a row is expanded
    const isRowExpanded = (itemId) => {
        return expandedRowIds.has(itemId);
    };
    
    // Check if a row is focused (for keyboard navigation)
    const isRowFocused = (itemId) => {
        return focusedRowId === itemId;
    };
    
    // Check if a row is selected (for side panel mode)
    const isRowSelected = (itemId) => {
        return sidePanelItemId === itemId;
    };

    // Get selected item for side panel
    const selectedItem = sidePanelItemId ? items.find(item => item.id === sidePanelItemId) : null;
    
    // Keyboard navigation handler
    const handleKeyDown = (e) => {
        // Only handle keyboard navigation when table has focus
        if (items.length === 0) return;
        
        const currentIndex = focusedRowId 
            ? items.findIndex(item => item.id === focusedRowId)
            : -1;
        
        let newIndex = currentIndex;
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                newIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
                setFocusedRowId(items[newIndex].id);
                break;
            case 'ArrowUp':
                e.preventDefault();
                newIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
                setFocusedRowId(items[newIndex].id);
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                if (focusedRowId) {
                    handleRowClick(focusedRowId, items.find(item => item.id === focusedRowId)?.name || '');
                }
                break;
            case 'Escape':
                e.preventDefault();
                setFocusedRowId(null);
                if (isSide()) {
                    setSidePanelItemId(null);
                }
                break;
            default:
                return;
        }
    };
    
    // Reset focus when items change
    useEffect(() => {
        setFocusedRowId(null);
    }, [items.length, currentPage]);

    return (
        <div style={{ 
            padding: "2rem 2rem 0.75rem 2rem", 
            fontFamily: "'Inter',sans-serif", 
            width: "100%", 
            maxWidth: "100%", 
            overflowX: "hidden", 
            boxSizing: "border-box", 
            backgroundColor: "#0f1115",
            height: "100%",
            display: "flex",
            flexDirection: "column"
        }}>
            <div style={{ flexShrink: 0, marginBottom: "0.5rem" }}>
                <h2 style={{ color: "#e6e9ef", margin: "0 0 0.5rem 0", fontSize: "20px" }}>Browse Items</h2>
            </div>

            {showColumnPicker && (
                <ColumnPicker
                    columnSettings={columnSettings}
                    onToggleColumn={toggleColumn}
                    onClose={() => setShowColumnPicker(false)}
                    onResetToDefaults={resetColumnsToDefaults}
                    tableMode={tableMode}
                />
            )}

            {showFilterBuilder && (
                <FilterBuilder
                    visibleColumns={visible}
                    filters={filters}
                    onFilterChange={handleFilterChange}
                    onClose={() => setShowFilterBuilder(false)}
                    onClearFilters={clearAllFilters}
                    isSearchFromSearchBar={isSearchFromSearchBar}
                    onSearchFromSearchBarChange={onSearchFromSearchBarChange}
                />
            )}

            {/* Search Input, View Selector, and Action Buttons */}
            <div style={searchContainerStyle}>
                <div style={searchInputWrapperStyle}>
                    <input
                        type="text"
                        placeholder="Search items by name..."
                        value={searchQuery}
                        onChange={(e) => {
                            const newSearch = e.target.value;
                            setSearchParams({
                                sortBy,
                                order,
                                page: "1",
                                ...(newSearch ? { search: newSearch } : {})
                            });
                            // When user types in browse search, it's not from searchbar anymore
                            if (isSearchFromSearchBar && onSearchFromSearchBarChange) {
                                onSearchFromSearchBarChange(false);
                            }
                        }}
                        style={searchInputStyle}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => {
                                setSearchParams({
                                    sortBy,
                                    order,
                                    page: "1"
                                });
                                // Clear search-from-searchbar flag when clearing search
                                if (onSearchFromSearchBarChange) {
                                    onSearchFromSearchBarChange(false);
                                }
                            }}
                            style={clearSearchButtonStyle}
                            title="Clear search"
                        >
                            ×
                        </button>
                    )}
                </div>
                <div style={rightActionsStyle}>
                    <button 
                        onClick={() => {
                            if (showColumnPicker) {
                                // If already open, close it
                                setShowColumnPicker(false);
                            } else {
                                // Close filter builder if open, then open column picker
                                if (showFilterBuilder) {
                                    setShowFilterBuilder(false);
                                }
                                setShowColumnPicker(true);
                            }
                        }} 
                        style={actionButtonStyle}
                        className="action-button"
                    >
                        Add Columns
                    </button>
                    <button 
                        onClick={() => {
                            if (showFilterBuilder) {
                                // If already open, close it
                                setShowFilterBuilder(false);
                            } else {
                                // Close column picker if open, then open filter builder
                                if (showColumnPicker) {
                                    setShowColumnPicker(false);
                                }
                                setShowFilterBuilder(true);
                            }
                        }} 
                        style={actionButtonStyle}
                        className="action-button"
                    >
                        Add Filters
                    </button>
                    <div style={viewSelectorWrapperStyle}>
                        <TableModeSelector mode={tableMode} onModeChange={setTableMode} />
                    </div>
                </div>
            </div>

            {/* Main content area with flex layout for side panel */}
            <div style={{ 
                display: "flex", 
                flex: 1, 
                flexDirection: "column",
                gap: 0, 
                overflow: "hidden",
                minHeight: 0
            }}>
                {/* Table and side panel container */}
                <div style={{ 
                    display: "flex", 
                    flex: 1, 
                    gap: 0, 
                    overflow: "hidden",
                    minHeight: 0
                }}>
                    {/* Table container - flex: 1 when side panel open, 100% when closed */}
                    <div style={{ 
                        flex: tableMode === TABLE_MODES.SIDE && selectedItem ? 1 : "1 1 100%",
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        ...(tableMode === TABLE_MODES.SIDE ? { overflow: "hidden" } : { overflowY: "auto" })
                    }}>
                        {/* Table wrapper - constrains height in all modes for sticky headers */}
                        <div style={{ 
                            flex: 1,
                            minHeight: 0,
                            overflow: "hidden",
                            display: "flex",
                            flexDirection: "column"
                        }}>
                            <BrowseTable
                                items={items}
                                visibleColumns={visible}
                                loading={loading}
                                error={error}
                                sortBy={sortBy}
                                order={order}
                                tableMode={tableMode}
                                onSort={(col) => {
                                    const newOrder = sortBy === col && order === "desc" ? "asc" : "desc";
                                    setSearchParams({
                                        sortBy: col,
                                        order: newOrder,
                                        page: "1",
                                        ...(searchQuery ? { search: searchQuery } : {})
                                    });
                                }}
                                onRowClick={handleRowClick}
                                expandedRowIds={expandedRowIds}
                                isRowExpanded={isRowExpanded}
                                isRowFocused={isRowFocused}
                                isRowSelected={isRowSelected}
                                onKeyDown={handleKeyDown}
                            />
                        </div>
                    </div>

                    {/* Side Panel - only show in side mode when item is selected */}
                    {tableMode === TABLE_MODES.SIDE && selectedItem && (
                        <SidePanel item={selectedItem} onClose={handleCloseSidePanel} />
                    )}
                </div>
                
                {/* Pagination - positioned below table, not affected by side panel */}
                {totalPages > 1 && (
                    <div style={{ flexShrink: 0 }}>
                        <div style={paginationStyle}>
                            <button
                                onClick={() => setSearchParams({
                                    sortBy,
                                    order,
                                    page: "1",
                                    ...(searchQuery ? { search: searchQuery } : {})
                                })}
                                disabled={currentPage === 1}
                                style={currentPage === 1 ? disabledButtonStyle : paginationButtonStyle}
                                className="pagination-button"
                            >
                                « First
                            </button>
                            <button
                                onClick={() => setSearchParams({
                                    sortBy,
                                    order,
                                    page: String(Math.max(1, currentPage - 1)),
                                    ...(searchQuery ? { search: searchQuery } : {})
                                })}
                                disabled={currentPage === 1}
                                style={currentPage === 1 ? disabledButtonStyle : paginationButtonStyle}
                                className="pagination-button"
                            >
                                ‹ Previous
                            </button>
                            
                            <div style={paginationInfoStyle}>
                                Page {currentPage} of {totalPages}
                                {totalRows > 0 && <span style={{ color: "#9ca3af" }}> ({totalRows} items)</span>}
                            </div>

                            {/* Page number buttons */}
                            <div style={pageNumbersStyle}>
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    let pageNum;
                                    if (totalPages <= 5) {
                                        pageNum = i + 1;
                                    } else if (currentPage <= 3) {
                                        pageNum = i + 1;
                                    } else if (currentPage >= totalPages - 2) {
                                        pageNum = totalPages - 4 + i;
                                    } else {
                                        pageNum = currentPage - 2 + i;
                                    }
                                    
                                    const isActive = currentPage === pageNum;
                                    return (
                                        <button
                                            key={pageNum}
                                            onClick={() => setSearchParams({
                                                sortBy,
                                                order,
                                                page: String(pageNum),
                                                ...(searchQuery ? { search: searchQuery } : {})
                                            })}
                                            style={isActive ? pageNumberActiveStyle : pageNumberButtonStyle}
                                            className="pagination-page-button"
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                })}
                            </div>

                            <button
                                onClick={() => setSearchParams({
                                    sortBy,
                                    order,
                                    page: String(Math.min(totalPages, currentPage + 1)),
                                    ...(searchQuery ? { search: searchQuery } : {})
                                })}
                                disabled={currentPage === totalPages}
                                style={currentPage === totalPages ? disabledButtonStyle : paginationButtonStyle}
                                className="pagination-button"
                            >
                                Next ›
                            </button>
                            <button
                                onClick={() => setSearchParams({
                                    sortBy,
                                    order,
                                    page: String(totalPages),
                                    ...(searchQuery ? { search: searchQuery } : {})
                                })}
                                disabled={currentPage === totalPages}
                                style={currentPage === totalPages ? disabledButtonStyle : paginationButtonStyle}
                                className="pagination-button"
                            >
                                Last »
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

const paginationStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    marginTop: "4px",
    marginBottom: "4px",
    padding: "8px 12px",
    background: "#151a22", /* Table surface */
    borderRadius: "8px",
    flexWrap: "wrap",
};

const paginationButtonStyle = {
    padding: "6px 12px",
    fontSize: "12px",
    fontWeight: 500,
    borderRadius: "4px",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    backgroundColor: "#202737", /* Button base */
    color: "#e6e9ef",
    cursor: "pointer",
    transition: "all 0.2s",
    boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.2)",
};

const disabledButtonStyle = {
    ...paginationButtonStyle,
    opacity: 0.4,
    cursor: "not-allowed",
    backgroundColor: "#181e27",
    boxShadow: "none",
};

const paginationInfoStyle = {
    fontSize: "12px",
    color: "#9aa4b2",
    fontWeight: 500,
    padding: "0 12px",
    textAlign: "center",
    minWidth: "120px",
};

const pageNumbersStyle = {
    display: "flex",
    gap: "6px",
    alignItems: "center",
};

const pageNumberButtonStyle = {
    padding: "6px 10px",
    fontSize: "12px",
    fontWeight: 500,
    borderRadius: "4px",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    backgroundColor: "#202737",
    color: "#e6e9ef",
    cursor: "pointer",
    minWidth: "36px",
    textAlign: "center",
    transition: "all 0.2s",
    boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.2)",
};

const pageNumberActiveStyle = {
    ...pageNumberButtonStyle,
    backgroundColor: "#5865F2",
    color: "#fff",
    borderColor: "#5865F2",
    fontWeight: "bold",
};

const actionButtonsStyle = {
    display: "flex",
    gap: "12px",
    margin: "1.5rem 0",
    flexWrap: "wrap",
};

const actionButtonStyle = {
    padding: "8px 16px",
    fontSize: "13px",
    fontWeight: 500,
    color: "#e6e9ef",
    background: "#202737", /* Button base */
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "all 0.2s",
};

const searchContainerStyle = {
    position: "relative",
    marginBottom: "0.5rem",
    maxWidth: "100%",
    display: "flex",
    gap: "10px",
    alignItems: "center",
    justifyContent: "space-between",
};

const searchInputWrapperStyle = {
    position: "relative",
    flex: 1,
    minWidth: 0,
    maxWidth: "500px",
};

const searchInputStyle = {
    width: "100%",
    padding: "8px 36px 8px 12px",
    fontSize: "13px",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "6px",
    outline: "none",
    transition: "all 0.2s",
    fontFamily: "'Inter',sans-serif",
    backgroundColor: "#151a22",
    color: "#e6e9ef",
};

const clearSearchButtonStyle = {
    position: "absolute",
    right: "8px",
    top: "50%",
    transform: "translateY(-50%)",
    background: "transparent",
    border: "none",
    fontSize: "24px",
    color: "#9aa4b2",
    cursor: "pointer",
    padding: "0 8px",
    lineHeight: "1",
    transition: "color 0.2s",
};

const rightActionsStyle = {
    display: "flex",
    gap: "10px",
    alignItems: "center",
    flexShrink: 0,
};

const viewSelectorWrapperStyle = {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
};
