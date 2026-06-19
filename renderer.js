const { ipcRenderer } = require('electron');

// State Management
let clickers = [];
let activeTab = 'dashboard';
let recordingTarget = null; // 'key' or 'hotkey'
let statsInterval = null;
let statsTimeStart = null;
let statsTimerInterval = null;

// Real-time CPS calculation variables
let totalClicksAccumulator = 0;
let lastTotalClicks = 0;
let cpsHistory = [];
let peakCps = 0;

// Load clickers and settings from localStorage
function init() {
  const savedClickers = localStorage.getItem('dolphin_clickers');
  if (savedClickers) {
    try {
      clickers = JSON.parse(savedClickers);
      // Reset running state of all clickers on startup
      clickers.forEach(c => {
        c.running = false;
        c.clicksCount = 0;
      });
    } catch (e) {
      clickers = [];
    }
  } else {
    // Default initial clicker
    clickers = [
      {
        id: 'default-clicker',
        name: 'Fast Left Clicker',
        type: 'mouse',
        button: 'left',
        clickType: 'single',
        keyCode: 0,
        keyName: '',
        intervalMs: 50,
        cps: 20,
        hotkey: 'F6',
        limitEnabled: false,
        limitCount: 100,
        running: false,
        clicksCount: 0
      }
    ];
    saveClickers();
  }

  // Load Settings
  const settingTray = localStorage.getItem('setting_tray') !== 'false';
  const settingSound = localStorage.getItem('setting_sound') !== 'false';
  const settingStartup = localStorage.getItem('setting_startup') === 'true';
  const savedTheme = localStorage.getItem('setting_theme') || 'teal';

  document.getElementById('setting-tray').checked = settingTray;
  document.getElementById('setting-sound').checked = settingSound;
  document.getElementById('setting-startup').checked = settingStartup;
  setTheme(savedTheme);

  // Send initial hotkeys config to Main Process
  updateMainProcessHotkeys();

  // Render lists
  renderClickers();
  updateStatsUI();

  // Start CPS Tick timer
  startCpsTracker();
}

function saveClickers() {
  localStorage.setItem('dolphin_clickers', JSON.stringify(clickers));
}

// Sound feedback (Web Audio API synthetic beeps)
function playToggleSound(isOn) {
  const soundEnabled = document.getElementById('setting-sound').checked;
  if (!soundEnabled) return;
  
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (isOn) {
      // High pitch double beep
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else {
      // Lower pitch single drop beep
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    }
  } catch (e) {
    console.error("Audio error:", e);
  }
}

// UI Tabs Switching
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');
const pageTitle = document.getElementById('page-title');
const pageDescription = document.getElementById('page-description');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const tabName = item.getAttribute('data-tab');
    switchTab(tabName);
  });
});

function switchTab(tabName) {
  activeTab = tabName;
  navItems.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
  });
  tabContents.forEach(content => {
    content.classList.toggle('active', content.getAttribute('id') === `tab-${tabName}`);
  });

  // Update header text based on page
  if (tabName === 'dashboard') {
    pageTitle.textContent = 'Dashboard';
    pageDescription.textContent = 'Configure and manage your mouse and keyboard click spamming tasks.';
    document.getElementById('add-clicker-btn').style.display = 'inline-flex';
  } else if (tabName === 'stats') {
    pageTitle.textContent = 'Stats & Visuals';
    pageDescription.textContent = 'View real-time clicker output and activity statistics.';
    document.getElementById('add-clicker-btn').style.display = 'none';
  } else if (tabName === 'settings') {
    pageTitle.textContent = 'Settings';
    pageDescription.textContent = 'Adjust application behavior, preferences and UI themes.';
    document.getElementById('add-clicker-btn').style.display = 'none';
  } else if (tabName === 'help') {
    pageTitle.textContent = 'Hotkey Guide';
    pageDescription.textContent = 'Learn how to trigger clickers globally and configure shortcuts.';
    document.getElementById('add-clicker-btn').style.display = 'none';
  }
}

// Render clicker cards
const clickerContainer = document.getElementById('clicker-container');
const emptyState = document.getElementById('empty-state');

