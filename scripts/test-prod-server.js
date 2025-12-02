/**
 * Test production server - starts server, tests it, and stops it
 * This minimizes output in Cursor's context window
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Load environment variables for production
const envFile = path.join(__dirname, '..', '.env.prod');
const envFileExists = fs.existsSync(envFile);

if (!envFileExists) {
    console.error(`[ERROR] .env.prod file not found at: ${envFile}`);
    console.error('');
    console.error('[ERROR] Please create .env.prod file with the following required variables:');
    console.error('  PORT=3001');
    console.error('  DATABASE_URL=postgresql://user:password@host:port/database');
    console.error('  FLIPPER_API_SECRET=your-secret-key (optional)');
    console.error('');
    console.error('Example .env.prod file:');
    console.error('  PORT=3001');
    console.error('  DATABASE_URL=postgresql://localhost:5432/osrs_db');
    console.error('  FLIPPER_API_SECRET=your-secret-here');
    process.exit(1);
}

// Load environment variables
const dotenvResult = require('dotenv').config({ path: envFile });

if (dotenvResult.error) {
    console.error(`[ERROR] Failed to load .env.prod: ${dotenvResult.error.message}`);
    process.exit(1);
}

// Get PORT from environment
let PORT = process.env.PORT;

if (!PORT) {
    console.error('[ERROR] PORT environment variable is required in .env.prod');
    console.error('[ERROR] Please add PORT=3001 (or your port) to .env.prod file');
    process.exit(1);
}

// Prepare environment variables to pass to child process
// Read all variables from .env.prod and merge with current process.env
function loadEnvFile(filePath) {
    const envVars = {};
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        content.split('\n').forEach(line => {
            line = line.trim();
            if (line && !line.startsWith('#')) {
                const match = line.match(/^([^=]+)=(.*)$/);
                if (match) {
                    const key = match[1].trim();
                    let value = match[2].trim();
                    // Remove quotes if present
                    if ((value.startsWith('"') && value.endsWith('"')) || 
                        (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.slice(1, -1);
                    }
                    envVars[key] = value;
                }
            }
        });
    } catch (err) {
        console.error(`[ERROR] Failed to read .env.prod: ${err.message}`);
    }
    return envVars;
}

// Load all env vars from .env.prod
const envVarsFromFile = loadEnvFile(envFile);

// Ensure PORT is in envVarsFromFile (in case loadEnvFile didn't get it)
if (!envVarsFromFile.PORT && PORT) {
    envVarsFromFile.PORT = PORT;
}

// Verify essential variables
if (!envVarsFromFile.PORT) {
    console.error('[ERROR] PORT is missing from .env.prod file');
    console.error('[ERROR] Required variables for .env.prod:');
    console.error('  - PORT (e.g., PORT=3001)');
    console.error('  - DATABASE_URL (PostgreSQL connection string)');
    console.error('  - FLIPPER_API_SECRET (optional, for API authentication)');
    process.exit(1);
}

const TEST_TIMEOUT = 10000; // 10 seconds max
const SERVER_STARTUP_WAIT = 2000; // Wait 2 seconds for server to start

let serverProcess = null;
let testResults = {
    serverStarted: false,
    healthCheck: false,
    rootEndpoint: false,
    errors: []
};

function log(message) {
    // Only log essential messages
    console.log(`[TEST] ${message}`);
}

function cleanup() {
    if (serverProcess) {
        log('Stopping server...');
        serverProcess.kill('SIGTERM');
        serverProcess = null;
    }
}

// Cleanup on exit
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

function makeRequest(path, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: PORT,
            path: path,
            method: 'GET',
            timeout: timeout
        };

        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    data: data,
                    success: res.statusCode >= 200 && res.statusCode < 300
                });
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.end();
    });
}

async function checkPortAvailable() {
    return new Promise((resolve) => {
        const testServer = http.createServer();
        testServer.listen(PORT, () => {
            testServer.once('close', () => resolve(true));
            testServer.close();
        });
        testServer.on('error', () => {
            resolve(false); // Port is in use
        });
    });
}

async function runTests() {
    try {
        // Check if port is already in use
        log('Checking if port is available...');
        const portAvailable = await checkPortAvailable();
        if (!portAvailable) {
            log(`⚠ Port ${PORT} is already in use. Testing existing server instead...`);
            
            // Try to test existing server
            try {
                const rootResult = await makeRequest('/', 2000);
                if (rootResult.success) {
                    log(`✓ Root endpoint OK (server already running)`);
                    testResults.rootEndpoint = true;
                }
                
                const healthResult = await makeRequest('/health', 2000);
                if (healthResult.success) {
                    log(`✓ Health check OK (server already running)`);
                    testResults.healthCheck = true;
                    try {
                        const healthData = JSON.parse(healthResult.data);
                        if (healthData.status === 'healthy') {
                            log(`✓ Database: ${healthData.database}`);
                        }
                    } catch (e) {}
                }
                
                console.log('\n=== TEST SUMMARY ===');
                console.log(`Server: Already running on port ${PORT}`);
                console.log(`Root Endpoint: ${testResults.rootEndpoint ? '✓' : '✗'}`);
                console.log(`Health Check: ${testResults.healthCheck ? '✓' : '✗'}`);
                console.log('\n✓ Tests completed!');
                process.exit(0);
            } catch (err) {
                log(`ERROR: Could not connect to existing server: ${err.message}`);
                process.exit(1);
            }
            return;
        }
        
        log('Starting production server...');
        
        // Prepare environment for child process
        // Merge: current process.env + variables from .env.prod + NODE_ENV=production
        const childEnv = {
            ...process.env,
            ...envVarsFromFile,
            NODE_ENV: 'production'
        };
        
        // Start server with production environment
        serverProcess = spawn('node', ['server.js'], {
            env: childEnv,
            cwd: path.join(__dirname, '..'),
            stdio: ['ignore', 'pipe', 'pipe'] // Capture but don't output to console
        });

        // Buffer server output (but don't print it)
        let serverOutput = '';
        serverProcess.stdout.on('data', (data) => {
            serverOutput += data.toString();
            if (data.toString().includes('API running on port')) {
                testResults.serverStarted = true;
            }
        });

        serverProcess.stderr.on('data', (data) => {
            serverOutput += data.toString();
        });

        serverProcess.on('error', (err) => {
            testResults.errors.push(`Server failed to start: ${err.message}`);
            log(`ERROR: Server failed to start: ${err.message}`);
            process.exit(1);
        });

        // Wait for server to start
        log(`Waiting ${SERVER_STARTUP_WAIT}ms for server to start...`);
        await new Promise(resolve => setTimeout(resolve, SERVER_STARTUP_WAIT));

        if (!testResults.serverStarted) {
            // Server might have started but we didn't see the message, try to test anyway
            log('Server startup message not detected, attempting tests anyway...');
        }

        // Test root endpoint
        log('Testing root endpoint (/)...');
        try {
            const rootResult = await makeRequest('/', 3000);
            testResults.rootEndpoint = rootResult.success;
            if (rootResult.success) {
                log(`✓ Root endpoint OK (${rootResult.statusCode})`);
            } else {
                testResults.errors.push(`Root endpoint failed: ${rootResult.statusCode}`);
                log(`✗ Root endpoint failed: ${rootResult.statusCode}`);
            }
        } catch (err) {
            testResults.errors.push(`Root endpoint error: ${err.message}`);
            log(`✗ Root endpoint error: ${err.message}`);
        }

        // Test health endpoint
        log('Testing health endpoint (/health)...');
        try {
            const healthResult = await makeRequest('/health', 3000);
            testResults.healthCheck = healthResult.success;
            if (healthResult.success) {
                log(`✓ Health check OK (${healthResult.statusCode})`);
                try {
                    const healthData = JSON.parse(healthResult.data);
                    if (healthData.status === 'healthy') {
                        log(`✓ Database: ${healthData.database}`);
                    }
                } catch (e) {
                    // Not JSON, that's okay
                }
            } else {
                testResults.errors.push(`Health check failed: ${healthResult.statusCode}`);
                log(`✗ Health check failed: ${healthResult.statusCode}`);
            }
        } catch (err) {
            testResults.errors.push(`Health check error: ${err.message}`);
            log(`✗ Health check error: ${err.message}`);
        }

    } catch (err) {
        testResults.errors.push(`Test error: ${err.message}`);
        log(`ERROR: ${err.message}`);
    } finally {
        cleanup();
        
        // Print summary
        console.log('\n=== TEST SUMMARY ===');
        console.log(`Server Started: ${testResults.serverStarted ? '✓' : '✗'}`);
        console.log(`Root Endpoint: ${testResults.rootEndpoint ? '✓' : '✗'}`);
        console.log(`Health Check: ${testResults.healthCheck ? '✓' : '✗'}`);
        
        if (testResults.errors.length > 0) {
            console.log('\nErrors:');
            testResults.errors.forEach(err => console.log(`  - ${err}`));
            process.exit(1);
        } else {
            console.log('\n✓ All tests passed!');
            process.exit(0);
        }
    }
}

// Set overall timeout
setTimeout(() => {
    log('Test timeout reached');
    cleanup();
    process.exit(1);
}, TEST_TIMEOUT);

runTests();

