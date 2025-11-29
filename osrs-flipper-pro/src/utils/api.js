/**
 * Centralized API helper for making requests to the backend
 * Security is handled by CORS and rate limiting on the backend
 */

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3001';

/**
 * Make an API request
 * @param {string} endpoint - API endpoint (e.g., '/api/items/browse')
 * @param {RequestInit} options - Fetch options (method, body, etc.)
 * @returns {Promise<Response>}
 */
export async function apiFetch(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    const response = await fetch(url, {
        ...options,
        headers,
    });

    return response;
}

/**
 * Make an authenticated API request and parse JSON response
 * @param {string} endpoint - API endpoint
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<any>}
 */
export async function apiFetchJson(endpoint, options = {}) {
    const response = await apiFetch(endpoint, options);
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
}