function renderClickers() {
  // Remove existing cards
  const cards = clickerContainer.querySelectorAll('.clicker-card');
  cards.forEach(c => c.remove());

  if (clickers.length === 0) {
    emptyState.style.display = 'flex';
    return;
  }
  
  emptyState.style.display = 'none';

  clickers.forEach(clicker => {
    const card = document.createElement('div');
    card.className = `clicker-card ${clicker.running ? 'active' : ''}`;
    card.id = `card-${clicker.id}`;

    // Compute display fields
    let actionDesc = '';
    if (clicker.type === 'mouse') {
      const buttonDisplay = clicker.button.charAt(0).toUpperCase() + clicker.button.slice(1);
      actionDesc = `Mouse ${buttonDisplay} (${clicker.clickType === 'single' ? 'Single' : 'Double'})`;
    } else {
      actionDesc = `Key: ${clicker.keyName || 'None'}`;
    }

    const limitDesc = clicker.limitEnabled ? `${clicker.limitCount} clicks` : 'Infinite';
    const statusText = clicker.running ? 'Active' : 'Inactive';
    const toggleIcon = clicker.running 
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="8,5 19,12 8,19"/></svg>`;

    card.innerHTML = `
      <div class="clicker-card-header">
        <h3 class="clicker-card-title" title="${clicker.name}">${clicker.name}</h3>
        <div class="status-badge ${clicker.running ? 'active' : 'inactive'}">
          <div class="indicator-dot"></div>
          <span>${statusText}</span>
        </div>
      </div>

      <div class="clicker-card-details">
        <div class="detail-row">
          <span>Action:</span>
          <span class="detail-val">${actionDesc}</span>
        </div>
        <div class="detail-row">
          <span>Speed:</span>
          <span class="detail-val">${clicker.intervalMs}ms (${clicker.cps.toFixed(1)} CPS)</span>
        </div>
        <div class="detail-row">
          <span>Hotkey:</span>
          <span class="detail-val"><kbd>${clicker.hotkey || 'None'}</kbd></span>
        </div>
        <div class="detail-row">
          <span>Limit:</span>
          <span class="detail-val">${limitDesc}</span>
        </div>
        <div class="detail-row">
          <span>Session Clicks:</span>
          <span class="detail-val card-click-counter" id="clicks-count-${clicker.id}">${clicker.clicksCount}</span>
        </div>
      </div>

      <div class="clicker-card-actions">
        <div class="card-control-btns">
          <button class="btn-card-action edit" onclick="editClicker('${clicker.id}')" title="Edit Profile">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <button class="btn-card-action delete" onclick="deleteClicker('${clicker.id}')" title="Delete Profile">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
        <button class="btn-toggle-run" onclick="toggleClickerRun('${clicker.id}')" title="Toggle Clicker">
          ${toggleIcon}
        </button>
      </div>
    `;

    clickerContainer.appendChild(card);
  });
}

// Toggle Clicker State (Start/Stop)
function toggleClickerRun(id) {
  const index = clickers.findIndex(c => c.id === id);
  if (index === -1) return;

  const clicker = clickers[index];
  clicker.running = !clicker.running;

  if (clicker.running) {
    // Reset individual session count on start
    clicker.clicksCount = 0;
    
    // Command backend to start
    let commandStr = '';
    const limit = clicker.limitEnabled ? clicker.limitCount : 0;
    
    if (clicker.type === 'mouse') {
      // start <id> mouse <button> <click_type> <interval_ms> <click_limit>
      commandStr = `start ${clicker.id} mouse ${clicker.button} ${clicker.clickType} ${clicker.intervalMs} ${limit}`;
    } else {
      // start <id> keyboard <vk_code> <interval_ms> <click_limit>
      commandStr = `start ${clicker.id} keyboard ${clicker.keyCode} ${clicker.intervalMs} ${limit}`;
    }
    ipcRenderer.send('backend-command', commandStr);
    
    // Start visual timer for session if first one started
    if (!statsTimeStart) {
      statsTimeStart = Date.now();
      startSessionTimer();
    }
    
    playToggleSound(true);
  } else {
    // Command backend to stop
    ipcRenderer.send('backend-command', `stop ${clicker.id}`);
    playToggleSound(false);
  }

  // Update UI Card
  const card = document.getElementById(`card-${clicker.id}`);
  if (card) {
    card.classList.toggle('active', clicker.running);
    const badge = card.querySelector('.status-badge');
    badge.className = `status-badge ${clicker.running ? 'active' : 'inactive'}`;
    badge.querySelector('span').textContent = clicker.running ? 'Active' : 'Inactive';
    
    const toggleBtn = card.querySelector('.btn-toggle-run');
    toggleBtn.innerHTML = clicker.running 
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="8,5 19,12 8,19"/></svg>`;
  }

  updateGlobalIndicator();
  updateStatsUI();
}

// Stop All Clickers
function stopAllClickers() {
  ipcRenderer.send('backend-command', 'stop_all');
  
  let anyRunning = false;
  clickers.forEach(clicker => {
    if (clicker.running) {
      clicker.running = false;
      anyRunning = true;
    }
  });

  if (anyRunning) {
    playToggleSound(false);
  }

  renderClickers();
  updateGlobalIndicator();
  updateStatsUI();
}

// Master Emergency Stop shortcut (handled in renderer and also linked to global key F8 in main)
window.addEventListener('keydown', (e) => {
  // Emergency stop on F8
  if (e.key === 'F8') {
    stopAllClickers();
  }
});

// Update global status indicator in sidebar footer
const globalActiveIndicator = document.getElementById('global-active-indicator');
const globalStatusText = document.getElementById('global-status-text');

function updateGlobalIndicator() {
  const activeCount = clickers.filter(c => c.running).length;
  if (activeCount > 0) {
    globalActiveIndicator.className = 'indicator-ring pulsing active';
    globalActiveIndicator.style.backgroundColor = 'var(--status-active)';
    globalActiveIndicator.style.boxShadow = '0 0 10px var(--status-active)';
    globalStatusText.textContent = `${activeCount} Clicker(s) Running`;
    
    // Add animations to stats wave
    document.getElementById('visualizer-wave').classList.add('animating');
    document.getElementById('visualizer-wave-2').classList.add('animating');
  } else {
    globalActiveIndicator.className = 'indicator-ring pulsing';
    globalActiveIndicator.style.backgroundColor = 'var(--text-muted)';
    globalActiveIndicator.style.boxShadow = 'none';
    globalStatusText.textContent = 'Ready to Click';
    
    // Stop animations in stats wave
    document.getElementById('visualizer-wave').classList.remove('animating');
    document.getElementById('visualizer-wave-2').classList.remove('animating');
    
    stopSessionTimer();
  }
}

// Send all clicker hotkeys to main process to listen globally
function updateMainProcessHotkeys() {
  const config = {};
  clickers.forEach(clicker => {
    if (clicker.hotkey) {
      config[clicker.id] = clicker.hotkey;
    }
  });
  // Add global stop hotkey as well (default F8)
  config['emergency-stop'] = 'F8';
  
  ipcRenderer.send('update-hotkeys', config);
}

// Modal handling
const clickerModal = document.getElementById('clicker-modal');
const clickerForm = document.getElementById('clicker-form');
const modalTitle = document.getElementById('modal-title');
const editIdInput = document.getElementById('edit-clicker-id');
const typeMouseRadio = document.getElementById('type-mouse');
const typeKeyboardRadio = document.getElementById('type-keyboard');
const mouseOptionsPanel = document.getElementById('mouse-options-panel');
const keyboardOptionsPanel = document.getElementById('keyboard-options-panel');
const runInfinitelyCheck = document.getElementById('run-infinitely');
const limitCountWrapper = document.getElementById('limit-count-wrapper');
const speedMsInput = document.getElementById('speed-ms');
const speedCpsInput = document.getElementById('speed-cps');
const speedSlider = document.getElementById('speed-slider');

document.getElementById('add-clicker-btn').addEventListener('click', openAddModal);
document.getElementById('empty-add-btn').addEventListener('click', openAddModal);
document.getElementById('modal-close-x').addEventListener('click', closeActiveModal);
document.getElementById('modal-cancel-btn').addEventListener('click', closeActiveModal);
document.getElementById('stop-all-btn').addEventListener('click', stopAllClickers);

function openAddModal() {
  modalTitle.textContent = "New Clicker Profile";
  editIdInput.value = "";
  clickerForm.reset();
  
  // Set defaults
  typeMouseRadio.checked = true;
  mouseOptionsPanel.style.display = 'flex';
  keyboardOptionsPanel.style.display = 'none';
  limitCountWrapper.style.display = 'none';
  runInfinitelyCheck.checked = true;
  
  speedMsInput.value = 50;
  speedCpsInput.value = 20;
  speedSlider.value = 20;

  // Clear inputs
  document.getElementById('keyboard-key-display').value = '';
  document.getElementById('keyboard-key-vk').value = '';
  document.getElementById('toggle-hotkey-display').value = '';
  document.getElementById('toggle-hotkey-val').value = '';
  
  clickerModal.classList.add('active');
}

function closeActiveModal() {
  // Clear any active key recording hooks
  recordingTarget = null;
  const recorders = document.querySelectorAll('.key-recorder-input');
  recorders.forEach(r => r.classList.remove('recording'));
  
  clickerModal.classList.remove('active');
}

// Toggle option panels based on type
typeMouseRadio.addEventListener('change', () => {
  mouseOptionsPanel.style.display = 'flex';
  keyboardOptionsPanel.style.display = 'none';
});

typeKeyboardRadio.addEventListener('change', () => {
  mouseOptionsPanel.style.display = 'none';
  keyboardOptionsPanel.style.display = 'block';
});

runInfinitelyCheck.addEventListener('change', (e) => {
  limitCountWrapper.style.display = e.target.checked ? 'none' : 'block';
});

// Speed sync (Interval vs CPS vs Slider)
// Formula: CPS = 1000 / ms
speedMsInput.addEventListener('input', () => {
  const ms = parseFloat(speedMsInput.value);
  if (ms > 0) {
    const cps = 1000 / ms;
    speedCpsInput.value = cps.toFixed(2);
    updateSliderFromCps(cps);
  }
});

speedCpsInput.addEventListener('input', () => {
  const cps = parseFloat(speedCpsInput.value);
  if (cps > 0) {
    const ms = 1000 / cps;
    speedMsInput.value = Math.max(1, Math.round(ms));
    updateSliderFromCps(cps);
  }
});

speedSlider.addEventListener('input', () => {
  const sliderVal = parseInt(speedSlider.value, 10);
  // Map 1-100 to CPS. Let's make it log or linear mapping
  // We can do a linear mapping: slider value = CPS
  // (e.g. 1 to 100 CPS)
  const cps = sliderVal;
  speedCpsInput.value = cps;
  
  const ms = 1000 / cps;
  speedMsInput.value = Math.max(1, Math.round(ms));
});

function updateSliderFromCps(cps) {
  // Constrain slider between 1 and 100 CPS
  const clampedCps = Math.min(100, Math.max(1, Math.round(cps)));
  speedSlider.value = clampedCps;
}

// Recording Keyboard Key and Hotkey Trigger
const keyRecordInput = document.getElementById('keyboard-key-display');
const hotkeyRecordInput = document.getElementById('toggle-hotkey-display');

keyRecordInput.addEventListener('click', () => startRecording('key'));
hotkeyRecordInput.addEventListener('click', () => startRecording('hotkey'));

function startRecording(target) {
  // Reset any other recorder state
  keyRecordInput.classList.remove('recording');
  hotkeyRecordInput.classList.remove('recording');

  recordingTarget = target;
  
  if (target === 'key') {
    keyRecordInput.classList.add('recording');
    keyRecordInput.value = 'Press any key...';
  } else if (target === 'hotkey') {
    hotkeyRecordInput.classList.add('recording');
    hotkeyRecordInput.value = 'Press shortcut key...';
  }
}

// Record keydown globally when input is recording
window.addEventListener('keydown', (e) => {
  if (!recordingTarget) return;

  // Prevent default behavior to avoid triggering actual system commands while recording (like F5 reload etc)
  e.preventDefault();
  
  const vk = e.keyCode; // Virtual Key Code
  let keyName = e.key;
  
  // Format keyName nicely
  if (e.key === ' ') keyName = 'Space';
  else if (e.key.length === 1) keyName = e.key.toUpperCase();
  
  // Handle modifiers
  let hotkeyString = '';
  if (recordingTarget === 'hotkey') {
    // Global hotkey mapping for Electron
    // Standard function keys (F1-F12), number/letters can be registered.
    // If they press a key, let's keep it simple: F1-F12, Space, Enter, or A-Z
    const allowedKeys = ['F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12','Space','Enter'];
    
    let isAllowed = false;
    let finalKey = keyName;
    
    // Check if key is a letter/number or in the allowed list
    if ((vk >= 65 && vk <= 90) || (vk >= 48 && vk <= 57) || allowedKeys.includes(keyName)) {
      isAllowed = true;
    }
    
    // Modifiers? We can detect e.g. Ctrl/Shift/Alt
    const modifiers = [];
    if (e.ctrlKey && e.key !== 'Control') modifiers.push('Ctrl');
    if (e.shiftKey && e.key !== 'Shift') modifiers.push('Shift');
    if (e.altKey && e.key !== 'Alt') modifiers.push('Alt');
    
    if (modifiers.length > 0 && e.key !== 'Control' && e.key !== 'Shift' && e.key !== 'Alt') {
      hotkeyString = modifiers.join('+') + '+' + keyName;
      isAllowed = true; // allow modifier combinations
    } else {
      hotkeyString = keyName;
    }

    if (!isAllowed) {
      hotkeyRecordInput.value = 'Invalid key! Try F1-F12 or A-Z...';
      return;
    }

    document.getElementById('toggle-hotkey-display').value = hotkeyString;
    document.getElementById('toggle-hotkey-val').value = hotkeyString;
    
    hotkeyRecordInput.classList.remove('recording');
    recordingTarget = null;
    
  } else if (recordingTarget === 'key') {
    // Standard keyboard key spam target
    document.getElementById('keyboard-key-display').value = keyName;
    document.getElementById('keyboard-key-vk').value = vk;
    
    keyRecordInput.classList.remove('recording');
    recordingTarget = null;
  }
});

// Save Clicker Form Submit
document.getElementById('modal-save-btn').addEventListener('click', (e) => {
  e.preventDefault();
  
  const name = document.getElementById('clicker-name').value.trim() || 'Clicker Profile';
  const type = document.querySelector('input[name="clicker-type"]:checked').value;
  const intervalMs = parseInt(speedMsInput.value, 10) || 50;
  const cps = parseFloat(speedCpsInput.value) || 20;
  const hotkey = document.getElementById('toggle-hotkey-val').value;
  const limitEnabled = !runInfinitelyCheck.checked;
  const limitCount = parseInt(document.getElementById('limit-count').value, 10) || 100;
  
  let button = 'left';
  let clickType = 'single';
  let keyCode = 0;
  let keyName = '';

  if (type === 'mouse') {
    button = document.getElementById('mouse-button').value;
    clickType = document.getElementById('mouse-click-type').value;
  } else {
    keyCode = parseInt(document.getElementById('keyboard-key-vk').value, 10);
    keyName = document.getElementById('keyboard-key-display').value;
    
    if (!keyCode || !keyName) {
      alert('Please select a keyboard key to spam.');
      return;
    }
  }

  if (!hotkey) {
    alert('Please record a activation hotkey.');
    return;
  }

  // Check for duplicate hotkeys
  const editId = editIdInput.value;
  const isDuplicateHotkey = clickers.some(c => c.hotkey === hotkey && c.id !== editId);
  if (isDuplicateHotkey || hotkey === 'F8') {
    alert(`Hotkey '${hotkey}' is already used by another clicker or reserved as Master Stop (F8).`);
    return;
  }

  if (editId) {
    // Edit existing clicker
    const idx = clickers.findIndex(c => c.id === editId);
    if (idx !== -1) {
      // If it was running, stop it first!
      if (clickers[idx].running) {
        toggleClickerRun(editId);
      }
      
      clickers[idx] = {
        ...clickers[idx],
        name, type, button, clickType, keyCode, keyName, intervalMs, cps, hotkey, limitEnabled, limitCount
      };
    }
  } else {
    // Add new clicker
    const newClicker = {
      id: 'clicker-' + Date.now(),
      name, type, button, clickType, keyCode, keyName, intervalMs, cps, hotkey, limitEnabled, limitCount,
      running: false,
      clicksCount: 0
    };
    clickers.push(newClicker);
  }

  saveClickers();
  updateMainProcessHotkeys();
  renderClickers();
  closeActiveModal();
  updateStatsUI();
});

// Edit clicker helper
window.editClicker = function(id) {
  const clicker = clickers.find(c => c.id === id);
  if (!clicker) return;

  openAddModal();
  modalTitle.textContent = "Edit Clicker Profile";
  editIdInput.value = clicker.id;
  
  document.getElementById('clicker-name').value = clicker.name;
  
  if (clicker.type === 'mouse') {
    typeMouseRadio.checked = true;
    typeMouseRadio.dispatchEvent(new Event('change'));
    document.getElementById('mouse-button').value = clicker.button;
    document.getElementById('mouse-click-type').value = clicker.clickType;
  } else {
    typeKeyboardRadio.checked = true;
    typeKeyboardRadio.dispatchEvent(new Event('change'));
    document.getElementById('keyboard-key-display').value = clicker.keyName;
    document.getElementById('keyboard-key-vk').value = clicker.keyCode;
  }
  
  speedMsInput.value = clicker.intervalMs;
  speedCpsInput.value = clicker.cps;
  updateSliderFromCps(clicker.cps);
  
  document.getElementById('toggle-hotkey-display').value = clicker.hotkey;
  document.getElementById('toggle-hotkey-val').value = clicker.hotkey;
  
  runInfinitelyCheck.checked = !clicker.limitEnabled;
  runInfinitelyCheck.dispatchEvent(new Event('change'));
  document.getElementById('limit-count').value = clicker.limitCount;
};

// Delete clicker helper
window.deleteClicker = function(id) {
  const index = clickers.findIndex(c => c.id === id);
  if (index === -1) return;

  // Confirm delete if running
  if (clickers[index].running) {
    toggleClickerRun(id);
  }

  clickers.splice(index, 1);
  saveClickers();
  updateMainProcessHotkeys();
  renderClickers();
  updateStatsUI();
  updateGlobalIndicator();
};

// Theme Color Settings
const themeBtns = document.querySelectorAll('.theme-color-btn');
themeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const theme = btn.getAttribute('data-color');
    setTheme(theme);
  });
});

function setTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem('setting_theme', theme);
  
  themeBtns.forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-color') === theme);
  });
}

// IPC Receivers from Main Process
ipcRenderer.on('backend-stat', (event, { id, count }) => {
  const clicker = clickers.find(c => c.id === id);
  if (clicker) {
    // Add difference to total accumulator
    const diff = count - clicker.clicksCount;
    if (diff > 0) {
      totalClicksAccumulator += diff;
    }
    
    clicker.clicksCount = count;
    
    // Update count in UI Card directly (avoids full re-render)
    const countElement = document.getElementById(`clicks-count-${clicker.id}`);
    if (countElement) {
      countElement.textContent = count;
    }
  }
});

ipcRenderer.on('backend-limit-reached', (event, id) => {
  console.log(`Limit reached for clicker: ${id}`);
  const clicker = clickers.find(c => c.id === id);
  if (clicker && clicker.running) {
    // Backend automatically stopped, sync UI state
    clicker.running = false;
    playToggleSound(false);
    
    // Render
    renderClickers();
    updateGlobalIndicator();
    updateStatsUI();
  }
});

// Trigger toggle from global hotkey (via Main Process)
ipcRenderer.on('global-hotkey-triggered', (event, hotkey) => {
  if (hotkey === 'F8') {
    // Master Emergency stop
    stopAllClickers();
    return;
  }
  
  // Find clicker with this hotkey
  const clicker = clickers.find(c => c.hotkey === hotkey);
  if (clicker) {
    toggleClickerRun(clicker.id);
  }
});

