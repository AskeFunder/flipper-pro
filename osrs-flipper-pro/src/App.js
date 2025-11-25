import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, Routes, Route } from "react-router-dom";
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Box
} from "@mui/material";
import DashboardIcon from "@mui/icons-material/ShowChart";
import SearchIcon from "@mui/icons-material/Search";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import FlashOnIcon from "@mui/icons-material/FlashOn";
import StarIcon from "@mui/icons-material/Star";
import SettingsIcon from "@mui/icons-material/Settings";
import HistoryIcon from "@mui/icons-material/History";
import OathplateDashboard from "./components/OathplateDashboard";
import BrowseItemsPage from "./pages/BrowseItemsPage";
import ItemDetailPage from "./pages/ItemDetailPage";
import SearchBar from "./components/SearchBar";
import { nameToSlug } from "./utils/formatting";


const drawerWidth = 220;

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [page, setPage] = useState("browse");
  const [browseSearchQuery, setBrowseSearchQuery] = useState("");
  const [isSearchFromSearchBar, setIsSearchFromSearchBar] = useState(false);
  
  // Extract item ID/name from URL path
  // Format: /item/4151-abyssal-whip or /item/abyssal-whip (backward compatible)
  const pathParts = location.pathname.split('/');
  const itemParam = pathParts[1] === 'item' && pathParts[2] ? pathParts[2] : null;
  const selectedItemName = itemParam ? (itemParam.includes('-') && /^\d+-/.test(itemParam) ? itemParam.split('-').slice(1).join('-') : itemParam) : null;

  // Update page state based on URL
  useEffect(() => {
    if (selectedItemName) {
      setPage("browse"); // Keep page as browse when viewing item details
    } else if (location.pathname === "/" || location.pathname === "/browse") {
      setPage("browse");
    } else {
      const pageFromPath = location.pathname.slice(1); // Remove leading slash
      setPage(pageFromPath || "browse");
    }
  }, [location.pathname, selectedItemName]);

  // Clear search query when navigating away from browse page
  useEffect(() => {
    if (page !== "browse" || selectedItemName) {
      setBrowseSearchQuery("");
    }
  }, [page, selectedItemName]);
  
  // Handler for item click - navigate to item detail page using item ID + name slug
  // Format: /item/4151-abyssal-whip (hybrid approach for reliability)
  const handleItemClick = (itemId, itemName) => {
    const slug = nameToSlug(itemName);
    navigate(`/item/${itemId}-${encodeURIComponent(slug)}`);
  };

  const navItems = [
    { id: "dashboard", label: "Oathplate Dashboard", icon: <DashboardIcon /> },
    { id: "browse", label: "Browse Items", icon: <SearchIcon /> },
    { id: "methods", label: "Method Calculators", icon: <AttachMoneyIcon /> },
    { id: "live", label: "Day Trading Mode", icon: <FlashOnIcon /> },
    { id: "favorites", label: "Favorites", icon: <StarIcon /> },
    { id: "settings", label: "Settings", icon: <SettingsIcon /> },
    { id: "changelog", label: "Changelog", icon: <HistoryIcon /> },
  ];

  return (
    <Box sx={{ display: "flex", height: "100vh", width: "100%", maxWidth: "100%", overflowX: "hidden" }}>
      {/* Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: drawerWidth,
            boxSizing: "border-box",
            backgroundColor: "#1e1e1e",
            color: "#fff",
            borderRight: "1px solid #333",
          },
        }}
      >
        <Toolbar>
          <Typography variant="h6" noWrap component="div">
            FlipperPro
          </Typography>
        </Toolbar>
        <List>
          {navItems.map((item) => (
            <ListItemButton
              key={item.id}
              selected={page === item.id && !selectedItemName}
              onClick={() => {
                if (item.id === "browse") {
                  // When clicking Browse Items, clear search-from-searchbar flag to restore filters
                  setIsSearchFromSearchBar(false);
                  setBrowseSearchQuery(""); // Clear search query when navigating to browse
                }
                navigate(`/${item.id === "browse" ? "" : item.id}`);
              }}
              disableRipple
              disableTouchRipple
              sx={{
                color: "#fff",
                "&.Mui-selected": {
                  backgroundColor: "#333",
                  fontWeight: "bold",
                },
                "&:hover": {
                  backgroundColor: "#2a2a2a",
                },
              }}
            >
              <ListItemIcon sx={{ color: "#fff" }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          bgcolor: "#ffffff",
          color: "#111",
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          position: "relative",
          overflowX: "hidden",
          width: "100%",
          maxWidth: "100%",
        }}
      >
        {/* Search Bar - Floating in top right corner, no layout impact */}
        {(page === "browse" || selectedItemName) && (
          <Box
            sx={{
              position: "absolute",
              top: 0,
              right: "16px",
              zIndex: 1000,
              p: 2,
              display: "flex",
              justifyContent: "flex-end",
              pointerEvents: "auto",
            }}
          >
            <SearchBar
              onItemClick={handleItemClick}
              onSearch={(query) => {
                setBrowseSearchQuery(query);
                setIsSearchFromSearchBar(true); // Mark that search came from searchbar (filterless)
                // Navigate to browse page if not already there
                if (page !== "browse" || selectedItemName) {
                  navigate("/browse");
                }
              }}
            />
          </Box>
        )}

        {/* Content area - Starts at actual top, no header padding */}
        <Box
          sx={{
            flexGrow: 1,
            p: 3,
            overflowY: "auto",
            overflowX: "hidden",
            width: "100%",
            maxWidth: "100%",
          }}
        >
          <Routes>
            <Route path="/item/:itemId" element={<ItemDetailPage />} />
            <Route path="/dashboard" element={<OathplateDashboard />} />
            <Route path="/browse" element={
              <BrowseItemsPage 
                onItemClick={handleItemClick}
                searchQuery={browseSearchQuery}
                onSearchQueryChange={setBrowseSearchQuery}
                isSearchFromSearchBar={isSearchFromSearchBar}
                onSearchFromSearchBarChange={setIsSearchFromSearchBar}
              />
            } />
            <Route path="/" element={
              <BrowseItemsPage 
                onItemClick={handleItemClick}
                searchQuery={browseSearchQuery}
                onSearchQueryChange={setBrowseSearchQuery}
                isSearchFromSearchBar={isSearchFromSearchBar}
                onSearchFromSearchBarChange={setIsSearchFromSearchBar}
              />
            } />
            <Route path="/methods" element={<Typography>Method Calculators – coming soon.</Typography>} />
            <Route path="/live" element={<Typography>Day Trading Mode – coming soon.</Typography>} />
            <Route path="/favorites" element={<Typography>Favorites – coming soon.</Typography>} />
            <Route path="/settings" element={<Typography>Settings – coming soon.</Typography>} />
            <Route path="/changelog" element={<Typography>Changelog – coming soon.</Typography>} />
          </Routes>
        </Box>
      </Box>
    </Box>
  );
}

export default App;
