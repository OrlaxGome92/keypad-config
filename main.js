import { SCAN_CODES, MODIFIERS } from './utils.js';

let device;
let activeKeyIndex = null;
let tempMod = 0;
let tempKey = 0;
let tempText = "";

// Metadata storage for the summary table
let keyMetadata = JSON.parse(localStorage.getItem('sayo_metadata')) || {};

// 1. Initialize F-Key Dropdown (F13 - F24 ONLY)
const fSelector = document.getElementById('fkey-selector');
Object.keys(SCAN_CODES).forEach(fKey => {
    // Check if the key starts with 'F' and is >= 13
    const keyNum = parseInt(fKey.replace('F', ''));
    if (keyNum >= 13 && keyNum <= 24) {
        fSelector.add(new Option(fKey, fKey));
    }
});

/**
 * 2. Hardware Connection
 * Specifically filters for the Vendor interface to bypass the NotAllowedError.
 */
export async function connectDevice() {
    try {
        const filters = [{ vendorId: 0x1189, productId: 0x8890 }];
        const devices = await navigator.hid.requestDevice({ filters });
        
        // Target Usage Page 0xFF00 (Vendor Defined) to avoid restricted keyboard interface
        // Windows/Chrome blocks Usage Page 1 (Generic Desktop) Usage 6 (Keyboard)
        device = devices.find(d => 
            d.collections.some(c => c.usagePage === 0xFF00 || c.usagePage === 0xFF60)
        );

        if (!device) {
            alert("Security Error: You selected the 'Keyboard' interface.\n\nPlease try again and select the 'HID-compliant device' or 'Vendor-defined device'.");
            return;
        }

        await device.open();
        document.getElementById('status').innerText = "Status: Connected";
        document.getElementById('status').style.color = "#00d2ff";
        document.getElementById('connectBtn').style.display = 'none';
        refreshSummary();
    } catch (e) {
        console.error(e);
        if (e.name === 'NotAllowedError') {
             alert("Connection Blocked.\n\nEnsure you did NOT select the line item labeled 'Keyboard'. Windows Security blocks access to that specific interface.");
        } else {
             alert("Connection failed. Ensure you are using HTTPS and selected the correct interface.");
        }
    }
}

/**
 * 3. Key Selection
 * Loads existing metadata and automatically syncs the F-key dropdown.
 */
export function handleKeySelection(idx) {
    activeKeyIndex = idx;
    
    // UI Updates
    document.querySelectorAll('.key').forEach(k => k.classList.remove('active'));
    document.getElementById(`v-${idx}`).classList.add('active');
    document.getElementById('editor-container').classList.remove('hidden');
    document.getElementById('editingLabel').innerText = `Editing Key ${idx + 1}`;
    
    // Load existing metadata or defaults
    // Default F-Key mapping: Key 0 -> F13, Key 1 -> F14, etc.
    const defaultFKey = `F${13 + idx}`;
    const data = keyMetadata[idx] || { name: "", desc: "", shortcutText: "None", fKey: defaultFKey };
    
    document.getElementById('bind-name').value = data.name;
    document.getElementById('bind-desc').value = data.desc;
    document.getElementById('active-shortcut-display').innerText = data.shortcutText;
    
    // Sync the F-Key dropdown
    if (SCAN_CODES[data.fKey]) {
        document.getElementById('fkey-selector').value = data.fKey;
    }
}

/**
 * 4. Modal Recording Logic
 */
const modal = document.getElementById('record-modal');
const recorderDisplay = document.getElementById('modal-recorder-display');

export function openRecordModal() {
    modal.classList.remove('hidden');
    tempMod = 0;
    tempText = "Listening...";
    recorderDisplay.innerText = tempText;
    recorderDisplay.style.color = "#666";
}

