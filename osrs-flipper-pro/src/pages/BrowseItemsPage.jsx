import React, { useEffect, useState } from "react";
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
import DiscordBanner from "../components/DiscordBanner";
import { allColumns } from "../constants/column";
import { apiFetchJson } from "../utils/api";

const API_URL = `/api/items/browse`;
const FILTERS_STORAGE_KEY = "osrs-flipper-filters";
const COLUMN_SETTINGS_STORAGE_KEY = "osrs-flipper-column-settings";

export default function BrowseItemsPage({ onItemClick, isSearchFromSearchBar = false, onSearchFromSearchBarChange }) {
    const [searchParams, setSearchParams] = useSearchParams();
    
    // Read state from URL params (source of truth)
    const sortBy = searchParams.get("sortBy") || "margin";
    const order = searchParams.get("order") || "desc";
    const currentPage = Number(searchParams.get("page") || 1);
    const searchQuery = searchParams.get("search") || "";
    
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    
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
        
        apiFetchJson(fetchUrl, { signal: controller.signal })
            .then((d) => {
                console.log('[BrowseItemsPage] Response data:', d);
                console.log('[BrowseItemsPage] Items count:', d.items?.length || 0);
                if (!controller.signal.aborted) {
                    setItems(d.items || []);
                    setTotalPages(d.totalPages || 1);
                    setTotalRows(d.totalRows || 0);
                }
            })
            .catch((e) => {
                if (e.name !== "AbortError") {
                    console.error('[BrowseItemsPage] Fetch error:', e);
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [searchQuery, sortBy, order, filters, currentPage, isSearchFromSearchBar]);

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

    const visible = columnSettings.filter((c) => c.visible);

    return (
        <div style={{ padding: "2rem", fontFamily: "'Inter',sans-serif", width: "100%", maxWidth: "100%", overflowX: "hidden", boxSizing: "border-box" }}>
            <DiscordBanner />

            <h2>Browse Items</h2>

            <div style={actionButtonsStyle}>
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
            </div>

            {showColumnPicker && (
                <ColumnPicker
                    columnSettings={columnSettings}
                    onToggleColumn={toggleColumn}
                    onClose={() => setShowColumnPicker(false)}
                    onResetToDefaults={resetColumnsToDefaults}
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

            {/* Search Input */}
            <div style={searchContainerStyle}>
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

            <BrowseTable
                items={items}
                visibleColumns={visible}
                loading={loading}
                sortBy={sortBy}
                order={order}
                onSort={(col) => {
                    const newOrder = sortBy === col && order === "desc" ? "asc" : "desc";
                    setSearchParams({
                        sortBy: col,
                        order: newOrder,
                        page: "1",
                        ...(searchQuery ? { search: searchQuery } : {})
                    });
                }}
                onItemClick={onItemClick}
            />

            {/* Pagination */}
            {totalPages > 1 && (
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
            )}
        </div>
    );
}

const paginationStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    marginTop: "32px",
    padding: "20px",
    background: "#f9fafb",
    borderRadius: "8px",
    flexWrap: "wrap",
};

const paginationButtonStyle = {
    padding: "10px 16px",
    fontSize: "14px",
    fontWeight: 500,
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    backgroundColor: "#ffffff",
    color: "#374151",
    cursor: "pointer",
    transition: "all 0.2s",
    boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
};

const disabledButtonStyle = {
    ...paginationButtonStyle,
    opacity: 0.4,
    cursor: "not-allowed",
    backgroundColor: "#f3f4f6",
    boxShadow: "none",
};

const paginationInfoStyle = {
    fontSize: "14px",
    color: "#374151",
    fontWeight: 500,
    padding: "0 20px",
    textAlign: "center",
    minWidth: "150px",
};

const pageNumbersStyle = {
    display: "flex",
    gap: "6px",
    alignItems: "center",
};

const pageNumberButtonStyle = {
    padding: "10px 14px",
    fontSize: "14px",
    fontWeight: 500,
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    backgroundColor: "#ffffff",
    color: "#374151",
    cursor: "pointer",
    minWidth: "44px",
    textAlign: "center",
    transition: "all 0.2s",
    boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
};

const pageNumberActiveStyle = {
    ...pageNumberButtonStyle,
    backgroundColor: "#1e1e1e",
    color: "#fff",
    borderColor: "#1e1e1e",
    fontWeight: "bold",
};

const actionButtonsStyle = {
    display: "flex",
    gap: "12px",
    margin: "1.5rem 0",
    flexWrap: "wrap",
};

const actionButtonStyle = {
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: 500,
    color: "#374151",
    background: "#ffffff",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "all 0.2s",
};

const searchContainerStyle = {
    position: "relative",
    marginBottom: "1.5rem",
    maxWidth: "500px",
};

const searchInputStyle = {
    width: "100%",
    padding: "12px 40px 12px 16px",
    fontSize: "14px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    outline: "none",
    transition: "all 0.2s",
    fontFamily: "'Inter',sans-serif",
};

const clearSearchButtonStyle = {
    position: "absolute",
    right: "8px",
    top: "50%",
    transform: "translateY(-50%)",
    background: "transparent",
    border: "none",
    fontSize: "24px",
    color: "#9ca3af",
    cursor: "pointer",
    padding: "0 8px",
    lineHeight: "1",
    transition: "color 0.2s",
};
