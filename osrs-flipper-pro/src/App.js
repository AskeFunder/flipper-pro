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
import SearchIcon from "@mui/icons-material/Search";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import FlashOnIcon from "@mui/icons-material/FlashOn";
import StarIcon from "@mui/icons-material/Star";
import SettingsIcon from "@mui/icons-material/Settings";
import HistoryIcon from "@mui/icons-material/History";
import OathplateDashboard from "./components/OathplateDashboard";
import BrowseItemsPage from "./pages/BrowseItemsPage";
import ItemDetailPage from "./pages/ItemDetailPage";
import ChangelogPage from "./pages/ChangelogPage";
import SearchBar from "./components/SearchBar";
import FilterBar from "./components/FilterBar";
import DiscordBanner from "./components/DiscordBanner";
import MobileDiscordBanner from "./components/mobile/MobileDiscordBanner";
import MobileNavBar from "./components/mobile/MobileNavBar";
import LocalApiBanner from "./components/LocalApiBanner";
import { useMobile } from "./hooks/useMobile";
import { nameToSlug } from "./utils/formatting";
import { isLocalApi } from "./utils/api";


const drawerWidth = 220;

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useMobile();
  const [page, setPage] = useState("browse");
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

  
  // Handler for item click - navigate to item detail page using item ID + name slug
  // Format: /item/4151-abyssal-whip (hybrid approach for reliability)
  const handleItemClick = (itemId, itemName) => {
    const slug = nameToSlug(itemName);
    navigate(`/item/${itemId}-${encodeURIComponent(slug)}`);
  };

  const navItems = [
    { id: "browse", label: "Browse Items", icon: <SearchIcon /> },
    { id: "methods", label: "Method Calculators", icon: <AttachMoneyIcon /> },
    { id: "live", label: "Day Trading Mode", icon: <FlashOnIcon /> },
    { id: "favorites", label: "Favorites", icon: <StarIcon /> },
    { id: "settings", label: "Settings", icon: <SettingsIcon /> },
    { id: "changelog", label: "Changelog", icon: <HistoryIcon /> },
  ];

  return (
    <Box sx={{ display: "flex", height: "100vh", width: "100%", maxWidth: "100%", overflowX: "hidden" }}>
      {/* Local API Banner - Shows at top when connected to local API */}
      <LocalApiBanner />
      
      {/* DESKTOP ONLY: Sidebar */}
      {!isMobile && (
        <Drawer
          variant="permanent"
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            [`& .MuiDrawer-paper`]: {
              width: drawerWidth,
              boxSizing: "border-box",
              backgroundColor: "#151a22", /* Table surface */
              color: "#e6e9ef",
              borderRight: "1px solid rgba(255, 255, 255, 0.06)",
              background: "linear-gradient(180deg, #151a22 0%, #0f1115 100%)",
            },
          }}
        >
          <Toolbar sx={{ 
            background: "linear-gradient(135deg, #5865F2 0%, #4752C4 100%)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
            minHeight: "64px !important",
          }}>
            <Typography 
              variant="h6" 
              noWrap 
              component="div"
              sx={{
                fontWeight: 700,
                fontSize: "20px",
                letterSpacing: "-0.5px",
                background: "linear-gradient(135deg, #ffffff 0%, #e6e9ef 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              FlipperPro
            </Typography>
          </Toolbar>
          <List sx={{ padding: "8px" }}>
            {navItems.map((item) => (
              <ListItemButton
                key={item.id}
                selected={page === item.id && !selectedItemName}
                onClick={() => {
                  if (item.id === "browse") {
                    // When clicking Browse Items, clear search-from-searchbar flag to restore filters
                    setIsSearchFromSearchBar(false);
                    // Navigate to browse without search params
                    navigate("/browse");
                  } else {
                    navigate(`/${item.id}`);
                  }
                }}
                disableRipple
                disableTouchRipple
                sx={{
                  color: "#9aa4b2",
                  borderRadius: "8px",
                  marginBottom: "4px",
                  padding: "12px 16px",
                  transition: "all 0.2s",
                  "&.Mui-selected": {
                    backgroundColor: "#202737",
                    color: "#e6e9ef",
                    fontWeight: 600,
                    "& .MuiListItemIcon-root": {
                      color: "#5865F2",
                    },
                  },
                  "&:hover": {
                    backgroundColor: "#181e27",
                    color: "#e6e9ef",
                    "& .MuiListItemIcon-root": {
                      color: "#5865F2",
                    },
                  },
                }}
              >
                <ListItemIcon sx={{ 
                  color: "inherit",
                  minWidth: "40px",
                  transition: "color 0.2s",
                }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText 
                  primary={item.label}
                  primaryTypographyProps={{
                    fontSize: "14px",
                    fontWeight: "inherit",
                  }}
                />
              </ListItemButton>
            ))}
          </List>
        </Drawer>
      )}

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          bgcolor: "#0f1115", /* App background */
          color: "#e6e9ef", /* Primary text */
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          position: "relative",
          overflowX: "hidden",
          width: "100%",
          maxWidth: "100%",
          paddingBottom: 0, // No padding - pagination and bottom nav are fixed
          paddingTop: 0, // No padding top - search bar handles spacing
        }}
      >
        {/* Search Bar and Discord Badge - Floating in top right corner (Desktop) / Floating header (Mobile) */}
        {(page === "browse" || selectedItemName) && (
          <Box
            sx={{
              position: isMobile ? "fixed" : "absolute",
              top: isMobile ? (isLocalApi ? "40px" : 0) : (isLocalApi ? "40px" : 0),
              right: isMobile ? 0 : "16px",
              left: isMobile ? 0 : "auto",
              zIndex: isMobile ? 1100 : 1000,
              p: isMobile ? "0" : 2,
              display: "flex",
              alignItems: "center",
              gap: isMobile ? 0 : "12px",
              justifyContent: isMobile ? "stretch" : "flex-end",
              pointerEvents: "auto",
              width: isMobile ? "100%" : "auto",
              flexDirection: isMobile ? "column" : "row",
              backgroundColor: isMobile ? "#0f1115" : "transparent",
              borderBottom: "none", // No border - Discord banner will have borderTop instead
            }}
          >
            {!isMobile && <DiscordBanner />}
            <Box sx={{ width: isMobile ? "100%" : "auto", flex: isMobile ? 1 : "none", p: isMobile ? "8px" : 0 }}>
              {isMobile ? (
                <FilterBar />
              ) : (
                <SearchBar
                  onItemClick={handleItemClick}
                  onSearch={(query) => {
                    setIsSearchFromSearchBar(true); // Mark that search came from searchbar (filterless)
                    // Navigate to browse page with search param in URL
                    navigate(`/browse?search=${encodeURIComponent(query)}&sortBy=margin&order=desc&page=1`);
                  }}
                />
              )}
            </Box>
          </Box>
        )}

        {/* Mobile: Fixed Discord Banner (below search bar) */}
        {isMobile && (page === "browse" || selectedItemName) && (
          <Box
            sx={{
              position: "fixed",
              top: isLocalApi ? "90px" : "50px", // Below LocalApiBanner (40px) + search bar (50px)
              left: 0,
              right: 0,
              zIndex: 1050, // Below search results (1200) but above content
              backgroundColor: "#0f1115",
              borderTop: "none", // No border - sits flush with search bar
              borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
            }}
          >
            <MobileDiscordBanner />
          </Box>
        )}

        {/* Content area - Starts at actual top, no header padding */}
        <Box
          sx={{
            flexGrow: 1,
            p: isMobile ? 0 : 3,
            overflowY: "auto",
            overflowX: "hidden",
            width: "100%",
            maxWidth: "100%",
            paddingBottom: isMobile ? 0 : "24px", // No padding on mobile - pagination and bottom nav are fixed
            paddingTop: isMobile && (page === "browse" || selectedItemName) 
              ? (isLocalApi ? "130px" : "90px") // Space for LocalApiBanner (40px) + search bar (50px) + Discord banner (40px)
              : (isLocalApi ? "40px" : 0), // Space for LocalApiBanner when visible (applies to both mobile and desktop)
            marginBottom: isMobile && (page === "browse" || selectedItemName) ? "48px" : 0, // Space for bottom nav (48px) - pagination is fixed above it
          }}
        >
          <Routes>
            <Route path="/item/:itemId" element={<ItemDetailPage />} />
            <Route path="/dashboard" element={<OathplateDashboard />} />
            <Route path="/browse" element={
              <BrowseItemsPage 
                onItemClick={handleItemClick}
                isSearchFromSearchBar={isSearchFromSearchBar}
                onSearchFromSearchBarChange={setIsSearchFromSearchBar}
              />
            } />
            <Route path="/" element={
              <BrowseItemsPage 
                onItemClick={handleItemClick}
                isSearchFromSearchBar={isSearchFromSearchBar}
                onSearchFromSearchBarChange={setIsSearchFromSearchBar}
              />
            } />
            <Route path="/methods" element={<Typography>Method Calculators – coming soon.</Typography>} />
            <Route path="/live" element={<Typography>Day Trading Mode – coming soon.</Typography>} />
            <Route path="/market" element={<Typography>Market – coming soon.</Typography>} />
            <Route path="/favorites" element={<Typography>Favorites – coming soon.</Typography>} />
            <Route path="/settings" element={<Typography>Settings – coming soon.</Typography>} />
            <Route path="/changelog" element={<ChangelogPage />} />
          </Routes>
        </Box>
      </Box>

      {/* MOBILE ONLY: Bottom Navigation Bar */}
      {isMobile && <MobileNavBar />}
    </Box>
  );
}

export default App;
