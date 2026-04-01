/**
 * Kiosk Vision - Accessible AI Kiosk
 * Refactored State Management & Logic
 */

// ═══ GLOBAL STATE ═══
const state = {
  mode: 'normal',
  cart: [],
  startTime: Date.now(),
  gazeTimer: null,
  gazeTarget: null,
  isListening: false,
  recognition: null,
  selectedPayment: null,
  synth: window.speechSynthesis,
  voicesLoaded: false,
};

const GAZE_MS = 1500;
const gazeCursor = document.getElementById('gaze-cursor');
const announcer = document.getElementById('a11y-announcer');

// Wait for voices to load
if (state.synth) {
  state.synth.onvoiceschanged = () => { state.voicesLoaded = true; };
}

// ═══ UTILS ═══
function ts() {
  const s = Math.floor((Date.now() - state.startTime) / 1000);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function log(msg, type = 'action') {
  const list = document.getElementById('log-list');
  if (!list) return;
  const el = document.createElement('div');
  el.className = `log-item ${type}`;
  
  const timeSpan = document.createElement('span');
  timeSpan.className = 'log-time';
  timeSpan.textContent = ts();
  
  const msgSpan = document.createElement('span');
  msgSpan.className = 'log-msg';
  msgSpan.textContent = msg;
  
  el.appendChild(timeSpan);
  el.appendChild(msgSpan);
  list.appendChild(el);
  list.scrollTop = list.scrollHeight;
}

function announce(text) {
  if (announcer) announcer.textContent = text;
}

function speak(text, cb) {
  if (!state.synth) return cb && cb();
  
  state.synth.cancel(); // Stop any current speech
  
  // Pause recognition during TTS to prevent feedback loop
  const tempListening = state.isListening;
  if (tempListening) stopListening();

  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.92; 
  u.pitch = 1; 
  u.lang = 'en-IN';
  
  u.onend = () => {
    // Restart listening if we were listening, but wait a tiny bit for mic to completely clear
    if (tempListening && state.mode === 'blind') {
      setTimeout(() => startListening(), 300);
    }
    if (cb) cb();
  };
  
  state.synth.speak(u);
  log('🔊 ' + text, 'voice');
}

function totalPrice() {
  return state.cart.reduce((s, i) => s + i.price, 0);
}

function setVoiceUI(txt) {
  ['voice-status', 'voice-status-cart', 'voice-status-pay'].forEach(id => {
    const el = document.getElementById(id); 
    if (el) el.textContent = txt;
  });
}

// ═══ UI NAVIGATION ═══
function goScreen(id) {
  stopListening();
  cancelGaze();
  
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
  
  if (id === 'screen-cart') renderCart();
  if (id === 'screen-payment') {
    const amtEl = document.getElementById('pay-amount');
    if (amtEl) amtEl.textContent = `₹${totalPrice()}`;
    
    document.getElementById('nfc-area').classList.remove('active');
    document.getElementById('confirm-pay-btn').style.display = 'none';
    
    document.querySelectorAll('.payment-card').forEach(c => {
      c.classList.remove('selected');
      c.setAttribute('aria-checked', 'false');
    });
    state.selectedPayment = null;
  }
  
  const totalStr = `₹${totalPrice()}`;
  const announces = {
    'screen-menu': 'Menu screen. 4 items available. Say an item name to add it. Say checkout when ready.',
    'screen-cart': `Cart screen. ${state.cart.length} item${state.cart.length !== 1 ? 's' : ''}. Total ${totalStr}. Say confirm to go to payment. Say back to add more items.`,
    'screen-payment': `Payment screen. Total is ${totalStr}. Say UPI, card, cash, or wallet to choose your payment method. Then say confirm.`
  };
  
  announce(announces[id] || `${id.replace('screen-','')}`);
  if (state.mode === 'blind' && announces[id]) {
    speak(announces[id], () => { if (state.mode === 'blind') startListening(); });
  }
}

// ═══ CART OPERATIONS ═══
function addItem(id, name, emoji, priceText) {
  const parsedPrice = parseInt(priceText.replace(/[^0-9]/g, ''), 10);
  state.cart.push({ id, name, emoji, priceStr: priceText, price: parsedPrice });
  
  log(`🛒 Added: ${emoji} ${name} (${priceText})`, 'action');
  
  const msg = `${name} added. Cart has ${state.cart.length} item${state.cart.length !== 1 ? 's' : ''}.`;
  announce(msg);
  
  if (state.mode === 'blind') {
    speak(`Added ${name} at ${priceText}. Say another item or say checkout.`);
  } else if (state.mode === 'cognitive') {
    speak(`${name} added!`);
  }
}

function renderCart() {
  const el = document.getElementById('cart-items');
  if (!el) return;
  
  el.innerHTML = ''; // Clear previous securely
  
  if (state.cart.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.style.color = 'var(--muted)';
    emptyDiv.style.fontSize = '14px';
    emptyDiv.style.padding = '18px 0';
    emptyDiv.textContent = 'Cart is empty.';
    el.appendChild(emptyDiv);
  } else {
    state.cart.forEach(item => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'cart-item';
      
      const infoDiv = document.createElement('div');
      infoDiv.className = 'cart-item-info';
      
      const emojiSpan = document.createElement('span');
      emojiSpan.className = 'cart-item-emoji';
      emojiSpan.setAttribute('aria-hidden', 'true');
      emojiSpan.textContent = item.emoji;
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'cart-item-name';
      nameSpan.textContent = item.name;
      
      infoDiv.appendChild(emojiSpan);
      infoDiv.appendChild(nameSpan);
      
      const priceSpan = document.createElement('span');
      priceSpan.className = 'cart-item-price';
      priceSpan.textContent = `₹${item.price}`;
      
      itemDiv.appendChild(infoDiv);
      itemDiv.appendChild(priceSpan);
      el.appendChild(itemDiv);
    });
  }
  
  const totalEl = document.getElementById('cart-total-price');
  if (totalEl) totalEl.textContent = `₹${totalPrice()}`;
}

