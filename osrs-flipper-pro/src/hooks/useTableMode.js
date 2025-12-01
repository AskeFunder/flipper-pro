import { useState, useEffect } from 'react';
import { TABLE_MODES } from '../constants/tableModes';
import { useMobile } from './useMobile';

const TABLE_MODE_STORAGE_KEY = 'osrs-flipper-table-mode';

/**
 * Custom hook for managing table mode state
 * 
 * Persists mode preference in localStorage and provides mode management utilities.
 * 
 * @returns {Object} Mode state and utilities
 * @returns {string} mode - Current table mode
 * @returns {Function} setMode - Function to change mode
 * @returns {Function} isHorizontal - Check if current mode is horizontal
 * @returns {Function} isRestricted - Check if current mode is restricted (side/row)
 */
export function useTableMode() {
  const isMobile = useMobile();
  
  // Initialize mode from localStorage or default to horizontal
  // On mobile, always force SIDE mode
  const [mode, setModeState] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return TABLE_MODES.SIDE; // Force side mode on mobile
    }
    try {
      const saved = localStorage.getItem(TABLE_MODE_STORAGE_KEY);
      if (saved && Object.values(TABLE_MODES).includes(saved)) {
        return saved;
      }
    } catch (e) {
      console.error('Failed to load table mode from localStorage:', e);
    }
    return TABLE_MODES.HORIZONTAL; // Default to horizontal
  });
  
  // Force side mode on mobile
  useEffect(() => {
    if (isMobile && mode !== TABLE_MODES.SIDE) {
      setModeState(TABLE_MODES.SIDE);
    }
  }, [isMobile, mode]);

  // Persist mode changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(TABLE_MODE_STORAGE_KEY, mode);
    } catch (e) {
      console.error('Failed to save table mode to localStorage:', e);
    }
  }, [mode]);

  // Set mode with validation
  const setMode = (newMode) => {
    if (Object.values(TABLE_MODES).includes(newMode)) {
      setModeState(newMode);
    } else {
      console.warn(`Invalid table mode: ${newMode}. Defaulting to horizontal.`);
      setModeState(TABLE_MODES.HORIZONTAL);
    }
  };

  // Utility functions
  const isHorizontal = () => mode === TABLE_MODES.HORIZONTAL;
  const isRestricted = () => mode === TABLE_MODES.SIDE || mode === TABLE_MODES.ROW;
  const isSide = () => mode === TABLE_MODES.SIDE;
  const isRow = () => mode === TABLE_MODES.ROW;

  return {
    mode,
    setMode,
    isHorizontal,
    isRestricted,
    isSide,
    isRow
  };
}

