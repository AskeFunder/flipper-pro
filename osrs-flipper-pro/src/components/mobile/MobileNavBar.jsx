import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import SearchIcon from "@mui/icons-material/Search";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import StarIcon from "@mui/icons-material/Star";
import SettingsIcon from "@mui/icons-material/Settings";

const navBarStyle = {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    height: "48px",
    backgroundColor: "#151a22",
    borderTop: "1px solid rgba(255, 255, 255, 0.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-around",
    zIndex: 1000,
    paddingBottom: "env(safe-area-inset-bottom)", // iOS safe area
    boxSizing: "border-box",
    paddingTop: "4px",
    paddingBottom: "calc(4px + env(safe-area-inset-bottom))",
};

const navItemStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    minHeight: "40px",
    minWidth: "40px",
    cursor: "pointer",
    padding: "4px",
    borderRadius: "6px",
    transition: "all 0.2s",
    backgroundColor: "transparent",
    border: "none",
    color: "#9aa4b2",
    fontFamily: "'Inter', sans-serif",
};

const navItemActiveStyle = {
    ...navItemStyle,
    color: "#5865F2",
    backgroundColor: "transparent",
    filter: "drop-shadow(0 0 4px rgba(88, 101, 242, 0.5))",
};

const iconStyle = {
    fontSize: "22px",
    width: "22px",
    height: "22px",
};

const navItems = [
    { id: "browse", label: "Browse", icon: <SearchIcon sx={iconStyle} />, route: "/browse" },
    { id: "market", label: "Market", icon: <AttachMoneyIcon sx={iconStyle} />, route: "/market" },
    { id: "favorites", label: "Favorites", icon: <StarIcon sx={iconStyle} />, route: "/favorites" },
    { id: "settings", label: "Settings", icon: <SettingsIcon sx={iconStyle} />, route: "/settings" },
];

export default function MobileNavBar() {
    const navigate = useNavigate();
    const location = useLocation();

    // Determine active tab based on current route
    const getActiveTab = () => {
        const path = location.pathname;
        
        // Check if we're on item detail page (should highlight Browse)
        if (path.startsWith("/item/")) {
            return "browse";
        }
        
        // Check exact matches first
        for (const item of navItems) {
            if (path === item.route || path === "/") {
                return item.id;
            }
        }
        
        // Default to browse for root or unknown routes
        return "browse";
    };

    const activeTab = getActiveTab();

    const handleNavClick = (route) => {
        navigate(route);
    };

    return (
        <nav style={navBarStyle} role="navigation" aria-label="Main navigation">
            {navItems.map((item) => {
                const isActive = activeTab === item.id;
                const style = isActive ? navItemActiveStyle : navItemStyle;
                
                return (
                    <button
                        key={item.id}
                        onClick={() => handleNavClick(item.route)}
                        style={style}
                        aria-label={item.label}
                        aria-current={isActive ? "page" : undefined}
                        title={item.label}
                    >
                        {item.icon}
                    </button>
                );
            })}
        </nav>
    );
}

