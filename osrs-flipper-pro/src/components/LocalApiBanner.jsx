import React from "react";
import { Box, Typography } from "@mui/material";
import { isLocalApi } from "../utils/api";

export default function LocalApiBanner() {
  if (!isLocalApi) {
    return null;
  }

  return (
    <Box
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 2000,
        backgroundColor: "#d32f2f", // Bright red
        color: "#ffffff",
        padding: "8px 24px",
        height: "40px",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
        borderBottom: "2px solid #b71c1c",
      }}
    >
      <Typography
        sx={{
          fontSize: "18px",
          lineHeight: 1.2,
          fontWeight: 900,
          letterSpacing: "4px",
          textTransform: "uppercase",
          textShadow: "3px 3px 6px rgba(0, 0, 0, 0.7)",
          animation: "pulse 2s ease-in-out infinite",
          "@keyframes pulse": {
            "0%, 100%": { opacity: 1 },
            "50%": { opacity: 0.9 },
          },
        }}
      >
        🚨 LOCAL API ENABLED 🚨
      </Typography>
    </Box>
  );
}

