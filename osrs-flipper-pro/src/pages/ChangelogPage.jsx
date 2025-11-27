import React, { useState, useEffect } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';

const ChangelogPage = () => {
  const [commits, setCommits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCommits = async () => {
      try {
        setLoading(true);
        const API_BASE = process.env.REACT_APP_API_BASE || '';
        if (!API_BASE) {
          throw new Error('REACT_APP_API_BASE environment variable is required');
        }
        const response = await fetch(`${API_BASE}/api/changelog`);
        if (!response.ok) {
          throw new Error('Failed to fetch changelog');
        }
        const data = await response.json();
        setCommits(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching changelog:', err);
        setError('Failed to load changelog');
      } finally {
        setLoading(false);
      }
    };

    fetchCommits();
  }, []);

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (e) {
      return dateString;
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>
          Changelog
        </Typography>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: '900px', mx: 'auto' }}>
      <Typography 
        variant="h4" 
        gutterBottom 
        sx={{ 
          mb: 4,
          fontWeight: 600,
          color: '#111827'
        }}
      >
        Changelog
      </Typography>

      {commits.length === 0 ? (
        <Typography color="text.secondary">No commits found.</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {commits.map((commit, index) => (
            <Box
              key={`${commit.hash}-${index}`}
              sx={{
                borderLeft: '3px solid #1e1e1e',
                pl: 3,
                pb: 2,
              }}
            >
              <Typography
                variant="h5"
                sx={{
                  fontSize: '24px',
                  fontWeight: 600,
                  color: '#111827',
                  mb: 1,
                }}
              >
                {formatDate(commit.date)}
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  fontSize: '16px',
                  color: '#6b7280',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-line', // Preserve line breaks
                }}
              >
                {commit.message}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default ChangelogPage;