// ═══ PAYMENT ═══
function selectPayment(type) {
  document.querySelectorAll('.payment-card').forEach(c => {
    c.classList.remove('selected');
    c.setAttribute('aria-checked', 'false');
  });
  
  const card = document.querySelector(`[data-type="${type}"]`);
  if (card) {
    card.classList.add('selected');
    card.setAttribute('aria-checked', 'true');
  }
  
  state.selectedPayment = type;
  
  const msgs = {
    upi: 'UPI NFC selected. Hold your phone to the kiosk screen. Say confirm when ready.',
    card: 'Card selected. Insert your card in the slot below. Say confirm when ready.',
    cash: 'Cash selected. Insert notes below. Say confirm when ready.',
    wallet: 'Wallet selected. Tap your card. Say confirm when ready.'
  };
  
  log(`💳 Payment method: ${type.toUpperCase()}`, 'payment');
  announce(`Payment method set to ${type}`);
  
  if (state.mode === 'blind') speak(msgs[type]);
  
  const nfc = document.getElementById('nfc-area');
  const confirmBtn = document.getElementById('confirm-pay-btn');
  
  if (type === 'upi') { 
    nfc.classList.add('active'); nfc.setAttribute('aria-hidden', 'false');
    confirmBtn.style.display = 'none'; 
  } else { 
    nfc.classList.remove('active'); nfc.setAttribute('aria-hidden', 'true');
    confirmBtn.style.display = 'flex'; 
  }
}

function simulatePayment() {
  if (!state.selectedPayment && state.mode !== 'blind') {
    if (state.mode === 'blind') speak('Please choose a payment method first. Say UPI, card, or cash.');
    return;
  }
  
  log('📡 Payment initiated', 'payment');
  log('✅ Webhook received — payment confirmed', 'payment');
  
  const amt = `₹${totalPrice()}`;
  document.getElementById('success-amount').textContent = amt;
  announce(`Payment successful. Total paid ${amt}.`);
  
  if (state.mode === 'blind') {
    speak(`Payment of ${amt} confirmed. Your order is being prepared. Thank you!`);
  } else if (state.mode === 'cognitive') {
    speak('All done! Order is on its way!');
  }
  
  setTimeout(() => goScreen('screen-success'), state.mode === 'blind' ? 3500 : 400);
}

