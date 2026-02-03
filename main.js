/* main.js */
import { SCAN_CODES, MODIFIERS } from './utils.js';

let device;
let activeKeyIndex = null;

// Store the configuration to be sent
let currentPayload = {
    mod: 0,
    keyByte: 0
};

// Temp variables for the recorder
let tempMod = 0;
let tempKeyByte = 0;
let tempText = "";

let hwReportId = 0;
let hwReportLen = 64;

let keyMetadata = JSON.parse(localStorage.getItem('sayo_metadata')) || {};

// 1. Initialize Dropdown with F13-F24
const fSelector = document.getElementById('fkey-selector');
Object.entries(SCAN_CODES).forEach(([keyName, byte]) => {
    // Only show F13-F24 in the dropdown list
    if (keyName.startsWith('F') && parseInt(keyName.substring(1)) >= 13) {
        fSelector.add(new Option(keyName, byte));
    }
});

// EVENT: Dropdown Changed manually
fSelector.addEventListener('change', (e) => {
    currentPayload.keyByte = parseInt(e.target.value);
    currentPayload.mod = 0; 
    document.getElementById('active-shortcut-display').innerText = e.target.options[e.target.selectedIndex].text;
});

/**
 * 2. Connect & Auto-Detect
 */
export async function connectDevice() {
    try {
        const filters = [{ vendorId: 0x1189, productId: 0x8890 }];
        const devices = await navigator.hid.requestDevice({ filters });
        
        device = devices.find(d => 
            d.collections.some(c => c.usagePage === 0xFF00 || c.usagePage === 0xFF60)
        );

        if (!device) return alert("Please select the 'HID-compliant device' (NOT Keyboard).");

        if (!device.opened) await device.open();
        
        // --- SMART DETECT ---
        const configCollection = device.collections.find(c => c.usagePage === 0xFF00 || c.usagePage === 0xFF60);
        if (configCollection?.outputReports?.length > 0) {
            const report = configCollection.outputReports[0];
            hwReportId = report.reportId;
            if (report.items?.length > 0) {
                const item = report.items[0];
                hwReportLen = (item.reportCount * item.reportSize) / 8;
            }
        } else {
            hwReportId = 1; // Fallback
        }
        
        console.log(`Connected. Target: ID=${hwReportId}, Len=${hwReportLen}`);
        document.getElementById('status').innerText = "Status: Connected";
        document.getElementById('status').style.color = "#00d2ff";
        document.getElementById('connectBtn').style.display = 'none';
        refreshSummary();

    } catch (e) {
        console.error(e);
        alert(`Connection Failed: ${e.message}`);
    }
}

/**
 * 3. Handle Key Selection
 */
export function handleKeySelection(idx) {
    activeKeyIndex = idx;
    
    document.querySelectorAll('.key').forEach(k => k.classList.remove('active'));
    document.getElementById(`v-${idx}`).classList.add('active');
    document.getElementById('editor-container').classList.remove('hidden');
    document.getElementById('editingLabel').innerText = `Editing Key ${idx + 1}`;
    
    const data = keyMetadata[idx] || { name: "", desc: "", shortcutText: "None" };
    
    document.getElementById('bind-name').value = data.name;
    document.getElementById('bind-desc').value = data.desc;
    document.getElementById('active-shortcut-display').innerText = data.shortcutText;
    
    currentPayload = { mod: 0, keyByte: 0 };
}

/**
 * 4. Recording Logic
 */
const modal = document.getElementById('record-modal');
const recorderDisplay = document.getElementById('modal-recorder-display');

export function openRecordModal() {
    modal.classList.remove('hidden');
    tempMod = 0;
    tempKeyByte = 0;
    tempText = "Listening...";
    recorderDisplay.innerText = tempText;
}

