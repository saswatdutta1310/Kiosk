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
  awaitingPassengerVoice: false
};

const GAZE_MS = 1500;
const gazeCursor = document.getElementById('gaze-cursor');
const announcer = document.getElementById('a11y-announcer');

// ═══ AI CONCIERGE (HYBRID TRIGGER) ═══
const QUESTION_STARTERS = /^(who|what|where|when|why|how|is|are|do|does|can|would|should|will|did|could|may|might)\b/i;
const COMMAND_VERBS = /^(add|go|goto|set|change|select|checkout|pay|start|stop|reset|view|show|hide|clear|remove|delete|cancel|confirm|hello|hi|begin)\b/i;

function shouldTriggerLLM(text) {
  if (!text) return false;
  const t = text.trim().toLowerCase();
  // 1. Static Command check (Zero Cost)
  if (COMMAND_VERBS.test(t)) return false; 
  // 2. Question check (Trigger API)
  if (QUESTION_STARTERS.test(t) || t.includes("?")) return true;
  // 3. Fallback: Complex sentences usually need LLM
  return t.length > 25;
}

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
  ['voice-status', 'voice-status-cart', 'voice-status-pay', 'voice-status-transit', 'voice-status-t-ticket', 'voice-status-t-recharge'].forEach(id => {
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

    // Dynamic UI styling for Transit vs Food
    const isTransit = state.cart.length > 0 && state.cart[0].id === 'transit-item';
    const breadcrumb = document.querySelector('#screen-payment .breadcrumb');
    const backBtn = document.querySelector('#screen-payment .btn-outline');
    
    if (isTransit) {
      if (breadcrumb) {
        breadcrumb.innerHTML = '<span class="breadcrumb-step done">Transit Kiosk</span><span aria-hidden="true" style="margin:0 8px;">›</span><span class="breadcrumb-step current" aria-current="step">Payment</span>';
      }
      if (backBtn) {
        backBtn.setAttribute('data-target', 'screen-transit');
        backBtn.innerHTML = '<div class="gaze-bar"></div>← Cancel Payment';
      }
    } else {
      if (breadcrumb) {
        breadcrumb.innerHTML = '<span class="breadcrumb-step done">Menu</span><span aria-hidden="true" style="margin:0 8px;">›</span><span class="breadcrumb-step done">Cart</span><span aria-hidden="true" style="margin:0 8px;">›</span><span class="breadcrumb-step current" aria-current="step">Payment</span>';
      }
      if (backBtn) {
        backBtn.setAttribute('data-target', 'screen-cart');
        backBtn.innerHTML = '<div class="gaze-bar"></div>← Back to Cart';
      }
    }
  }
  
  const totalStr = `₹${totalPrice()}`;
  const announces = {
    'screen-landing': 'Welcome to Kiosk Vision AI. Tap the screen or say start to begin.',
    'screen-home': 'Select Deployment Mode. Food and Beverage, or Indian Railways. Say Food or Railway.',
    'screen-menu': 'Menu screen. 4 items available. Say an item name to add it. Say checkout when ready.',
    'screen-transit': 'Railway dashboard. Say Ticket, Recharge, Status, or Emergency.',
    'screen-transit-ticket': 'Ticket Destination. Say Mumbai, Kolkata, Bengaluru, or Chennai.',
    'screen-transit-class': 'Select Class. Say Sleeper, AC 3 Tier, AC 2 Tier, or Vande Bharat.',
    'screen-transit-passenger': 'Passenger details. Say Voice Input or Fetch IRCTC Profile.',
    'screen-transit-recharge': 'Recharge amounts. Say 100, 200, 500, or 1000.',
    'screen-transit-status': 'Live Train Status. Mumbai Rajdhani arriving in 15 minutes.',
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

function completeTransitAction(msg) {
  log(`🚆 Transit action: ${msg}`, 'action');
  announce(msg);
  const amtEl = document.getElementById('success-amount');
  if(amtEl) amtEl.style.display = 'none'; // hide amount text for non-payments
  
  const title = document.querySelector('.success-title');
  if(title) title.textContent = msg;
  
  const sub = document.querySelector('.success-sub');
  if(sub) sub.textContent = 'Please collect your receipt or wait for assistance.';
  
  goScreen('screen-success');
  if (state.mode === 'blind') speak(`${msg}. Please collect your receipt.`);
  else if (state.mode === 'cognitive') speak('All done!');
}

function processTransitPay(name, priceStr) {
  const parsedPrice = parseInt(priceStr.replace(/[^0-9]/g, ''), 10);
  state.cart = [{ id: 'transit-item', name, emoji: '🚇', priceStr: `₹${parsedPrice}`, price: parsedPrice }];
  log(`🎫 Selected: ${name} (₹${parsedPrice})`, 'action');
  
  if (state.mode === 'blind' || state.mode === 'cognitive') {
    speak(`${name} selected. Let's pay.`, () => goScreen('screen-payment'));
  } else {
    goScreen('screen-payment');
  }
}

function processTransitDest(dest, code) {
  state.booking = { dest, code };
  log(`🎫 Selected IRCTC Destination: ${dest} (${code})`, 'action');
  speak(`Destination ${dest}. Select class.`, () => goScreen('screen-transit-class'));
}

function processTransitClass(cls, price) {
  state.booking.cls = cls;
  state.booking.price = parseInt(price, 10);
  log(`🚉 Selected Coach Class: ${cls}`, 'action');
  speak(`${cls} selected. Add passenger details by fetching IRCTC or speaking.`, () => goScreen('screen-transit-passenger'));
}

function startPassengerVoice() {
  const btn = document.getElementById('passenger-voice-btn');
  if (btn) btn.innerHTML = `<div class="gaze-bar"></div><span class="menu-item-emoji">🟢</span><div class="menu-item-name" style="font-size:18px;">Listening...</div><div class="menu-item-desc">Speak clearly</div>`;
  speak('Please state your name and age.', () => {
    state.awaitingPassengerVoice = true;
    startListening();
  });
}

function processTransitFinal(type, voiceText = '') {
  let name = type === 'irctc' ? 'IRCTC Aadhaar Linked User' : 'Guest';
  if (type === 'voice' && voiceText) {
    name = voiceText.replace(/(^\w|\s\w)/g, m => m.toUpperCase()); // Capitalize First Letters
  }
  
  let itemName = `NDLS to ${state.booking.code} (${state.booking.cls})`;
  state.cart = [{ 
    id: 'transit-item', 
    name: itemName, 
    emoji: '🚆', 
    priceStr: `₹${state.booking.price}`, 
    price: state.booking.price
  }];
  log(`🚆 Booking Confirmed: ${itemName} for ${name}`, 'action');
  
  speak(`Passenger details saved for ${name}. Total is ₹${state.booking.price}. Proceeding to payment.`, () => goScreen('screen-payment'));
}

function resetKiosk() {
  state.cart = [];
  state.booking = {};
  state.selectedPayment = null;
  
  const amtEl = document.getElementById('success-amount');
  if(amtEl) amtEl.style.display = 'block';
  const title = document.querySelector('.success-title');
  if(title) title.textContent = 'Payment Successful!';
  const sub = document.querySelector('.success-sub');
  if(sub) sub.textContent = 'Your order is being prepared. Thank you!';
  
  goScreen('screen-landing');
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
  if (state.awaitingPassengerVoice) {
    state.awaitingPassengerVoice = false;
    const btn = document.getElementById('passenger-voice-btn');
    if (btn) btn.innerHTML = `<div class="gaze-bar"></div><span class="menu-item-emoji">🎙️</span><div class="menu-item-name" style="font-size:18px;">Voice Input</div><div class="menu-item-desc">Speak Name &amp; Age</div>`;
    processTransitFinal('voice', t);
    return;
  }

  // ═══ HYBRID AI TRIGGER ═══
  if (shouldTriggerLLM(t)) {
    log('🤖 Sending query to AI Concierge...', 'asr');
    return callAI(t);
  }

  const activeScreen = document.querySelector('.screen.active');
  const scr = activeScreen ? activeScreen.id : '';
  
  if (scr === 'screen-landing') {
    if (t.includes('start') || t.includes('hello') || t.includes('begin') || t.includes('kiosk')) return speak('Please select deployment mode.', () => goScreen('screen-home'));
    speak('Say start to begin.');
  }
  else if (scr === 'screen-home') {
    if (t.includes('food') || t.includes('restaurant') || t.includes('beverage')) return speak('Opening Food.', () => goScreen('screen-menu'));
    if (t.includes('transit') || t.includes('railway') || t.includes('irctc')) return speak('Opening Railway.', () => goScreen('screen-transit'));
    speak('Say Food or Railway.');
  }
  else if (scr === 'screen-transit') {
    if (t.includes('ticket') || t.includes('buy')) return speak('Where to?', () => goScreen('screen-transit-ticket'));
    if (t.includes('recharge') || t.includes('top')) return speak('How much?', () => goScreen('screen-transit-recharge'));
    if (t.includes('status') || t.includes('time') || t.includes('pnr')) return speak('Checking status.', () => goScreen('screen-transit-status'));
    if (t.includes('help') || t.includes('emergency') || t.includes('sos')) return completeTransitAction('Emergency assistance requested. Help is on the way.');
    if (t.includes('back') || t.includes('home')) return speak('Going home.', () => goScreen('screen-home'));
    speak('Say ticket, recharge, status, or emergency.');
  }
  else if (scr === 'screen-transit-ticket') {
    if (t.includes('mumbai') || t.includes('mmct')) return processTransitDest('Mumbai Central', 'MMCT');
    if (t.includes('kolkata') || t.includes('howrah')) return processTransitDest('Howrah Jn', 'HWH');
    if (t.includes('bengaluru') || t.includes('sbc')) return processTransitDest('KSR Bengaluru', 'SBC');
    if (t.includes('chennai') || t.includes('mas')) return processTransitDest('Chennai Central', 'MAS');
    if (t.includes('back') || t.includes('cancel')) return goScreen('screen-transit');
    speak('Say Mumbai, Kolkata, Bengaluru, or Chennai.');
  }
  else if (scr === 'screen-transit-class') {
    if (t.includes('sleeper') || t.includes('sl')) return processTransitClass('Sleeper (SL)', '600');
    if (t.includes('3') || t.includes('three')) return processTransitClass('AC 3 Tier (3A)', '1500');
    if (t.includes('2') || t.includes('two')) return processTransitClass('AC 2 Tier (2A)', '2200');
    if (t.includes('vande') || t.includes('bharat') || t.includes('cc')) return processTransitClass('Vande Bharat (CC)', '2800');
    if (t.includes('back') || t.includes('cancel')) return goScreen('screen-transit-ticket');
    speak('Say Sleeper, AC 3 Tier, AC 2 Tier, or Vande Bharat.');
  }
  else if (scr === 'screen-transit-passenger') {
    if (t.includes('voice') || t.includes('input') || t.includes('guest')) return startPassengerVoice();
    if (t.includes('fetch') || t.includes('irctc') || t.includes('profile')) return processTransitFinal('irctc');
    if (t.includes('back') || t.includes('cancel')) return goScreen('screen-transit-class');
    speak('Say Voice Input or Fetch IRCTC.');
  }
  else if (scr === 'screen-transit-recharge') {
    if (t.includes('100') || t.includes('one')) return processTransitPay('IRCTC Smart Card Top-up', '100');
    if (t.includes('200') || t.includes('two')) return processTransitPay('IRCTC Smart Card Top-up', '200');
    if (t.includes('500') || t.includes('five')) return processTransitPay('IRCTC Smart Card Top-up', '500');
    if (t.includes('1000') || t.includes('max')) return processTransitPay('IRCTC Smart Card Top-up', '1000');
    if (t.includes('back') || t.includes('cancel')) return goScreen('screen-transit');
    speak('Say 100, 200, 500, or max.');
  }
  else if (scr === 'screen-transit-status') {
    if (t.includes('back')) return goScreen('screen-transit');
    speak('Mumbai Rajdhani arriving in 15 minutes.');
  }
  else if (scr === 'screen-menu') {
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

// ═══ AI CLOUD EXECUTION (GROK) ═══
async function callAI(text) {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: "user", content: text }]
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
        log(`🤖 AI Error: ${data.error || 'Server error'}`, 'asr');
        speak(data.error || "I'm having trouble thinking clearly. Please check my connection.");
        return;
    }

    if (data.tool_calls && data.tool_calls.length > 0) {
      for (const call of data.tool_calls) {
        if (call.function.name === 'manage_kiosk') {
          const args = JSON.parse(call.function.arguments);
          executeAction(args);
        }
      }
    }
    
    if (data.content) {
      speak(data.content);
    }
  } catch (err) {
    console.error('AI Concierge Error:', err);
    speak("I'm having trouble connecting to my brain. Please try a simple command.");
  }
}

