const express = require('express');
const AuthMiddleware = require('../middleware/auth');

const router = express.Router();


// Current connection status
let currentConnection = {
  connected: false,
  ssid: null,
  ip: null,
  mode: 'ap', // 'ap' (Access Point) or 'sta' (Station)
  apClients: 0
};

// Scan for available networks
router.get('/scan', AuthMiddleware.requireAuth, async (req, res) => {
  try {
    // On Windows, return mock data
    if (process.platform !== 'linux') {
      console.log('[WIFI] Mock WiFi scan (development mode)');
      return res.json({
        success: true,
        networks: mockNetworks,
        timestamp: new Date().toISOString()
      });
    }
    
    // Real WiFi scanning on Raspberry Pi using nmcli
    console.log('[WIFI] Scanning for WiFi networks using nmcli...');
    
    const { exec, spawn } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    try {
      // First, get the currently connected SSID to filter it out
      let connectedSSID = null;
      try {
        const { stdout: connectedCheck } = await execAsync(
          'nmcli -t -f ACTIVE,SSID dev wifi | grep "^yes"',
          { timeout: 3000 }
        );
        if (connectedCheck.trim()) {
          connectedSSID = connectedCheck.trim().split(':')[1];
          console.log(`[WIFI] Currently connected to: ${connectedSSID}`);
        }
      } catch (e) {
        console.log('[WIFI] Not connected to any network');
      }
      
      const { stdout } = await execAsync(
        'sudo nmcli device wifi list',
        { timeout: 10000 }
      );
      
      const lines = stdout.trim().split('\n');
      if (lines.length < 2) {
        return res.json({
          success: true,
          networks: [],
          timestamp: new Date().toISOString()
        });
      }
      
      // Skip header line and parse
      const networks = lines.slice(1).map(line => {
        // Check if this is the connected networ
        const isConnected = line.startsWith('*');
        
        const cleanLine = line.replace(/^\*?\s*/, '').trim();
        
        const parts = cleanLine.split(/\s+/);
        if (parts.length < 6) return null;
        
        const bssid = parts[0] || '';
        const ssid = parts[1] || 'Hidden Network';
        const mode = parts[2] || 'Infra';
        const channel = parts[3] || '0';
        const rate = parts[4] || '0';
        const signal = parseInt(parts[5]) || 0;
        const security = parts.length > 7 ? parts.slice(7).join(' ') : 'Open';
        
        const channelNum = parseInt(channel);
        let frequency = 2437;
        if (channelNum >= 36) {
          frequency = 5000 + (channelNum * 5);
        } else if (channelNum > 0 && channelNum <= 14) {
          frequency = 2407 + (channelNum * 5);
        }
        
        return {
          ssid,
          bssid,
          signal,
          quality: Math.min(100, Math.max(0, signal)),
          security: security.includes('WPA') ? 'WPA2' : (security === '--' ? 'Open' : security),
          frequency,
          isConnected
        };
      }).filter(n => {
        return n !== null && 
               n.ssid !== '' && 
               n.ssid !== 'Hidden Network' && 
               n.ssid !== '--' &&
               !n.isConnected &&
               n.ssid !== connectedSSID;
      });
      
      console.log(`[WIFI] Found ${networks.length} available networks (excluding connected: ${connectedSSID || 'none'})`);
      
      res.json({
        success: true,
        networks,
        timestamp: new Date().toISOString()
      });
    } catch (execError) {
      console.error('[WIFI] nmcli scan error:', execError.message);
      return res.json({
        success: true,
        networks: [],
        timestamp: new Date().toISOString(),
        error: 'Scan failed: ' + execError.message
      });
    }
  } catch (error) {
    console.error('[WIFI] WiFi scan error:', error);
    res.status(500).json({ error: 'Failed to scan for networks' });
  }
});

