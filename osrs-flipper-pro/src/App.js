import React, { useState, useEffect } from "react";
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


const drawerWidth = 220;

function App() {
  const [page, setPage] = useState("browse");
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [browseSearchQuery, setBrowseSearchQuery] = useState("");

  // Clear search query when navigating away from browse page
  useEffect(() => {
    if (page !== "browse") {
      setBrowseSearchQuery("");
    }
  }, [page]);

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
    <Box sx={{ display: "flex", height: "100vh" }}>
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
              selected={page === item.id && !selectedItemId}
              onClick={() => {
                setSelectedItemId(null); // Clear item detail view
                setPage(item.id);         // Navigate to new page
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
        }}
      >
        {/* Search Bar - Floating in top right corner, no layout impact */}
        {(page === "browse" || selectedItemId) && (
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
              onItemClick={(itemId) => setSelectedItemId(itemId)}
              onSearch={(query) => setBrowseSearchQuery(query)}
            />
          </Box>
        )}

        {/* Content area - Starts at actual top, no header padding */}
        <Box
          sx={{
            flexGrow: 1,
            p: 3,
            overflowY: "auto",
          }}
        >
          {selectedItemId ? (
            <ItemDetailPage 
              itemId={selectedItemId} 
              onBack={() => setSelectedItemId(null)} 
            />
          ) : (
            <>
          {page === "dashboard" && <OathplateDashboard />}
              {page === "browse" && (
                <BrowseItemsPage 
                  onItemClick={setSelectedItemId}
                  searchQuery={browseSearchQuery}
                  onSearchQueryChange={setBrowseSearchQuery}
                />
              )}
          {page === "methods" && <Typography>Method Calculators – coming soon.</Typography>}
          {page === "live" && <Typography>Day Trading Mode – coming soon.</Typography>}
          {page === "favorites" && <Typography>Favorites – coming soon.</Typography>}
          {page === "settings" && <Typography>Settings – coming soon.</Typography>}
          {page === "changelog" && <Typography>Changelog – coming soon.</Typography>}
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default App;
