import React, { useEffect, useState } from "react";
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
import { allColumns } from "../constants/column";

const API_URL = "http://localhost:3001/api/items/browse";

export default function BrowseItemsPage({ onItemClick, searchQuery = "", onSearchQueryChange }) {
    const [items, setItems] = useState([]);
    const [sortBy, setSortBy] = useState("margin");
    const [order, setOrder] = useState("desc");
    const [loading, setLoading] = useState(false);
    const [columnSettings, setColumnSettings] = useState(allColumns);
    const [showColumnPicker, setShowColumnPicker] = useState(false);
    const [showFilterBuilder, setShowFilterBuilder] = useState(false);
    const [filters, setFilters] = useState({});
    const [currentPage, setCurrentPage] = useState(1);
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
        const q = new URLSearchParams({
            page: currentPage,
            pageSize: 50,
            sortBy,
            order,
            search: searchQuery,
            ...filters,
        });

        fetch(`${API_URL}?${q.toString()}`, { signal: controller.signal })
            .then((r) => r.json())
            .then((d) => {
                if (!controller.signal.aborted) {
                    setItems(d.items || []);
                    setTotalPages(d.totalPages || 1);
                    setTotalRows(d.totalRows || 0);
                }
            })
            .catch((e) => {
                if (e.name !== "AbortError") console.error(e);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [searchQuery, sortBy, order, filters, columnSettings, currentPage]);

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
                setSortBy("margin");
                setOrder("desc");
            }
        }
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
        // Reset to page 1 when filters change
        setCurrentPage(1);
    };

    // Reset to page 1 when search or sort changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, sortBy, order]);

    const visible = columnSettings.filter((c) => c.visible);

    return (
        <div style={{ padding: "2rem", fontFamily: "'Inter',sans-serif" }}>
            <h2>Browse Items</h2>

            <div style={actionButtonsStyle}>
                <button 
                    onClick={() => setShowColumnPicker(true)} 
                    style={actionButtonStyle}
                    className="action-button"
                >
                    Add Columns
                </button>
                <button 
                    onClick={() => setShowFilterBuilder(true)} 
                    style={actionButtonStyle}
                    className="action-button"
                >
                    Add Filters
                </button>
            </div>

            {/* Search Input */}
            <div style={searchContainerStyle}>
                <input
                    type="text"
                    placeholder="Search items by name..."
                    value={searchQuery}
                    onChange={(e) => onSearchQueryChange && onSearchQueryChange(e.target.value)}
                    style={searchInputStyle}
                />
                {searchQuery && (
                    <button
                        onClick={() => onSearchQueryChange && onSearchQueryChange("")}
                        style={clearSearchButtonStyle}
                        title="Clear search"
                    >
                        ×
                    </button>
                )}
            </div>

            {showColumnPicker && (
                <ColumnPicker
                    columnSettings={columnSettings}
                    onToggleColumn={toggleColumn}
                    onClose={() => setShowColumnPicker(false)}
                />
            )}

            {showFilterBuilder && (
                <FilterBuilder
                    visibleColumns={visible}
                    filters={filters}
                    onFilterChange={handleFilterChange}
                    onClose={() => setShowFilterBuilder(false)}
                />
            )}

            <BrowseTable
                items={items}
                visibleColumns={visible}
                loading={loading}
                sortBy={sortBy}
                order={order}
                onSort={(col) => {
                    setOrder((prev) =>
                        sortBy === col ? (prev === "asc" ? "desc" : "asc") : "desc"
                    );
                    setSortBy(col);
                }}
                onItemClick={onItemClick}
            />

            {/* Pagination */}
            {totalPages > 1 && (
                <div style={paginationStyle}>
                    <button
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        style={currentPage === 1 ? disabledButtonStyle : paginationButtonStyle}
                        className="pagination-button"
                    >
                        « First
                    </button>
                    <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
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
                                    onClick={() => setCurrentPage(pageNum)}
                                    style={isActive ? pageNumberActiveStyle : pageNumberButtonStyle}
                                    className="pagination-page-button"
                                >
                                    {pageNum}
                                </button>
                            );
                        })}
                    </div>

                    <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        style={currentPage === totalPages ? disabledButtonStyle : paginationButtonStyle}
                        className="pagination-button"
                    >
                        Next ›
                    </button>
                    <button
                        onClick={() => setCurrentPage(totalPages)}
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