function resetKiosk() {
  state.cart = [];
  state.selectedPayment = null;
  goScreen('screen-menu');
  log('🔄 New session started', 'action');
  announce('New session started.');
  if (state.mode === 'blind') speak('New session. Welcome! What would you like today?');
}

// ═══ SPEECH RECOGNITION ═══
function initRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    log('⚠️ No speech recognition API available in this browser', 'asr');
    return false;
  }
  
  state.recognition = new SR();
  state.recognition.continuous = false;
  state.recognition.interimResults = true;
  state.recognition.lang = 'en-IN';
  
  state.recognition.onstart = () => {
    state.isListening = true;
    setVoiceUI('🎤 Listening…');
    document.querySelectorAll('.mic-btn').forEach(b => {
      b.classList.add('listening');
      b.setAttribute('aria-label', 'Stop microphone');
    });
    log('🎤 Listening…', 'asr');
  };
  
  state.recognition.onresult = (e) => {
    const t = Array.from(e.results).map(r => r[0].transcript).join('').toLowerCase().trim();
    setVoiceUI('Heard: "' + t + '"');
    if (e.results[e.results.length - 1].isFinal) {
      log('🗣️ "' + t + '"', 'asr');
      handleVoice(t);
    }
  };
  
  state.recognition.onend = () => {
    state.isListening = false;
    document.querySelectorAll('.mic-btn').forEach(b => {
      b.classList.remove('listening');
      b.setAttribute('aria-label', 'Start microphone');
    });
    setVoiceUI('Click 🎤 to speak');
  };
  
  state.recognition.onerror = (e) => {
    state.isListening = false;
    document.querySelectorAll('.mic-btn').forEach(b => b.classList.remove('listening'));
    // Aborted is normal when stopped manually
    if (e.error !== 'aborted') {
      let msg = '⚠️ ASR error: ' + e.error;
      if (e.error === 'network') {
        if (window.location.protocol === 'file:') {
          msg = '🚨 ASR Network Error: You cannot run Voice AI from a file:// URL. Use http://localhost:8000';
        } else {
          msg = '🚨 ASR Network Error: Check your internet, or if using Brave Browser, switch to Chrome.';
        }
      }
      log(msg, 'asr');
    }
    setVoiceUI('Error. Click 🎤 to retry.');
  };
  
  return true;
}

function startListening() {
  if (!state.recognition && !initRecognition()) return;
  if (state.isListening) return;
  try { state.recognition.start(); } catch (e) {}
}

function stopListening() {
  if (state.recognition && state.isListening) {
    try { state.recognition.stop(); } catch (e) {}
  }
}

function toggleListening() {
  if (state.isListening) stopListening(); else startListening();
}

function handleVoice(t) {
  const activeScreen = document.querySelector('.screen.active');
  const scr = activeScreen ? activeScreen.id : '';
  
  if (scr === 'screen-menu') {
    if (t.includes('coffee')) return addItem('coffee','Coffee','☕','₹120');
    if (t.includes('sandwich')) return addItem('sandwich','Sandwich','🥪','₹180');
    if (t.includes('juice')) return addItem('juice','Fresh Juice','🍹','₹90');
    if (t.includes('snack') || t.includes('box')) return addItem('snackbox','Snack Box','🍱','₹220');
    if (t.includes('checkout') || t.includes('cart') || t.includes('done') || t.includes('next')) {
      return speak('Going to cart.', () => goScreen('screen-cart'));
    }
    speak('Say coffee, sandwich, juice, snack box, or checkout.');
  }
  else if (scr === 'screen-cart') {
    if (t.includes('confirm') || t.includes('pay') || t.includes('proceed') || t.includes('next')) {
      return speak('Going to payment.', () => goScreen('screen-payment'));
    }
    if (t.includes('back') || t.includes('more') || t.includes('add')) {
      return speak('Going back to menu.', () => goScreen('screen-menu'));
    }
    speak('Say confirm to pay or back to add more items.');
  }
  else if (scr === 'screen-payment') {
    if (t.includes('upi') || t.includes('gpay') || t.includes('tap') || t.includes('phone')) return selectPayment('upi');
    if (t.includes('card') || t.includes('debit') || t.includes('credit')) return selectPayment('card');
    if (t.includes('cash') || t.includes('note')) return selectPayment('cash');
    if (t.includes('wallet') || t.includes('voucher')) return selectPayment('wallet');
    if (t.includes('confirm') || t.includes('done') || t.includes('pay') || t.includes('yes')) return simulatePayment();
    if (t.includes('back')) return speak('Going back to cart.', () => goScreen('screen-cart'));
    speak('Say UPI, card, cash, or wallet to choose. Then say confirm.');
  }
}