window.addEventListener('keydown', (e) => {
    if (modal.classList.contains('hidden')) return;
    e.preventDefault();

    tempMod = (e.ctrlKey ? 0x01 : 0) | (e.shiftKey ? 0x02 : 0) | (e.altKey ? 0x04 : 0);
    
    const mods = [];
    if (e.ctrlKey) mods.push("Ctrl");
    if (e.shiftKey) mods.push("Shift");
    if (e.altKey) mods.push("Alt");
    
    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        const code = SCAN_CODES[e.code];
        if (code) {
            tempKeyByte = code;
            const keyLabel = e.key.length === 1 ? e.key.toUpperCase() : e.key;
            tempText = (mods.length > 0 ? mods.join('+') + '+' : '') + keyLabel;
            
            recorderDisplay.innerText = tempText;
            recorderDisplay.style.color = "#00d2ff";
        } else {
            recorderDisplay.innerText = "Unknown Key: " + e.code;
            recorderDisplay.style.color = "orange";
        }
    } else {
        recorderDisplay.innerText = mods.join('+') + "...";
    }
});

document.getElementById('modal-save').onclick = () => {
    currentPayload.mod = tempMod;
    currentPayload.keyByte = tempKeyByte;
    document.getElementById('active-shortcut-display').innerText = tempText;
    modal.classList.add('hidden');
};

document.getElementById('modal-reset').onclick = () => {
    tempMod = 0;
    tempKeyByte = 0;
    recorderDisplay.innerText = "Listening...";
};
document.getElementById('modal-cancel').onclick = () => modal.classList.add('hidden');

/**
 * 5. Save To Hardware (FIXED BYTE MAPPING)
 */
export async function saveActiveBinding() {
    if (!device) return alert("Connect Keypad first!");
    
    if (currentPayload.keyByte === 0) {
        const dropdownVal = parseInt(document.getElementById('fkey-selector').value);
        if (dropdownVal) {
             currentPayload.keyByte = dropdownVal;
        } else {
             return alert("Please select an F-Key or Record a shortcut first.");
        }
    }

    const report = new Uint8Array(hwReportLen).fill(0);
    
    // --- PAYLOAD FIX ---
    // Previous code used Mode 0x11 and offsets 5/6, which was ignoring modifiers.
    // We switch to Mode 0x01 (Standard Keyboard) which uses offsets 3 and 4.
    
    report[0] = 0x03;             // Command ID (Write)
    report[1] = activeKeyIndex;   // Key Index (0-6)
    report[2] = 0x01;             // Mode: 0x01 = Keyboard/Shortcut
    report[3] = currentPayload.mod;     // Byte 3: Modifier Mask (Ctrl/Shift)
    report[4] = currentPayload.keyByte; // Byte 4: Key Code (HID)
    
    // Bytes 5+ are zero padding

    try {
        console.log(`Writing to ID ${hwReportId}: Mode=${report[2]} Mod=${report[3]} Code=${report[4]}`);
        await device.sendReport(hwReportId, report);
        
        // Save Metadata
        const name = document.getElementById('bind-name').value;
        const desc = document.getElementById('bind-desc').value;
        const txt = document.getElementById('active-shortcut-display').innerText;
        
        keyMetadata[activeKeyIndex] = { name, desc, shortcutText: txt };
        localStorage.setItem('sayo_metadata', JSON.stringify(keyMetadata));
        
        alert("Saved Successfully!");
        refreshSummary();
        
    } catch (e) {
        console.error(e);
        alert("Write Failed. See console.");
    }
}

function refreshSummary() {
    const tbody = document.getElementById('summary-body');
    tbody.innerHTML = '';
    const entries = Object.entries(keyMetadata).sort((a, b) => a[0] - b[0]);
    
    entries.forEach(([idx, data]) => {
        tbody.innerHTML += `<tr>
            <td>Key ${parseInt(idx) + 1}</td>
            <td>-</td>
            <td><strong>${data.name}</strong></td>
            <td><code>${data.shortcutText}</code></td>
            <td>${data.desc}</td>
        </tr>`;
    });
}

// Bindings
document.getElementById('connectBtn').onclick = connectDevice;
document.getElementById('btn-record-popup').onclick = openRecordModal;
document.getElementById('save-binding-btn').onclick = saveActiveBinding;
document.querySelectorAll('.key').forEach(k => k.onclick = () => handleKeySelection(parseInt(k.dataset.idx)));

window.onload = refreshSummary;