function executeAction({ action, target, payload }) {
  log(`🤖 AI ACTION: ${action} ${target || ''}`, 'action');
  
  switch (action) {
    case 'navigate':
      goScreen(target);
      break;
    case 'add_item':
      addItem(payload.id, payload.name, payload.emoji, payload.price);
      break;
    case 'set_mode':
      setMode(payload.mode);
      break;
    case 'checkout':
      goScreen('screen-cart');
      break;
    case 'clear_cart':
      state.cart = [];
      renderCart();
      break;
  }
}

// ═══ COMPUTER VISION ENGINE (MEDIAPIPE) ═══
let faceMesh = null;
let hands = null;
let camera = null;
let cvInitialized = false;
let activeTrackingMode = 'face';
let pinchLockout = false;

// We need smoothing for the nose/hand pointer
let smoothedX = window.innerWidth / 2;
let smoothedY = window.innerHeight / 2;
const EMA_ALPHA = 0.3; // Smoothing factor
const POINTER_SENSITIVITY = 2.5; // Multiplier so user doesn't have to break their neck turning

// Zero-Touch Auto-Detection State
let touchActive = false;
let faceDwellStart = 0;
const FACE_WAKE_MS = 4000;

let touchTimeout = null;
const TOUCH_COOLDOWN = 10000; // 10 seconds of no interaction resets touchActive

