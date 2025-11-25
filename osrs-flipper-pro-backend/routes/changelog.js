const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execAsync = promisify(exec);
const router = express.Router();

// Get git commits from the main branch
router.get('/', async (req, res) => {
  try {
    // Get the root directory of the project (two levels up from this file)
    const rootDir = path.resolve(__dirname, '../..');
    
    // Execute git log command to get commits from main branch with full message
    // Using a custom delimiter to separate commits
    const { stdout } = await execAsync(
      'git log main --date=iso --pretty=format:"---COMMIT_START---%n%h|%ad|%B---COMMIT_END---"',
      { cwd: rootDir, maxBuffer: 1024 * 1024 * 10 } // 10MB buffer
    );

    // Parse the output - split by commit delimiter
    const commitBlocks = stdout.split('---COMMIT_START---').filter(block => block.trim());
    
    const commits = commitBlocks.map(block => {
      // Remove the end marker
      const cleanBlock = block.replace('---COMMIT_END---', '').trim();
      const lines = cleanBlock.split('\n');
      
      // First line contains hash|date
      const [hash, date] = lines[0].split('|');
      
      // Rest of the lines are the commit message
      const message = lines.slice(1).join('\n').trim();
      
      return {
        hash: hash.trim(),
        date: date.trim(),
        message: message
      };
    });

    res.json(commits);
  } catch (error) {
    console.error('Error fetching git commits:', error);
    res.status(500).json({ error: 'Failed to fetch changelog' });
  }
});

module.exports = router;

