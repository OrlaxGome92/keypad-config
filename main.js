/* main.js */
import { SCAN_CODES, MODIFIERS } from './utils.js';

let device;
let activeKeyIndex = null;
let currentPayload = { mod: 0, keyByte: 0 };

// Variables for Recorder
let tempMod = 0;
let tempKeyByte = 0;
let tempText = "";

let hwReportId = 0;
let hwReportLen = 64;

let keyMetadata = JSON.parse(localStorage.getItem('sayo_metadata')) || {};

// 1. Initialize Dropdown
const fSelector = document.getElementById('fkey-selector');
Object.entries(SCAN_CODES).forEach(([keyName, byte]) => {
    if (keyName.startsWith('F') && parseInt(keyName.substring(1)) >= 13) {
        fSelector.add(new Option(keyName, byte));
    }
});
fSelector.addEventListener('change', (e) => {
    currentPayload.keyByte = parseInt(e.target.value);
    currentPayload.mod = 0;
    document.getElementById('active-shortcut-display').innerText = e.target.options[e.target.selectedIndex].text;
});

// 2. Connect Device
export async function connectDevice() {
    try {
        const filters = [{ vendorId: 0x1189, productId: 0x8890 }];
        const devices = await navigator.hid.requestDevice({ filters });
        
        device = devices.find(d => d.collections.some(c => c.usagePage === 0xFF00 || c.usagePage === 0xFF60));

        if (!device) return alert("Please select the 'HID-compliant device' (NOT Keyboard).");
        if (!device.opened) await device.open();
        
        // Auto-Detect Report ID
        const configCollection = device.collections.find(c => c.usagePage === 0xFF00 || c.usagePage === 0xFF60);
        if (configCollection?.outputReports?.length > 0) {
            hwReportId = configCollection.outputReports[0].reportId;
            if (configCollection.outputReports[0].items?.length > 0) {
                const item = configCollection.outputReports[0].items[0];
                hwReportLen = (item.reportCount * item.reportSize) / 8;
            }
        } else {
            hwReportId = 1; // Fallback
        }
        
        console.log(`Connected. ID=${hwReportId}, Len=${hwReportLen}`);
        document.getElementById('status').innerText = "Status: Connected";
        document.getElementById('status').style.color = "#00d2ff";
        document.getElementById('connectBtn').style.display = 'none';
        refreshSummary();

    } catch (e) {
        console.error(e);
        alert(`Connection Failed: ${e.message}`);
    }
}

// 3. Handle Visual Key Click (Edit Mode)
export function handleKeySelection(idx) {
    activeKeyIndex = idx;
    
    // UI Highlight
    document.querySelectorAll('.key').forEach(k => k.classList.remove('active'));
    document.getElementById(`v-${idx}`).classList.add('active');
    document.getElementById('editor-container').classList.remove('hidden');
    document.getElementById('editingLabel').innerText = `Editing Key ${idx + 1}`;
    
    // Load Data
    const data = keyMetadata[idx] || { name: "", desc: "", shortcutText: "None" };
    document.getElementById('bind-name').value = data.name;
    document.getElementById('bind-desc').value = data.desc;
    document.getElementById('active-shortcut-display').innerText = data.shortcutText;
    
    // Reset internal payload until user interacts
    currentPayload = { mod: 0, keyByte: 0 };
}

// 4. Recorder Modal Logic
const modal = document.getElementById('record-modal');
const recorderDisplay = document.getElementById('modal-recorder-display');

export function openRecordModal() {
    modal.classList.remove('hidden');
    tempMod = 0;
    tempKeyByte = 0;
    tempText = "Listening...";
    recorderDisplay.innerText = tempText;
}

// Global Key Listener (Shared by Modal and Test Zone)
window.addEventListener('keydown', (e) => {
    // A. If Modal is open, record for assignment
    if (!modal.classList.contains('hidden')) {
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
            }
        } else {
            recorderDisplay.innerText = mods.join('+') + "...";
        }
    }
});