const setTouchActive = () => {
  touchActive = true;
  clearTimeout(touchTimeout);
  touchTimeout = setTimeout(() => {
    touchActive = false;
    log('🤖 Kiosk idle. Eyes-only detection scanning...', 'gaze');
  }, TOUCH_COOLDOWN);
};

document.addEventListener('mousemove', setTouchActive);
document.addEventListener('touchstart', setTouchActive);
document.addEventListener('click', setTouchActive);
document.addEventListener('keydown', setTouchActive);

// ══ ENGINE LOGIC ══
let edgeScrollTimer = null;
let edgeScrollInterval = null;
let currentEdge = null; // 'top' or 'bottom'

function handleEdgeScrolling(y) {
  const topEdge = window.innerHeight * 0.15;
  const bottomEdge = window.innerHeight * 0.85;
  
  let targetEdge = null;
  if (y > bottomEdge) targetEdge = 'bottom';
  else if (y < topEdge) targetEdge = 'top';
  
  if (targetEdge) {
    if (currentEdge !== targetEdge) {
      currentEdge = targetEdge;
      clearTimeout(edgeScrollTimer);
      clearInterval(edgeScrollInterval);
      
      // Start scrolling after 3s dwell
      edgeScrollTimer = setTimeout(() => {
        edgeScrollInterval = setInterval(() => {
          const els = [window, document.documentElement, document.body, document.querySelector('.kiosk-body'), document.querySelector('.kiosk-wrap')];
          els.forEach(el => { 
            try { 
              if(el) el.scrollBy({ top: targetEdge === 'bottom' ? 8 : -8, left: 0, behavior: 'instant' }); 
            } catch(e) {} 
          });
        }, 20); // Smooth scroll speed
      }, 3000);
    }
  } else {
    if (currentEdge) {
      currentEdge = null;
      clearTimeout(edgeScrollTimer);
      clearInterval(edgeScrollInterval);
    }
  }
}