ipcRenderer.on('tray-stop-all', () => {
  stopAllClickers();
});

// Save settings when toggled
document.getElementById('setting-tray').addEventListener('change', (e) => {
  localStorage.setItem('setting_tray', e.target.checked);
});

document.getElementById('setting-sound').addEventListener('change', (e) => {
  localStorage.setItem('setting_sound', e.target.checked);
});

document.getElementById('setting-startup').addEventListener('change', (e) => {
  localStorage.setItem('setting_startup', e.target.checked);
  // Optional: send IPC to main process to update AutoLaunch settings
  // For simplicity, we can do standard registry editing in main if they want.
});

// Stats Calculation & Tracking
function startCpsTracker() {
  if (statsInterval) clearInterval(statsInterval);
  
  // Every 500ms, compute actual clicks/sec
  let lastAccumulated = 0;
  statsInterval = setInterval(() => {
    const nowAccumulated = totalClicksAccumulator;
    const clicksDelta = nowAccumulated - lastAccumulated;
    lastAccumulated = nowAccumulated;
    
    // Clicks per second (we check every 500ms, so multiply delta by 2)
    const currentCps = clicksDelta * 2;
    
    // Update live indicators
    updateCpsDial(currentCps);
    
    if (currentCps > peakCps) {
      peakCps = currentCps;
      document.getElementById('stats-peak-cps').textContent = `${peakCps.toFixed(1)} CPS`;
    }
  }, 500);
}