// ═══ COMPUTER VISION ENGINE (MEDIAPIPE) ═══
let faceMesh = null;
let camera = null;
let cvInitialized = false;

// We need smoothing for the nose pointer
let smoothedX = window.innerWidth / 2;
let smoothedY = window.innerHeight / 2;
const EMA_ALPHA = 0.3; // Smoothing factor
const POINTER_SENSITIVITY = 2.5; // Multiplier so user doesn't have to break their neck turning

// Zero-Touch Auto-Detection State
let touchActive = false;
let faceDwellStart = 0;
const FACE_WAKE_MS = 4000;

document.addEventListener('mousemove', () => touchActive = true);
document.addEventListener('touchstart', () => touchActive = true);
document.addEventListener('click', () => touchActive = true);

function initComputerVision() {
  if (cvInitialized) {
    if (camera) camera.start();
    return;
  }
  
  log('👁️ Initializing Computer Vision Models...', 'gaze');
  const cvContainer = document.getElementById('cv-container');
  if (cvContainer) cvContainer.style.display = 'block';
  
  const videoElement = document.getElementById('webcam');
  const canvasElement = document.getElementById('output_canvas');
  if (!videoElement || !canvasElement) return;
  const canvasCtx = canvasElement.getContext('2d');
  
  if (!window.FaceMesh) {
    log('⚠️ MediaPipe not loaded from CDN yet. Retrying...', 'asr');
    setTimeout(initComputerVision, 1000);
    return;
  }
  
  faceMesh = new FaceMesh({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
  }});
  
  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true, // Gets Iris tracking landmarks
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  
  faceMesh.onResults((results) => {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      // Passive Auto-Wake Engine
      if (state.mode === 'normal' && !touchActive) {
        if (!faceDwellStart) {
          faceDwellStart = Date.now();
        } else if (Date.now() - faceDwellStart > FACE_WAKE_MS) {
          log('🤖 Stare confirmed. Auto-switching to Hands-Free Mode', 'action');
          setMode('motor');
          faceDwellStart = 0;
        }
      } else if (touchActive && state.mode === 'normal') {
        faceDwellStart = 0;
      }
      
      if (state.mode !== 'motor') {
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        return;
      }
      
      // Draw the cool matrix feedback
      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      const landmarks = results.multiFaceLandmarks[0];
      
      // Draw Face Mesh for visual proof
      drawConnectors(canvasCtx, landmarks, FACEMESH_TESSELATION, {color: '#00d4aa', lineWidth: 0.5});
      drawConnectors(canvasCtx, landmarks, FACEMESH_RIGHT_EYE, {color: '#6c63ff'});
      drawConnectors(canvasCtx, landmarks, FACEMESH_LEFT_EYE, {color: '#6c63ff'});
      drawConnectors(canvasCtx, landmarks, FACEMESH_RIGHT_IRIS, {color: '#ff3030'});
      drawConnectors(canvasCtx, landmarks, FACEMESH_LEFT_IRIS, {color: '#ff3030'});
      
      // Node 1 is the tip of the nose
      const nose = landmarks[1]; 
      
      const rawX = (nose.x - 0.5) * POINTER_SENSITIVITY + 0.5;
      const rawY = (nose.y - 0.5) * POINTER_SENSITIVITY + 0.5;
      
      // Mirror the X coordinate since webcam is mirrored
      let targetX = (1 - rawX) * window.innerWidth;
      let targetY = rawY * window.innerHeight;
      
      // Clamp bounds
      targetX = Math.max(0, Math.min(window.innerWidth, targetX));
      targetY = Math.max(0, Math.min(window.innerHeight, targetY));
      
      smoothedX = (targetX * EMA_ALPHA) + (smoothedX * (1 - EMA_ALPHA));
      smoothedY = (targetY * EMA_ALPHA) + (smoothedY * (1 - EMA_ALPHA));
      
      if (gazeCursor) {
        gazeCursor.style.left = smoothedX + 'px';
        gazeCursor.style.top = smoothedY + 'px';
      }
      
      // Hitbox / Proximity Snap logic
      const gazeEls = document.querySelectorAll('.gaze-el');
      let closestEl = null; let minDistance = 150;
      gazeEls.forEach(el => {
        if (el.getBoundingClientRect().width === 0) return;
        const rect = el.getBoundingClientRect();
        if (smoothedX >= rect.left && smoothedX <= rect.right && smoothedY >= rect.top && smoothedY <= rect.bottom) {
          minDistance = -1; closestEl = el;
        } else if (minDistance >= 0) {
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dist = Math.sqrt(Math.pow(cx - smoothedX, 2) + Math.pow(cy - smoothedY, 2));
          if (dist < minDistance) { minDistance = dist; closestEl = el; }
        }
      });
      
      if (closestEl) {
        if (state.gazeTarget !== closestEl) startGaze(closestEl);
        const rect = closestEl.getBoundingClientRect();
        if (gazeCursor) {
          gazeCursor.style.left = (rect.left + rect.width / 2) + 'px';
          gazeCursor.style.top = (rect.top + rect.height / 2) + 'px';
        }
      } else {
        if (state.gazeTarget) cancelGaze();
      }
      
    } else {
      faceDwellStart = 0; // Reset auto-wake if face drops
      if (state.gazeTarget) cancelGaze();
    }
    canvasCtx.restore();
  });
  
  camera = new Camera(videoElement, {
    onFrame: async () => { await faceMesh.send({image: videoElement}); },
    width: 640,
    height: 480
  });
  
  camera.start().then(() => {
    const statusEl = document.querySelector('.cv-status');
    if (statusEl) statusEl.style.display = 'none';
    log('✅ Neural Network Active', 'gaze');
    announce('Computer vision is now tracking your face.');
  });
  
  cvInitialized = true;
}