function handleProximitySnap() {
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
    // We start gaze timer if tracking via face, or immediately if tracking via hand?
    // Keep gaze timer same for Hand, but pinch bypasses it!
    if (state.gazeTarget !== closestEl) startGaze(closestEl);
    const rect = closestEl.getBoundingClientRect();
    if (gazeCursor) {
      gazeCursor.style.left = (rect.left + rect.width / 2) + 'px';
      gazeCursor.style.top = (rect.top + rect.height / 2) + 'px';
    }
  } else {
    if (state.gazeTarget) cancelGaze();
  }
}

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
  
  if (!window.FaceMesh || !window.Hands) {
    log('⚠️ MediaPipe not loaded from CDN yet. Retrying...', 'asr');
    setTimeout(initComputerVision, 1000);
    return;
  }
  
  // -- Setup Hands --
  hands = new Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  
  hands.onResults((results) => {
    if (state.mode !== 'motor' && state.mode !== 'cognitive') return;
    
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      activeTrackingMode = 'hand';
      const landmarks = results.multiHandLandmarks[0];
      const indexFinger = landmarks[8];
      const thumb = landmarks[4];
      
      const rawX = (indexFinger.x - 0.5) * POINTER_SENSITIVITY + 0.5;
      const rawY = (indexFinger.y - 0.5) * POINTER_SENSITIVITY + 0.5;
      
      let targetX = (1 - rawX) * window.innerWidth;
      let targetY = rawY * window.innerHeight;
      targetX = Math.max(0, Math.min(window.innerWidth, targetX));
      targetY = Math.max(0, Math.min(window.innerHeight, targetY));
      
      smoothedX = (targetX * EMA_ALPHA) + (smoothedX * (1 - EMA_ALPHA));
      smoothedY = (targetY * EMA_ALPHA) + (smoothedY * (1 - EMA_ALPHA));
      
      handleEdgeScrolling(smoothedY);
      
      if (gazeCursor) {
        gazeCursor.style.left = smoothedX + 'px';
        gazeCursor.style.top = smoothedY + 'px';
        gazeCursor.style.borderColor = '#eab308'; // Indicate Hand tracking actively overriding
      }
      
      const dist = Math.sqrt(Math.pow(indexFinger.x - thumb.x, 2) + Math.pow(indexFinger.y - thumb.y, 2) + Math.pow(indexFinger.z - thumb.z, 2));
      if (dist < 0.05 && !pinchLockout) {
        pinchLockout = true;
        if (state.gazeTarget) {
          state.gazeTarget.click();
          log('👆 Pinch Click Registered', 'action');
          gazeCursor.classList.add('clicking');
          setTimeout(() => gazeCursor.classList.remove('clicking'), 200);
        }
      } else if (dist > 0.08) {
        pinchLockout = false;
      }
      
      handleProximitySnap();
      
      // Draw Hand Landmarks
      canvasCtx.save();
      // We don't have HAND_CONNECTIONS defined globally, so we'll just draw dots for the joints to prevent errors
      canvasCtx.fillStyle = '#eab308';
      landmarks.forEach(l => {
          canvasCtx.beginPath();
          canvasCtx.arc(l.x * canvasElement.width, l.y * canvasElement.height, 3, 0, 2*Math.PI);
          canvasCtx.fill();
      });
      canvasCtx.restore();
    } else {
      activeTrackingMode = 'face';
      if (gazeCursor) gazeCursor.style.borderColor = '#4edea3';
    }
  });

  // -- Setup FaceMesh --
  faceMesh = new FaceMesh({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`});
  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  
  faceMesh.onResults((results) => {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
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
      
      if (state.mode !== 'motor' && state.mode !== 'cognitive') {
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        return;
      }
      
      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      const landmarks = results.multiFaceLandmarks[0];
      
      drawConnectors(canvasCtx, landmarks, FACEMESH_TESSELATION, {color: '#00d4aa', lineWidth: 0.5});
      drawConnectors(canvasCtx, landmarks, FACEMESH_RIGHT_EYE, {color: '#6c63ff'});
      drawConnectors(canvasCtx, landmarks, FACEMESH_LEFT_EYE, {color: '#6c63ff'});
      drawConnectors(canvasCtx, landmarks, FACEMESH_RIGHT_IRIS, {color: '#ff3030'});
      drawConnectors(canvasCtx, landmarks, FACEMESH_LEFT_IRIS, {color: '#ff3030'});
      
      if (activeTrackingMode === 'face') {
        const nose = landmarks[1]; 
        const rawX = (nose.x - 0.5) * POINTER_SENSITIVITY + 0.5;
        const rawY = (nose.y - 0.5) * POINTER_SENSITIVITY + 0.5;
        
        let targetX = (1 - rawX) * window.innerWidth;
        let targetY = rawY * window.innerHeight;
        
        targetX = Math.max(0, Math.min(window.innerWidth, targetX));
        targetY = Math.max(0, Math.min(window.innerHeight, targetY));
        
        smoothedX = (targetX * EMA_ALPHA) + (smoothedX * (1 - EMA_ALPHA));
        smoothedY = (targetY * EMA_ALPHA) + (smoothedY * (1 - EMA_ALPHA));
        
        handleEdgeScrolling(smoothedY);
        
        if (gazeCursor) {
          gazeCursor.style.left = smoothedX + 'px';
          gazeCursor.style.top = smoothedY + 'px';
        }
        handleProximitySnap();
      }
    } else {
      faceDwellStart = 0;
      if (state.gazeTarget && activeTrackingMode === 'face') cancelGaze();
    }
    canvasCtx.restore();
  });
  
  camera = new Camera(videoElement, {
    onFrame: async () => {
      // Send frames to both models!
      if (state.mode === 'motor' || state.mode === 'cognitive' || state.mode === 'normal') {
        await faceMesh.send({image: videoElement});
      }
      if (state.mode === 'motor' || state.mode === 'cognitive') {
        await hands.send({image: videoElement});
      }
    },
    width: 640,
    height: 480
  });
  
  camera.start().then(() => {
    const statusEl = document.querySelector('.cv-status');
    if (statusEl) statusEl.style.display = 'none';
    log('✅ Neural Network Active', 'gaze');
    announce('Computer vision connected.');
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
      case 'transit-action':
        completeTransitAction(t.getAttribute('data-label') + ' Confirmed');
        break;
      case 'transit-pay':
        processTransitPay(t.getAttribute('data-name'), t.getAttribute('data-price'));
        break;
      case 'transit-set-dest':
        processTransitDest(t.getAttribute('data-dest'), t.getAttribute('data-code'));
        break;
      case 'transit-set-class':
        processTransitClass(t.getAttribute('data-class'), t.getAttribute('data-price'));
        break;
      case 'transit-pay-voice':
        startPassengerVoice();
        break;
      case 'transit-pay-final':
        processTransitFinal(t.getAttribute('data-type'));
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