router.get('/status', AuthMiddleware.requireAuth, async (req, res) => {
  try {
    if (process.platform !== 'linux') {
      return res.json({
        success: true,
        status: currentConnection
      });
    }
    
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    try {
      const { stdout } = await execAsync(
        'nmcli -t -f ACTIVE,SSID,SIGNAL,FREQ dev wifi list ifname wlan0 | grep "^yes"',
        { timeout: 5000 }
      );
      
      if (stdout.trim()) {
        const parts = stdout.trim().split(':');
        const ssid = parts[1] || 'Unknown';
        const signal = parts[2] || '0';
        
        let ip = 'Not assigned';
        try {
          const { stdout: ipOutput } = await execAsync(
            "ip -4 addr show wlan0 | grep -oP '(?<=inet\\s)\\d+(\\.\\d+){3}'"
          );
          ip = ipOutput.trim() || 'Not assigned';
        } catch (e) {
        }
        
        let apStatus = { running: false, ssid: 'GasGuard-AP', clients: 0 };
        try {
          const { stdout: apCheck } = await execAsync('ip addr show uap0', { timeout: 2000 });
          if (apCheck) {
            apStatus.running = true;
            try {
              const { stdout: clientCount } = await execAsync(
                'iw dev uap0 station dump | grep Station | wc -l'
              );
              apStatus.clients = parseInt(clientCount.trim()) || 0;
            } catch (e) {
            }
          }
        } catch (e) {
        }
        
        return res.json({
          success: true,
          status: {
            connected: true,
            ssid,
            signal: parseInt(signal),
            ip,
            mode: 'dual', // Both STA and AP
            apStatus
          }
        });
      } else {
        // Not connected to any network, check AP status
        let apStatus = { running: false, ssid: 'GasGuard-AP', clients: 0 };
        try {
          const { stdout: apCheck } = await execAsync('ip addr show uap0', { timeout: 2000 });
          if (apCheck) {
            apStatus.running = true;
            try {
              const { stdout: clientCount } = await execAsync(
                'iw dev uap0 station dump | grep Station | wc -l'
              );
              apStatus.clients = parseInt(clientCount.trim()) || 0;
            } catch (e) {
              // Couldn't count clients
            }
          }
        } catch (e) {
          // uap0 not running
        }
        
        return res.json({
          success: true,
          status: {
            connected: false,
            ssid: null,
            ip: null,
            mode: 'ap',
            apStatus
          }
        });
      }
    } catch (execError) {
      // No active connection
      console.log('[WIFI] Not connected to any network');
      return res.json({
        success: true,
        status: {
          connected: false,
          ssid: null,
          ip: null,
          mode: 'ap',
          apStatus: { running: true, ssid: 'GasGuard-AP', clients: 0 }
        }
      });
    }
  } catch (error) {
    console.error('[WIFI] Get WiFi status error:', error);
    res.status(500).json({ error: 'Failed to get WiFi status' });
  }
});