function pauseComputerVision() {
  if (camera && cvInitialized) {
    camera.stop();
  }
}

function attachGaze(el) {
  // handled dynamically
}

function startGaze(el) {
  cancelGaze();
  state.gazeTarget = el;
  const bar = el.querySelector('.gaze-bar');
  const label = el.dataset.label || el.textContent.trim().slice(0, 25);
  
  log('👁️ Gaze → ' + label, 'gaze');
  const startT = Date.now();
  
  state.gazeTimer = setInterval(() => {
    const pct = Math.min(100, ((Date.now() - startT) / GAZE_MS) * 100);
    if (bar) bar.style.width = pct + '%';
    
    if (pct >= 100) {
      clearInterval(state.gazeTimer); 
      state.gazeTimer = null;
      if (bar) bar.style.width = '0%';
      log('✅ Gaze selected: ' + label, 'gaze');
      el.click();
    }
  }, 30);
}

function cancelGaze() {
  if (state.gazeTimer) {
    clearInterval(state.gazeTimer); 
    state.gazeTimer = null;
  }
  document.querySelectorAll('.gaze-bar').forEach(b => b.style.width = '0%');
  state.gazeTarget = null;
}

// ═══ MODE MANAGER ═══
function setMode(m) {
  state.mode = m;
  stopListening();
  cancelGaze();
  
  // Handle CV overlay (Passive mode means it stays running!)
  if (m === 'motor') {
    const cvContainer = document.getElementById('cv-container');
    if (cvContainer) cvContainer.style.display = 'block';
  } else {
    const cvContainer = document.getElementById('cv-container');
    if (cvContainer) cvContainer.style.display = 'none';
  }
  
  // Update Toggles
  document.querySelectorAll('.mode-tab').forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });
  const activeTab = document.querySelector(`[data-mode="${m}"]`);
  if(activeTab) {
    activeTab.classList.add('active');
    activeTab.setAttribute('aria-selected', 'true');
  }
  
  // Set global CSS scope
  document.body.className = `${m}-mode`;
  
  const bar = document.getElementById('mode-info-menu');
  const infos = {
    normal: { cls: 'normal', text: '' },
    blind: { cls: 'blind', text: '🎤 Click the mic button and speak — every action is announced aloud via TTS' },
    cognitive: { cls: 'cognitive', text: '🧩 Simplified step-by-step mode — reduced choices, larger text' },
    motor: { cls: 'motor', text: '👁️ Gaze mode active — hover any element for 1.5s to trigger it, across all screens' }
  };
  
  if(bar) {
    bar.className = `mode-info-bar ${infos[m].cls}`;
    bar.textContent = infos[m].text;
  }
  
  // Update Side Panel Badges
  const feat = (id, on) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = on ? 'ON' : 'OFF';
      el.className = 'feature-badge ' + (on ? 'on' : 'off');
    }
  };
  feat('feat-tts', m === 'blind');
  feat('feat-asr', m === 'blind');
  feat('feat-gaze', m === 'motor');
  feat('feat-simple', m === 'cognitive');
  
  const how = {
    normal: 'Standard touch-based kiosk. Switch modes to see AI accessibility features.',
    blind: 'TTS reads every screen aloud automatically. Speech recognition listens for voice commands. The mic prevents feedback by pausing during TTS.',
    cognitive: 'Simplified layout: one item per row, large text, step counters, plain-language prompts.',
    motor: 'Gaze dwell-click active on EVERY interactive element. Hover for 1.5s and the orange bar triggers the action.'
  };
  
  const panel = document.getElementById('how-panel');
  if(panel) panel.textContent = how[m];
  
  const names = {normal:'Standard', blind:'Visually Impaired', cognitive:'Cognitive Support', motor:'Motor Impaired'};
  log(`♿ Mode → ${names[m]}`, 'action');
  
  announce(`${names[m]} mode activated.`);
  
  if (m === 'blind') {
    speak('Visually impaired mode. I will read everything aloud. Click the microphone and say an item name to add it.', 
      () => { if (state.mode === 'blind') startListening(); });
  } else if (m === 'cognitive') {
    speak('Simplified mode on. Tap or hover any item to add it.');
  } else if (m === 'motor') {
    speak('Motor accessibility mode. Hover any item or button for one and a half seconds to activate it. No touching required.');
  }
}