document.getElementById('modal-save').onclick = () => {
    currentPayload.mod = tempMod;
    currentPayload.keyByte = tempKeyByte;
    document.getElementById('active-shortcut-display').innerText = tempText;
    modal.classList.add('hidden');
};
document.getElementById('modal-reset').onclick = () => { tempMod = 0; tempKeyByte = 0; recorderDisplay.innerText = "Listening..."; };
document.getElementById('modal-cancel').onclick = () => modal.classList.add('hidden');


// 5. TEST ZONE LOGIC
const testInput = document.getElementById('test-input');
const testOutput = document.getElementById('test-output');

testInput.addEventListener('keydown', (e) => {
    e.preventDefault(); // Prevent actual typing
    const mods = [];
    if (e.ctrlKey) mods.push("Ctrl");
    if (e.shiftKey) mods.push("Shift");
    if (e.altKey) mods.push("Alt");
    
    let keyPart = "";
    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        keyPart = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    }

    const fullStr = (mods.length > 0 ? mods.join(" + ") + " + " : "") + keyPart;
    testInput.value = fullStr;
    testOutput.innerText = `Debug Info: Code=${e.code}, Ctrl=${e.ctrlKey}, Shift=${e.shiftKey}`;
    
    // Visual Flash
    testInput.style.borderColor = "#00ff00";
    setTimeout(() => testInput.style.borderColor = "#555", 200);
});


// 6. SAVE TO HARDWARE (PROTOCOL UPDATE)
export async function saveActiveBinding() {
    if (!device) return alert("Connect Keypad first!");
    
    // Check fallback if user didn't record anything but pressed save
    if (currentPayload.keyByte === 0) {
        const dropdownVal = parseInt(document.getElementById('fkey-selector').value);
        if (dropdownVal) currentPayload.keyByte = dropdownVal;
        else return alert("Please Record a shortcut first.");
    }

    const report = new Uint8Array(hwReportLen).fill(0);
    
    // --- PROTOCOL FIX V3 ---
    // Mode 0x11 (Combo) usually expects:
    // [0x03, Index, 0x11, MODIFIER, 0x00, 0x00, KEYCODE]
    
    report[0] = 0x03;             // Command ID
    report[1] = activeKeyIndex;   // Key Index
    report[2] = 0x11;             // Mode: Combo (0x11)
    report[3] = currentPayload.mod; // Byte 3: Modifier Mask !! (Moved from 5)
    report[4] = 0x00;             
    report[5] = 0x00;             
    report[6] = currentPayload.keyByte; // Byte 6: Key Code
    
    try {
        console.log(`Writing: KeyIdx=${activeKeyIndex} Mode=${report[2]} Mod=${report[3]} Code=${report[6]}`);
        await device.sendReport(hwReportId, report);
        
        // Save Metadata
        const name = document.getElementById('bind-name').value;
        const desc = document.getElementById('bind-desc').value;
        const txt = document.getElementById('active-shortcut-display').innerText;
        keyMetadata[activeKeyIndex] = { name, desc, shortcutText: txt };
        localStorage.setItem('sayo_metadata', JSON.stringify(keyMetadata));
        
        refreshSummary();
        alert("Saved! Test it in the box below.");
        
    } catch (e) {
        console.error(e);
        alert("Write Failed. Check console.");
    }
}

function refreshSummary() {
    const tbody = document.getElementById('summary-body');
    tbody.innerHTML = '';
    const entries = Object.entries(keyMetadata).sort((a, b) => a[0] - b[0]);
    
    entries.forEach(([idx, data]) => {
        tbody.innerHTML += `<tr>
            <td>Key ${parseInt(idx) + 1}</td>
            <td><strong>${data.name}</strong></td>
            <td><code>${data.shortcutText}</code></td>
            <td style="color:#aaa;">${data.desc}</td>
        </tr>`;
    });
}

// Bindings
document.getElementById('connectBtn').onclick = connectDevice;
document.getElementById('btn-record-popup').onclick = openRecordModal;
document.getElementById('save-binding-btn').onclick = saveActiveBinding;
document.querySelectorAll('.key').forEach(k => k.onclick = () => handleKeySelection(parseInt(k.dataset.idx)));

window.onload = refreshSummary;