window.addEventListener('keydown', (e) => {
    // Only listen if modal is open
    if (modal.classList.contains('hidden')) return;
    
    e.preventDefault();

    // Capture Modifiers Bitmask
    tempMod = (e.ctrlKey ? 0x01 : 0) | (e.shiftKey ? 0x02 : 0) | (e.altKey ? 0x04 : 0);
    
    // Build human-readable string
    const mods = [];
    if (e.ctrlKey) mods.push("Ctrl");
    if (e.shiftKey) mods.push("Shift");
    if (e.altKey) mods.push("Alt");
    
    // If a non-modifier key is pressed, show the full combo
    // We filter out standalone presses of Control/Shift/Alt to keep display clean until combo is done
    if (e.key !== 'Control' && e.key !== 'Shift' && e.key !== 'Alt') {
        tempText = (mods.length > 0 ? mods.join('+') + '+' : '') + e.key.toUpperCase();
        recorderDisplay.innerText = tempText;
        recorderDisplay.style.color = "#00d2ff"; // Active color
    } else {
        // Just modifiers pressed so far
        recorderDisplay.innerText = mods.join('+') + "...";
    }
});

// Modal Buttons
document.getElementById('modal-save').onclick = () => {
    // Save the recorded text to the main editor UI
    document.getElementById('active-shortcut-display').innerText = tempText;
    modal.classList.add('hidden');
};

document.getElementById('modal-reset').onclick = () => {
    tempMod = 0;
    tempText = "Listening...";
    recorderDisplay.innerText = tempText;
    recorderDisplay.style.color = "#666";
};

document.getElementById('modal-cancel').onclick = () => modal.classList.add('hidden');

/**
 * 5. Save to Hardware
 */
export async function saveActiveBinding() {
    if (!device) return alert("Connect Keypad first!");

    const fKeyName = document.getElementById('fkey-selector').value;
    const hardwareKeyByte = SCAN_CODES[fKeyName];
    const name = document.getElementById('bind-name').value;
    const desc = document.getElementById('bind-desc').value;
    const shortcutText = document.getElementById('active-shortcut-display').innerText;

    // Construct Report
    const report = new Uint8Array(64);
    report[0] = 0x03; // Command
    report[1] = activeKeyIndex; // Key Index
    report[2] = 0x11; // Action: HID Key
    report[3] = 0x01; 
    report[4] = 0x01; 
    report[5] = tempMod; // Modifier mask from the recording
    report[6] = hardwareKeyByte; // The F-Key byte (e.g., F13)

    try {
        await device.sendReport(0, report);
        finalize(name, desc, shortcutText, fKeyName);
    } catch (e) {
        try {
            // Fallback for different firmware versions (Report ID 1)
            await device.sendReport(1, report.slice(1));
            finalize(name, desc, shortcutText, fKeyName);
        } catch (err) {
            console.error(err);
            alert("Write Failed: Device communication error.");
        }
    }
}

function finalize(name, desc, shortcutText, fKeyName) {
    keyMetadata[activeKeyIndex] = { name, desc, shortcutText, fKey: fKeyName };
    localStorage.setItem('sayo_metadata', JSON.stringify(keyMetadata));
    alert("Saved Successfully!");
    refreshSummary();
}

/**
 * 6. Summary Table Refresh
 */
function refreshSummary() {
    const tbody = document.getElementById('summary-body');
    tbody.innerHTML = '';
    
    const entries = Object.entries(keyMetadata).sort((a, b) => a[0] - b[0]);
    
    if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#666;">No keys programmed yet.</td></tr>';
        return;
    }

    entries.forEach(([idx, data]) => {
        const row = `<tr>
            <td>Key ${parseInt(idx) + 1}</td>
            <td>${data.fKey}</td>
            <td><strong>${data.name}</strong></td>
            <td><code style="background:#333; padding:2px 5px; border-radius:3px;">${data.shortcutText}</code></td>
            <td style="color:#aaa;">${data.desc}</td>
        </tr>`;
        tbody.innerHTML += row;
    });
}

// Global Event Binding
document.getElementById('connectBtn').onclick = connectDevice;
document.getElementById('btn-record-popup').onclick = openRecordModal;
document.getElementById('save-binding-btn').onclick = saveActiveBinding;

// Bind Keypad Visual Clicks
document.querySelectorAll('.key').forEach(k => {
    k.onclick = () => handleKeySelection(parseInt(k.dataset.idx));
});

window.onload = refreshSummary;