// ═══ EVENT DELEGATION & INIT ═══
document.addEventListener('DOMContentLoaded', () => {
  // Global Click handler
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action], .mode-tab');
    if (!t) return;
    
    // Mode tabs
    if (t.classList.contains('mode-tab')) {
      const m = t.getAttribute('data-mode');
      if (m) setMode(m);
      return;
    }
    
    const action = t.getAttribute('data-action');
    
    switch(action) {
      case 'toggle-mic':
        toggleListening();
        break;
      case 'add-item':
        addItem(
          t.getAttribute('data-id'),
          t.getAttribute('data-name'),
          t.getAttribute('data-emoji'),
          t.getAttribute('data-price')
        );
        break;
      case 'go-screen':
        goScreen(t.getAttribute('data-target'));
        break;
      case 'select-payment':
        selectPayment(t.getAttribute('data-type'));
        break;
      case 'simulate-payment':
        simulatePayment();
        break;
      case 'reset-kiosk':
        resetKiosk();
        break;
    }
  });
  
  // Attach Keyboard Support for all interactable elements
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      // Hardware switch zero-touch activation
      if (state.mode === 'normal') {
        e.preventDefault();
        return setMode('blind');
      }
      
      const active = document.activeElement;
      if (active && (active.tagName === 'BUTTON' || active.getAttribute('role') === 'tab' || active.getAttribute('role') === 'radio')) {
        e.preventDefault();
        active.click();
      }
    }
  });

  // Initial State Setup
  setMode('normal');
  renderCart();
  
  // Power up Computer Vision implicitly in the background
  if (typeof initComputerVision === 'function') setTimeout(initComputerVision, 500);
});