// Update the circular SVG dial
const cpsDial = document.getElementById('stats-cps-dial');
const totalCpsVal = document.getElementById('stats-total-cps');

function updateCpsDial(cps) {
  totalCpsVal.textContent = cps.toFixed(1);
  
  // SVG circle circumference is 2 * PI * r = 2 * 3.14159 * 45 = 282.74 (~283)
  // Max scale is, say, 100 CPS
  const maxCps = 100;
  const percentage = Math.min(1, cps / maxCps);
  
  const strokeOffset = 283 - (283 * percentage);
  cpsDial.style.strokeDashoffset = strokeOffset;
  
  // Speed up pulsing wave based on CPS
  const wave1 = document.getElementById('visualizer-wave');
  const wave2 = document.getElementById('visualizer-wave-2');
  
  if (cps > 0) {
    const duration = Math.max(0.2, 2.0 - (cps / 20)); // speed up animation
    wave1.style.animationDuration = `${duration}s`;
    wave2.style.animationDuration = `${duration}s`;
  }
}

// Session duration timer
function startSessionTimer() {
  if (statsTimerInterval) clearInterval(statsTimerInterval);
  
  statsTimerInterval = setInterval(() => {
    if (!statsTimeStart) return;
    
    const diffMs = Date.now() - statsTimeStart;
    const elapsedSecs = Math.floor(diffMs / 1000);
    
    const hrs = Math.floor(elapsedSecs / 3600).toString().padStart(2, '0');
    const mins = Math.floor((elapsedSecs % 3600) / 60).toString().padStart(2, '0');
    const secs = (elapsedSecs % 60).toString().padStart(2, '0');
    
    document.getElementById('stats-elapsed-time').textContent = `${hrs}:${mins}:${secs}`;
  }, 1000);
}

function stopSessionTimer() {
  if (statsTimerInterval) {
    clearInterval(statsTimerInterval);
    statsTimerInterval = null;
  }
  // Keep start time reset for next run
  statsTimeStart = null;
}

// Sync stats page numbers
function updateStatsUI() {
  document.getElementById('stats-total-clicks').textContent = totalClicksAccumulator;
  document.getElementById('stats-active-count').textContent = clickers.filter(c => c.running).length;
}

// Run initializer on load
window.addEventListener('DOMContentLoaded', init);
