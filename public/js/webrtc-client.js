class VoiceCallClient {
  constructor() {
    this.socket = null;
    this.peerConnection = null;
    this.localStream = null;
    this.remoteAudio = null;
    this.audioContext = null;
    this.audioSource = null;
    this.audioDestination = null;
    this.isConnected = false;
    this.partnerId = null;
    this.pendingIceCandidates = [];
    this.connectionTimeout = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.audioUnlocked = false;
    this.localAudioMonitor = null;
    this.remoteAudioMonitor = null;

    // Enhanced ICE Server Configuration for all network types
    this.iceServers = {
      iceServers: [
        // Multiple STUN servers for redundancy
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.services.mozilla.com' },

        // TURN server (for restrictive networks)
        {
          urls: 'turn:127.0.0.1:3478',
          username: 'turnuser',
          credential: 'turnpass123',
        },
        {
          urls: 'turn:127.0.0.1:3478?transport=tcp',
          username: 'turnuser',
          credential: 'turnpass123',
        },
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceTransportPolicy: 'all', // Try all connection types
    };

    this.initializeUI();
    this.connectSocket();
  }

  initializeUI() {
    this.startBtn = document.getElementById('startBtn');
    this.endBtn = document.getElementById('endBtn');
    this.skipBtn = document.getElementById('skipBtn');
    this.statusText = document.getElementById('statusText');
    this.waitingUsersEl = document.getElementById('waitingUsers');
    this.activeConnectionsEl = document.getElementById('activeConnections');
    this.debugLog = document.getElementById('debugLog');

    this.startBtn.addEventListener('click', () => this.startCalling());
    this.endBtn.addEventListener('click', () => this.endCalling());
    this.skipBtn.addEventListener('click', () => this.skipPartner());
    
    // Initialize audio element in DOM
    this.remoteAudio = document.createElement('audio');
    this.remoteAudio.id = 'remoteAudio';
    this.remoteAudio.autoplay = true;
    this.remoteAudio.playsinline = true;
    document.body.appendChild(this.remoteAudio);
  }

  log(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.textContent = `[${timestamp}] ${message}`;
    this.debugLog.appendChild(logEntry);
    this.debugLog.scrollTop = this.debugLog.scrollHeight;
    console.log(message);
  }

  connectSocket() {
    this.socket = io({
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket', 'polling'], // Try websocket first, fallback to polling
    });

    this.socket.on('connect', () => {
      this.log('Connected to signaling server');
      this.updateStatus('Connected - Ready to start');
      this.reconnectAttempts = 0;
      this.requestStats();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      this.updateStatus('Disconnected from server - Reconnecting...');
      this.cleanup();
    });

    this.socket.on('reconnect_attempt', (attempt) => {
      this.log(`Reconnection attempt ${attempt}/${this.maxReconnectAttempts}`);
      this.updateStatus(`Reconnecting... (${attempt}/${this.maxReconnectAttempts})`);
    });

    this.socket.on('reconnect', (attempt) => {
      this.log(`Reconnected after ${attempt} attempts`);
      this.updateStatus('Reconnected - Ready to start');
    });

    this.socket.on('reconnect_failed', () => {
      this.log('Failed to reconnect to server');
      this.updateStatus('Connection failed. Please refresh the page.');
    });

    this.socket.on('waiting', () => {
      this.updateStatus('Waiting for a partner...');
    });

    this.socket.on('matched', async (data) => {
      this.partnerId = data.partnerId;
      this.log('Matched with partner: ' + data.partnerId);
      this.updateStatus('Matched! Connecting...');
      
      // Add a small delay to ensure both clients are ready
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify we still have a partner before setting up call
      if (this.partnerId === data.partnerId) {
        await this.setupCall(true);
      } else {
        this.log('Match cancelled before connection could be established');
        this.updateStatus('Match cancelled. Finding new partner...');
      }
    });

    this.socket.on('webrtc-offer', async (data) => {
      this.partnerId = data.from;
      await this.handleOffer(data.offer);
    });

    this.socket.on('webrtc-answer', async (data) => {
      await this.handleAnswer(data.answer);
    });

    this.socket.on('webrtc-ice-candidate', async (data) => {
      await this.handleIceCandidate(data.candidate);
    });

    this.socket.on('partner-disconnected', () => {
      this.updateStatus('Partner disconnected');
      this.cleanup();
      this.enableButtons(true, false, false);
    });

    this.socket.on('partner-skipped', () => {
      this.log('Partner skipped you - finding new match');
      this.updateStatus('Partner skipped you. Finding new match...');
      this.cleanup();
      // Keep end button enabled as we're still in calling mode
      this.enableButtons(false, true, false);
    });

    this.socket.on('partner-ended', () => {
      this.updateStatus('Partner ended the call');
      this.cleanup();
      this.enableButtons(true, false, false);
    });

    this.socket.on('call-ended', () => {
      this.updateStatus('Call ended');
      this.cleanup();
      this.enableButtons(true, false, false);
    });

    this.socket.on('connection-invalid', () => {
      this.log('Connection is no longer valid');
      this.updateStatus('Connection cancelled. Click Start to try again.');
      this.cleanup();
      this.enableButtons(true, false, false);
    });

    this.socket.on('stats', (stats) => {
      this.waitingUsersEl.textContent = stats.waitingUsers;
      this.activeConnectionsEl.textContent = stats.activeConnections;
    });

    setInterval(() => this.requestStats(), 5000);
  }

  async startCalling() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        },
        video: false, // Audio only
      });

      this.log('Audio stream started');
      
      // Verify microphone is working
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        this.log(`Microphone: ${audioTrack.label}`);
        this.log(`Track enabled: ${audioTrack.enabled}, muted: ${audioTrack.muted}, readyState: ${audioTrack.readyState}`);
        
        // Monitor local audio levels
        this.startLocalAudioMonitoring();
      }
      
      this.updateStatus('Microphone access granted. Finding partner...');
      this.socket.emit('start-calling');
      this.enableButtons(false, true, false);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      this.updateStatus('Error: Cannot access microphone');
      alert('Please allow microphone access to use voice calling');
    }
  }

  async setupCall(isInitiator) {
    try {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
      }

      this.connectionTimeout = setTimeout(() => {
        if (
          this.peerConnection &&
          this.peerConnection.iceConnectionState === 'checking'
        ) {
          this.log('Connection timeout - taking too long');
          this.updateStatus(
            'Connection timeout. Click skip to try another partner.',
          );
          this.enableButtons(false, true, true);
        }
      }, 30000);

      this.peerConnection = new RTCPeerConnection(this.iceServers);
      this.pendingIceCandidates = [];

      this.localStream.getTracks().forEach((track) => {
        this.log(`Adding local ${track.kind} track - enabled: ${track.enabled}, muted: ${track.muted}`);
        this.peerConnection.addTrack(track, this.localStream);
      });

      this.peerConnection.ontrack = (event) => {
        this.log('Received remote track: ' + event.track.kind);
        
        if (event.track.kind === 'audio') {
          this.log('Setting up remote audio stream');
          this.log(`Remote track - enabled: ${event.track.enabled}, muted: ${event.track.muted}, readyState: ${event.track.readyState}`);
          
          // SIMPLE APPROACH: Directly assign stream to audio element (like the article)
          this.remoteAudio.srcObject = event.streams[0];
          this.remoteAudio.volume = 1.0;
          this.remoteAudio.muted = false;
          
          // Try to play
          this.remoteAudio.play()
            .then(() => {
              this.log('✓ Remote audio playing successfully');
              this.log(`Audio state - volume: ${this.remoteAudio.volume}, paused: ${this.remoteAudio.paused}`);
            })
            .catch((e) => {
              this.log('⚠ Audio autoplay blocked: ' + e.message);
              this.log('Click anywhere to enable audio');
              
              // Add one-time click handler
              const enableAudio = () => {
                this.remoteAudio.play()
                  .then(() => {
                    this.log('✓ Audio enabled after user click');
                  })
                  .catch(err => this.log('✗ Failed to play: ' + err.message));
                document.body.removeEventListener('click', enableAudio);
              };
              document.body.addEventListener('click', enableAudio);
            });
          
          // Monitor audio levels for diagnostics
          this.startAudioLevelMonitoring(event.streams[0]);
        }
      };

      this.peerConnection.onicegatheringstatechange = () => {
        this.log(
          'ICE gathering state: ' + this.peerConnection.iceGatheringState,
        );
      };

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.log('Sending ICE candidate: ' + event.candidate.type);
          this.socket.emit('webrtc-ice-candidate', {
            candidate: event.candidate,
          });
        } else {
          this.log('All ICE candidates gathered and sent');
        }
      };

      this.peerConnection.oniceconnectionstatechange = () => {
        this.log('ICE state: ' + this.peerConnection.iceConnectionState);
        if (
          this.peerConnection.iceConnectionState === 'connected' ||
          this.peerConnection.iceConnectionState === 'completed'
        ) {
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          this.isConnected = true;
          
          // Diagnostic: Check audio tracks
          const senders = this.peerConnection.getSenders();
          const receivers = this.peerConnection.getReceivers();
          this.log(`Connection established - Senders: ${senders.length}, Receivers: ${receivers.length}`);
          
          senders.forEach(sender => {
            if (sender.track) {
              this.log(`Sending ${sender.track.kind} track - enabled: ${sender.track.enabled}, muted: ${sender.track.muted}`);
            }
          });
          
          receivers.forEach(receiver => {
            if (receiver.track) {
              this.log(`Receiving ${receiver.track.kind} track - enabled: ${receiver.track.enabled}, muted: ${receiver.track.muted}`);
            }
          });
          
          this.updateStatus('Connected! You can talk now');
          this.enableButtons(false, true, true);
        } else if (this.peerConnection.iceConnectionState === 'checking') {
          this.updateStatus('Establishing connection...');
        } else if (this.peerConnection.iceConnectionState === 'failed') {
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          this.log('ICE connection failed - connection not possible');
          this.updateStatus('Connection failed. Try skip to find new partner.');
          this.enableButtons(false, true, true);
        } else if (this.peerConnection.iceConnectionState === 'disconnected') {
          this.log('ICE connection disconnected - waiting for reconnection');
          this.updateStatus('Connection interrupted...');
          setTimeout(() => {
            if (
              this.peerConnection &&
              this.peerConnection.iceConnectionState === 'disconnected'
            ) {
              this.log('Still disconnected after timeout');
              this.updateStatus('Connection lost. Click skip for new partner.');
              this.enableButtons(false, true, true);
            }
          }, 5000);
        }
      };

      this.peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', this.peerConnection.connectionState);

        if (this.peerConnection.connectionState === 'connected') {
          this.isConnected = true;
          this.updateStatus('Connected! You can talk now');
          this.enableButtons(false, true, true);
        } else if (
          this.peerConnection.connectionState === 'disconnected' ||
          this.peerConnection.connectionState === 'failed'
        ) {
          this.updateStatus('Connection lost');
          this.cleanup();
          this.enableButtons(true, false, false);
        }
      };

      // Create offer/answer for audio connection
      if (isInitiator) {
        const offer = await this.peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false, // Audio only
          iceRestart: false,
        });
        await this.peerConnection.setLocalDescription(offer);
        this.log('Created and sent offer');
        this.socket.emit('webrtc-offer', { offer });
      }
    } catch (error) {
      console.error('Error setting up call:', error);
      this.updateStatus('Error setting up call');
    }
  }

  async handleOffer(offer) {
    try {
      this.log('Received offer from partner');
      
      // Verify we still have a valid partner
      if (!this.partnerId) {
        this.log('Ignoring offer - no valid partner');
        return;
      }
      
      if (!this.localStream) {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
          },
          video: false, // Audio only
        });
        
        this.log('Audio stream started');
      }

      await this.setupCall(false);
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer),
      );

      while (this.pendingIceCandidates.length > 0) {
        const candidate = this.pendingIceCandidates.shift();
        await this.peerConnection.addIceCandidate(
          new RTCIceCandidate(candidate),
        );
        this.log('Added queued ICE candidate');
      }

      const answer = await this.peerConnection.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false, // Audio only
      });
      await this.peerConnection.setLocalDescription(answer);
      this.log('Created and sent answer');
      this.socket.emit('webrtc-answer', { answer });
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }

  async handleAnswer(answer) {
    try {
      this.log('Received answer from partner');
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer),
      );

      while (this.pendingIceCandidates.length > 0) {
        const candidate = this.pendingIceCandidates.shift();
        await this.peerConnection.addIceCandidate(
          new RTCIceCandidate(candidate),
        );
        this.log('Added queued ICE candidate from answer');
      }
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }

  async handleIceCandidate(candidate) {
    try {
      // Extract candidate type from the candidate string
      const candidateType = candidate.type || 
        (candidate.candidate && candidate.candidate.includes('typ relay') ? 'relay' :
         candidate.candidate && candidate.candidate.includes('typ srflx') ? 'srflx' :
         candidate.candidate && candidate.candidate.includes('typ host') ? 'host' : 'unknown');
      
      this.log('Received ICE candidate: ' + candidateType);
      
      if (this.peerConnection && this.peerConnection.remoteDescription) {
        await this.peerConnection.addIceCandidate(
          new RTCIceCandidate(candidate),
        );
        this.log('Added ICE candidate: ' + candidateType);
      } else {
        this.log('Queuing ICE candidate (no remote description yet)');
        this.pendingIceCandidates.push(candidate);
      }
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  }

  skipPartner() {
    this.updateStatus('Skipping partner...');
    this.socket.emit('skip-partner');
    this.cleanup();
    this.enableButtons(false, true, false);
  }

  endCalling() {
    this.updateStatus('Ending call...');
    this.socket.emit('end-calling');
    this.cleanup();
    this.enableButtons(true, false, false);
  }

  cleanup() {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    
    if (this.localAudioMonitor) {
      clearInterval(this.localAudioMonitor);
      this.localAudioMonitor = null;
    }
    
    if (this.remoteAudioMonitor) {
      clearInterval(this.remoteAudioMonitor);
      this.remoteAudioMonitor = null;
    }
    
    // Disconnect audio source
    if (this.audioSource) {
      try {
        this.audioSource.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      this.audioSource = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.remoteAudio) {
      this.remoteAudio.pause();
      this.remoteAudio.srcObject = null;
      // Don't remove the audio element, just clear its source
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    this.isConnected = false;
    this.partnerId = null;
    this.pendingIceCandidates = [];
  }

  updateStatus(message) {
    this.statusText.textContent = message;
  }

  enableButtons(start, end, skip) {
    this.startBtn.disabled = !start;
    this.endBtn.disabled = !end;
    this.skipBtn.disabled = !skip;
  }

  requestStats() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('get-stats');
    }
  }
  
  startAudioLevelMonitoring(stream) {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.log('AudioContext created for monitoring');
      }
      
      // Clean up previous monitoring
      if (this.remoteAudioMonitor) {
        clearInterval(this.remoteAudioMonitor);
      }
      if (this.audioSource) {
        try {
          this.audioSource.disconnect();
        } catch (e) {}
      }
      
      // Create analyser for monitoring only (not for playback)
      const source = this.audioContext.createMediaStreamSource(stream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      // Note: NOT connecting to destination - audio plays through <audio> element
      
      this.audioSource = source;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      // Monitor levels every 2 seconds
      this.remoteAudioMonitor = setInterval(() => {
        if (!this.peerConnection || this.peerConnection.iceConnectionState !== 'connected') return;
        
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        
        if (average > 5) {
          this.log(`🔊 Remote audio level: ${Math.round(average)}`);
        }
      }, 2000);
      
      this.log('Audio level monitoring started');
    } catch (error) {
      this.log('Error starting audio monitoring: ' + error.message);
    }
  }
  
  startLocalAudioMonitoring() {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      const source = this.audioContext.createMediaStreamSource(this.localStream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const checkAudioLevel = () => {
        if (!this.localStream) return;
        
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        
        if (average > 5) {
          this.log(`🎤 Local audio level: ${Math.round(average)}`);
        }
      };
      
      // Check every 2 seconds
      this.localAudioMonitor = setInterval(checkAudioLevel, 2000);
      
      this.log('Local audio monitoring started');
    } catch (error) {
      this.log('Error starting local audio monitoring: ' + error.message);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new VoiceCallClient();
});
