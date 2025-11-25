# Setup Your Own TURN Server (Free, No 3rd Party)

## Why You Need TURN

When users are on different networks (WiFi ↔ Mobile Data), direct WebRTC connections often fail due to NAT/firewalls. A TURN server relays the traffic.

**Good News:** You can run your own TURN server for FREE on your existing server!

---

## Install Coturn (Free Open Source TURN Server)

### Step 1: Install Coturn

```bash
# Update system
sudo apt-get update

# Install coturn
sudo apt-get install coturn -y
```

### Step 2: Configure Coturn

Edit the config file:
```bash
sudo nano /etc/turnserver.conf
```

Add these lines (replace with your values):
```conf
# Basic settings
listening-port=3478
fingerprint
lt-cred-mech

# Your server's public IP (find with: curl ifconfig.me)
external-ip=YOUR_PUBLIC_IP

# Authentication
user=myusername:mypassword
realm=yourdomain.com

# Logging
verbose
log-file=/var/log/turnserver.log

# Security
no-multicast-peers
no-cli

# Ports for relay
min-port=49152
max-port=65535
```

### Step 3: Enable and Start Coturn

```bash
# Enable coturn
sudo nano /etc/default/coturn
# Uncomment this line: TURNSERVER_ENABLED=1

# Start the service
sudo systemctl start coturn
sudo systemctl enable coturn

# Check status
sudo systemctl status coturn
```

### Step 4: Open Firewall Ports

```bash
# Allow TURN ports
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 49152:65535/tcp
sudo ufw allow 49152:65535/udp
```

### Step 5: Update Your App

Edit `public/js/webrtc-client.js`:

```javascript
this.iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:YOUR_PUBLIC_IP:3478',
      username: 'myusername',
      credential: 'mypassword',
    },
    {
      urls: 'turn:YOUR_PUBLIC_IP:3478?transport=tcp',
      username: 'myusername',
      credential: 'mypassword',
    },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceTransportPolicy: 'all',
};
```

---

## Option 2: Use Public STUN Only (Limited)

If both users have moderate NAT (not strict), you can try STUN-only:

```javascript
this.iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};
```

**Limitations:**
- ✅ Works for same network
- ✅ Works for moderate NAT
- ❌ Fails for strict NAT (mobile data, corporate networks)
- ❌ Won't work WiFi ↔ Mobile Data in most cases

---

## Testing Your TURN Server

### Test 1: Check if Coturn is Running
```bash
sudo systemctl status coturn
```

### Test 2: Test TURN Connectivity
```bash
# Install turnutils
sudo apt-get install libnice-dev -y

# Test your TURN server
turnutils_uclient -v -u myusername -w mypassword YOUR_PUBLIC_IP
```

### Test 3: Check from Browser
Open your app and look for:
```
Sending ICE candidate: relay  ← This means TURN is working!
```

---

## Cost Comparison

| Solution | Setup Time | Monthly Cost | Reliability |
|----------|------------|--------------|-------------|
| **Your Own Coturn** | 15 min | $0 (uses your server) | ⭐⭐⭐⭐⭐ |
| **Public STUN Only** | 0 min | $0 | ⭐⭐ (limited) |
| **Metered.ca Free** | 2 min | $0 (20GB limit) | ⭐⭐⭐⭐ |
| **OpenRelay Public** | 0 min | $0 (shared) | ⭐⭐⭐ |

---

## Recommended Approach

**For Production (Best):**
1. Install Coturn on your server (15 minutes)
2. Use your own TURN server
3. No 3rd party dependency
4. Unlimited bandwidth
5. Full control

**For Testing (Quick):**
1. Use OpenRelay public TURN (already configured)
2. Test if it works
3. Later install your own Coturn

---

## Your Server Requirements

- ✅ Ubuntu/Debian server (you already have this)
- ✅ Public IP address
- ✅ Ports 3478 and 49152-65535 available
- ✅ Root/sudo access

That's it! No monthly fees, no 3rd party APIs, completely free.