// Connect to a network
router.post('/connect', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const { ssid, password } = req.body;
    
    if (!ssid) {
      return res.status(400).json({ error: 'SSID is required' });
    }
    
    // On Windows, simulate connection
    if (process.platform !== 'linux') {
      console.log(`[WARNING] Mock WiFi connect to: ${ssid} (development mode)`);
      
      // Simulate connection delay
      setTimeout(() => {
        currentConnection = {
          connected: true,
          ssid,
          ip: `192.168.1.${Math.floor(Math.random() * 200) + 10}`,
          mode: 'sta',
          apClients: 0
        };
      }, 2000);
      
      return res.json({
        success: true,
        message: `Connecting to ${ssid}...`,
        ssid
      });
    }
    
    // Real WiFi connection on Raspberry Pi using nmcli
    console.log(`[WIFI] Connecting to WiFi network: ${ssid}`);
    
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    try {
      // Properly escape special characters in SSID and password
      const escapedSSID = ssid.replace(/'/g, "'\\''");
      const escapedPassword = password ? password.replace(/'/g, "'\\''") : '';
      
      let command;
      if (!password || password === 'no-password-required') {
        command = `sudo nmcli dev wifi connect '${escapedSSID}' ifname wlan0`;
      } else {
        command = `sudo nmcli dev wifi connect '${escapedSSID}' password '${escapedPassword}' ifname wlan0`;
      }
      
      console.log(`[WIFI] Executing connection command...`);
      
      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000,
        env: { ...process.env, LC_ALL: 'C' }
      });
      
      console.log(`[WIFI] Connection output:`, stdout.trim());
      
      if (stderr && !stderr.includes('successfully') && !stderr.includes('Success')) {
        console.error(`[WIFI] Connection warning:`, stderr);
      }
      
      if (stdout.includes('successfully') || stdout.includes('Success') || !stderr) {
        console.log(`[WIFI] Successfully connected to ${ssid}`);
        
        // Update connection status
        currentConnection = {
          connected: true,
          ssid,
          ip: 'Acquiring IP...',
          mode: 'sta',
          apClients: 0
        };
        
        // Get IP address after a short delay
        setTimeout(async () => {
          try {
            const { stdout: ipOutput } = await execAsync(
              "ip -4 addr show wlan0 | grep -oP '(?<=inet\\s)\\d+(\\.\\d+){3}'"
            );
            currentConnection.ip = ipOutput.trim() || 'No IP assigned';
          } catch (e) {
            console.error('[WIFI] Failed to get IP:', e.message);
          }
        }, 3000);
        
        return res.json({
          success: true,
          message: `Successfully connected to ${ssid}`,
          ssid
        });
      } else {
        throw new Error(stderr || 'Connection failed');
      }
    } catch (execError) {
      console.error(`[WIFI] Connection error:`, execError.message);
      
      // Parse common error messages
      let userMessage = 'Failed to connect to network';
      if (execError.message.includes('No network with SSID')) {
        userMessage = 'Network not found. Please try scanning again.';
      } else if (execError.message.includes('Secrets were required') || execError.message.includes('password')) {
        userMessage = 'Incorrect password. Please check and try again.';
      } else if (execError.message.includes('timeout')) {
        userMessage = 'Connection timeout. Network may be out of range.';
      }
      
      return res.status(400).json({
        success: false,
        error: userMessage,
        details: execError.message
      });
    }
  } catch (error) {
    console.error('[WIFI] WiFi connect error:', error);
    res.status(500).json({ error: 'Failed to connect to network' });
  }
});

// Disconnect from current network
router.post('/disconnect', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, (req, res) => {
  try {
    currentConnection = {
      connected: false,
      ssid: null,
      ip: null,
      mode: 'ap',
      apClients: 0
    };
    
    res.json({
      success: true,
      message: 'Disconnected from network'
    });
  } catch (error) {
    console.error('WiFi disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// Get saved networks
router.get('/saved', AuthMiddleware.requireAuth, (req, res) => {
  try {
    // Mock saved networks
    const savedNetworks = [
      {
        ssid: 'HomeNetwork-2.4G',
        priority: 1,
        savedAt: '2025-10-01T10:00:00Z'
      },
      {
        ssid: 'Office_5G',
        priority: 2,
        savedAt: '2025-09-28T14:30:00Z'
      }
    ];
    
    res.json({
      success: true,
      networks: savedNetworks
    });
  } catch (error) {
    console.error('Get saved networks error:', error);
    res.status(500).json({ error: 'Failed to retrieve saved networks' });
  }
});

// Forget a saved network
router.delete('/saved/:ssid', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, (req, res) => {
  try {
    const { ssid } = req.params;
    
    res.json({
      success: true,
      message: `Forgotten network: ${ssid}`
    });
  } catch (error) {
    console.error('Forget network error:', error);
    res.status(500).json({ error: 'Failed to forget network' });
  }
});

// Toggle AP (Access Point) mode
router.post('/ap/toggle', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, (req, res) => {
  try {
    const { enabled } = req.body;
    
    currentConnection.mode = enabled ? 'ap' : 'sta';
    
    res.json({
      success: true,
      message: `Access Point ${enabled ? 'enabled' : 'disabled'}`,
      mode: currentConnection.mode
    });
  } catch (error) {
    console.error('Toggle AP mode error:', error);
    res.status(500).json({ error: 'Failed to toggle AP mode' });
  }
});

module.exports = (db = null) => router;


