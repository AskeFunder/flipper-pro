import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import FilterListIcon from "@mui/icons-material/FilterList";

export default function FilterBar({ onFilterChange }) {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [query, setQuery] = useState(searchParams.get("search") || "");

    const handleInputChange = (e) => {
        const newQuery = e.target.value;
        setQuery(newQuery);
        
        // Update URL params
        setSearchParams({
            sortBy: searchParams.get("sortBy") || "margin",
            order: searchParams.get("order") || "desc",
            page: "1",
            ...(newQuery ? { search: newQuery } : {})
        });
        
        // Notify parent if callback provided
        if (onFilterChange) {
            onFilterChange(newQuery);
        }
    };

    const handleClear = () => {
        setQuery("");
        setSearchParams({
            sortBy: searchParams.get("sortBy") || "margin",
            order: searchParams.get("order") || "desc",
            page: "1"
        });
        if (onFilterChange) {
            onFilterChange("");
        }
    };

    return (
        <div style={{ position: "relative", display: "flex", alignItems: "center", width: "100%" }}>
            <FilterListIcon 
                style={{ 
                    position: "absolute", 
                    left: "12px", 
                    color: "#9aa4b2",
                    fontSize: "20px",
                    pointerEvents: "none",
                }} 
            />
            <input
                type="text"
                value={query}
                onChange={handleInputChange}
                placeholder="Filter items by name..."
                style={{
                    padding: "8px 12px 8px 40px",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "4px",
                    backgroundColor: "#151a22",
                    color: "#e6e9ef",
                    width: "100%",
                    fontSize: "14px",
                    outline: "none",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                    boxSizing: "border-box",
                }}
            />
            {query && (
                <button
                    onClick={handleClear}
                    style={{
                        position: "absolute",
                        right: "8px",
                        background: "transparent",
                        border: "none",
                        fontSize: "24px",
                        color: "#9aa4b2",
                        cursor: "pointer",
                        padding: "0 8px",
                        lineHeight: "1",
                        transition: "color 0.2s",
                    }}
                    title="Clear filter"
                >
                    ×
                </button>
            )}
        </div>
    );
}

