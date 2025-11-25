import React, { useState, useEffect, useRef } from "react";
import SearchIcon from "@mui/icons-material/Search";

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3001';
const baseIconURL = "https://oldschool.runescape.wiki/images/thumb";

// Module-level cache for all items
let cachedItems = null;
let isLoadingCache = false;
let loadPromise = null;

async function getAllItems() {
    if (cachedItems) return cachedItems;
    if (isLoadingCache && loadPromise) return loadPromise;
    
    isLoadingCache = true;
    loadPromise = fetch(`${API_BASE}/api/items/all`)
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(data => {
            cachedItems = Array.isArray(data) ? data : [];
            isLoadingCache = false;
            return cachedItems;
        })
        .catch(err => {
            console.error("Error fetching all items:", err);
            isLoadingCache = false;
            cachedItems = []; // Set empty array on error to prevent retries
            return [];
        });
    
    return loadPromise;
}

export default function SearchBar({ onItemClick, onSearch }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [isLoadingItems, setIsLoadingItems] = useState(true);
    const inputRef = useRef(null);
    const dropdownRef = useRef(null);

    // Load all items once on mount
    useEffect(() => {
        getAllItems().then(() => {
            setIsLoadingItems(false);
        });
    }, []);

    // Filter items client-side as user types
    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            return;
        }

        if (isLoadingItems || !cachedItems || cachedItems.length === 0) {
            return;
        }

        const trimmedQuery = query.trim().toLowerCase();
        
        // Filter items that match the query
        const filtered = cachedItems.filter(item => 
            item.name && item.name.toLowerCase().includes(trimmedQuery)
        );

        // Sort: exact match first, then starts with, then contains
        const sorted = filtered.sort((a, b) => {
            const aName = a.name.toLowerCase();
            const bName = b.name.toLowerCase();
            
            if (aName === trimmedQuery && bName !== trimmedQuery) return -1;
            if (aName !== trimmedQuery && bName === trimmedQuery) return 1;
            if (aName.startsWith(trimmedQuery) && !bName.startsWith(trimmedQuery)) return -1;
            if (!aName.startsWith(trimmedQuery) && bName.startsWith(trimmedQuery)) return 1;
            return aName.localeCompare(bName);
        });

        // Show top 5
        setResults(sorted.slice(0, 5));
    }, [query, isLoadingItems]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target) &&
                inputRef.current &&
                !inputRef.current.contains(event.target)
            ) {
                setResults([]);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleInputChange = (e) => {
        setQuery(e.target.value);
    };

    const handleItemClick = (item) => {
        if (onItemClick) {
            onItemClick(item.id, item.name);
        }
        setQuery("");
        setResults([]);
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && query.trim()) {
            e.preventDefault();
            if (onSearch) {
                onSearch(query.trim());
            }
            setQuery("");
            setResults([]);
        } else if (e.key === "Escape") {
            setQuery("");
            setResults([]);
        }
    };

    return (
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <div
                ref={dropdownRef}
                style={{
                    position: "relative",
                    zIndex: 1000,
                    display: "flex",
                    alignItems: "center",
                }}
            >
                <SearchIcon 
                    style={{ 
                        position: "absolute", 
                        left: "12px", 
                        color: "#999",
                        pointerEvents: "none",
                    }} 
                />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Search"
                    style={{
                        padding: "8px 12px 8px 40px",
                        border: "1px solid #ccc",
                        borderRadius: "4px",
                        backgroundColor: "#fff",
                        color: "#111",
                        width: "300px",
                        fontSize: "14px",
                        outline: "none",
                        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                    }}
                />
                {query.trim() && !isLoadingItems && (
                    <div
                        style={{
                            position: "absolute",
                            top: "100%",
                            left: 0,
                            right: 0,
                            marginTop: "4px",
                            backgroundColor: "#1e1e1e",
                            border: "1px solid #333",
                            borderRadius: "4px",
                            boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                            maxHeight: "300px",
                            overflowY: "auto",
                            zIndex: 1001,
                        }}
                    >
                        {results.length === 0 ? (
                            <div style={{ padding: "12px", color: "#999", textAlign: "center" }}>
                                No items found
                            </div>
                        ) : (
                            results.map((item) => {
                                const safe = encodeURIComponent((item.icon || item.name || "").replace(/ /g, "_"));
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => handleItemClick(item)}
                                        style={{
                                            padding: "10px 12px",
                                            cursor: "pointer",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "12px",
                                            borderBottom: "1px solid #333",
                                            color: "#fff",
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = "#2a2a2a";
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = "transparent";
                                        }}
                                    >
                                        <img
                                            src={`${baseIconURL}/${safe}/32px-${safe}`}
                                            alt={item.name}
                                            width={32}
                                            height={32}
                                            style={{
                                                objectFit: "contain",
                                            }}
                                            onError={(e) => (e.currentTarget.style.display = "none")}
                                        />
                                        <span>{item.name}</span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
