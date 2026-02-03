import { SCAN_CODES, MODIFIERS } from './utils.js';

let device;
let activeKeyIndex = null;
let tempMod = 0;
let tempKey = 0;
let tempText = "";

// Metadata storage
let keyMetadata = JSON.parse(localStorage.getItem('sayo_metadata')) || {};

// 1. Initialize F-Key Dropdown (F13 - F24 ONLY)
const fSelector = document.getElementById('fkey-selector');
Object.keys(SCAN_CODES).forEach(fKey => {
    const keyNum = parseInt(fKey.replace('F', ''));
    if (keyNum >= 13 && keyNum <= 24) {
        fSelector.add(new Option(fKey, fKey));
    }
});

/**
 * 2. Hardware Connection
 */
export async function connectDevice() {
    try {
        const filters = [{ vendorId: 0x1189, productId: 0x8890 }];
        const devices = await navigator.hid.requestDevice({ filters });
        
        // Filter for Vendor Defined Interface (Usage Page 0xFF00)
        device = devices.find(d => 
            d.collections.some(c => c.usagePage === 0xFF00 || c.usagePage === 0xFF60)
        );

        if (!device) {
            alert("Security Error: Interface Blocked.\n\nPlease select the 'HID-compliant device' or 'Vendor-defined device' (NOT 'Keyboard').");
            return;
        }

        if (!device.opened) {
            await device.open();
        }
        
        document.getElementById('status').innerText = "Status: Connected";
        document.getElementById('status').style.color = "#00d2ff";
        document.getElementById('connectBtn').style.display = 'none';
        refreshSummary();
        console.log("Device connected:", device.productName);

    } catch (e) {
        console.error(e);
        if (e.name === 'NotAllowedError') {
             alert("Connection Blocked. Please ensure you did not select the 'Keyboard' interface.");
        } else {
             alert(`Connection Failed: ${e.message}`);
        }
    }
}

/**
 * 3. Key Selection
 */
export function handleKeySelection(idx) {
    activeKeyIndex = idx;
    
    document.querySelectorAll('.key').forEach(k => k.classList.remove('active'));
    document.getElementById(`v-${idx}`).classList.add('active');
    document.getElementById('editor-container').classList.remove('hidden');
    document.getElementById('editingLabel').innerText = `Editing Key ${idx + 1}`;
    
    const defaultFKey = `F${13 + idx}`;
    const data = keyMetadata[idx] || { name: "", desc: "", shortcutText: "None", fKey: defaultFKey };
    
    document.getElementById('bind-name').value = data.name;
    document.getElementById('bind-desc').value = data.desc;
    document.getElementById('active-shortcut-display').innerText = data.shortcutText;
    
    if (SCAN_CODES[data.fKey]) {
        document.getElementById('fkey-selector').value = data.fKey;
    }
}

/**
 * 4. Modal Recording
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
    if (modal.classList.contains('hidden')) return;
    e.preventDefault();

    tempMod = (e.ctrlKey ? 0x01 : 0) | (e.shiftKey ? 0x02 : 0) | (e.altKey ? 0x04 : 0);
    
    const mods = [];
    if (e.ctrlKey) mods.push("Ctrl");
    if (e.shiftKey) mods.push("Shift");
    if (e.altKey) mods.push("Alt");
    
    if (e.key !== 'Control' && e.key !== 'Shift' && e.key !== 'Alt') {
        tempText = (mods.length > 0 ? mods.join('+') + '+' : '') + e.key.toUpperCase();
        recorderDisplay.innerText = tempText;
        recorderDisplay.style.color = "#00d2ff";
    } else {
        recorderDisplay.innerText = mods.join('+') + "...";
    }
});

document.getElementById('modal-save').onclick = () => {
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
 * 5. Save to Hardware (FIXED)
 */
export async function saveActiveBinding() {
    if (!device) return alert("Please Connect Keypad first!");
    if (activeKeyIndex === null) return alert("Please select a key to edit first!");

    const fKeyName = document.getElementById('fkey-selector').value;
    const hardwareKeyByte = SCAN_CODES[fKeyName];
    const name = document.getElementById('bind-name').value;
    const desc = document.getElementById('bind-desc').value;
    const shortcutText = document.getElementById('active-shortcut-display').innerText;

    // PREPARE REPORT
    // Command 0x03 is standard for "Write Key" on many SayoDevices
    const report = new Uint8Array(64).fill(0); // Fill with zeros to prevent garbage data
    report[0] = 0x03;            // Command ID
    report[1] = activeKeyIndex;  // Key Index (0-6)
    report[2] = 0x11;            // Action Type (HID Key)
    report[3] = 0x01;            // Modifier 1 (Standard)
    report[4] = 0x01;            // Modifier 2 (Standard)
    report[5] = tempMod;         // Modifier Mask (Ctrl/Shift/Alt)
    report[6] = hardwareKeyByte; // The F13-F24 Scan Code

    try {
        console.log("Attempting Write to Report ID 0...");
        await device.sendReport(0, report);
        console.log("Success on Report ID 0");
        finalize(name, desc, shortcutText, fKeyName);
    } catch (e) {
        console.warn("Write to ID 0 failed, trying Report ID 1...", e);
        try {
            // FIX: Send the FULL report to ID 1. Do not slice.
            // Some firmwares require the command byte 0x03 even on Report ID 1.
            await device.sendReport(1, report);
            console.log("Success on Report ID 1");
            finalize(name, desc, shortcutText, fKeyName);
        } catch (err) {
            console.error("Critical Write Error:", err);
            alert(`Write Failed: ${err.message}\n\nTry reconnecting the device.`);
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
 * 6. Summary Table
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

// Bindings
document.getElementById('connectBtn').onclick = connectDevice;
document.getElementById('btn-record-popup').onclick = openRecordModal;
document.getElementById('save-binding-btn').onclick = saveActiveBinding;

document.querySelectorAll('.key').forEach(k => {
    k.onclick = () => handleKeySelection(parseInt(k.dataset.idx));
});

window.onload = refreshSummary;