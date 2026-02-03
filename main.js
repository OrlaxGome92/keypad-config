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

// 1. Initialize Dropdown (F13-F24)
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

// 2. Connect Device & Auto-Detect
export async function connectDevice() {
    try {
        const filters = [{ vendorId: 0x1189, productId: 0x8890 }];
        const devices = await navigator.hid.requestDevice({ filters });
        
        device = devices.find(d => d.collections.some(c => c.usagePage === 0xFF00 || c.usagePage === 0xFF60));

        if (!device) return alert("Please select the 'HID-compliant device' (NOT Keyboard).");
        if (!device.opened) await device.open();
        
        // --- SMART DETECT REPORT ID ---
        const configCollection = device.collections.find(c => c.usagePage === 0xFF00 || c.usagePage === 0xFF60);
        if (configCollection?.outputReports?.length > 0) {
            hwReportId = configCollection.outputReports[0].reportId;
            if (configCollection.outputReports[0].items?.length > 0) {
                const item = configCollection.outputReports[0].items[0];
                hwReportLen = (item.reportCount * item.reportSize) / 8;
            }
        } else {
            hwReportId = 0; // Fallback to 0 if detection fails
        }
        
        console.log(`Connected. ReportID=${hwReportId}, BufferLength=${hwReportLen}`);
        
        document.getElementById('status').innerText = "Status: Connected";
        document.getElementById('status').style.color = "#00d2ff";
        document.getElementById('connectBtn').style.display = 'none';
        refreshSummary();

    } catch (e) {
        console.error(e);
        alert(`Connection Failed: ${e.message}`);
    }
}

// 3. Handle Key Selection
export function handleKeySelection(idx) {
    activeKeyIndex = idx;
    
    document.querySelectorAll('.key').forEach(k => k.classList.remove('active'));
    document.getElementById(`v-${idx}`).classList.add('active');
    document.getElementById('editor-container').classList.remove('hidden');
    document.getElementById('editingLabel').innerText = `Editing Key ${idx + 1}`;
    
    // Load existing data
    const data = keyMetadata[idx] || { name: "", desc: "", shortcutText: "None" };
    document.getElementById('bind-name').value = data.name;
    document.getElementById('bind-desc').value = data.desc;
    document.getElementById('active-shortcut-display').innerText = data.shortcutText;
    
    // Reset payload
    currentPayload = { mod: 0, keyByte: 0 };
}

// 4. Recorder Logic
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
    if (!modal.classList.contains('hidden')) {
        e.preventDefault();
        
        // Calculate Modifier Byte (Bitmask)
        // Ctrl=1, Shift=2, Alt=4, Win=8
        tempMod = (e.ctrlKey ? 1 : 0) | (e.shiftKey ? 2 : 0) | (e.altKey ? 4 : 0) | (e.metaKey ? 8 : 0);
        
        const mods = [];
        if (e.ctrlKey) mods.push("Ctrl");
        if (e.shiftKey) mods.push("Shift");
        if (e.altKey) mods.push("Alt");
        if (e.metaKey) mods.push("Win");
        
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


// 5. Test Zone Logic
const testInput = document.getElementById('test-input');
const testOutput = document.getElementById('test-output');
if(testInput) {
    testInput.addEventListener('keydown', (e) => {
        e.preventDefault(); 
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
        testOutput.innerText = `Debug: Code=${e.code} | Ctrl=${e.ctrlKey}`;
        
        testInput.style.borderColor = "#00ff00";
        setTimeout(() => testInput.style.borderColor = "#555", 200);
    });
}

// 6. SAVE LOGIC (UPDATED FROM APP.JS)
export async function saveActiveBinding() {
    if (!device) return alert("Connect Keypad first!");
    
    // Check for fallback (F-Key dropdown)
    if (currentPayload.keyByte === 0) {
        const dropdownVal = parseInt(document.getElementById('fkey-selector').value);
        if (dropdownVal) currentPayload.keyByte = dropdownVal;
        else return alert("Please Record a shortcut first.");
    }

    // Create Buffer
    const report = new Uint8Array(hwReportLen).fill(0);
    
    // --- OFFICIAL PROTOCOL MAPPING ---
    // [0] Command: 0x03 (Write)
    // [1] KeyIndex: (0-8)
    // [2] Mode: 0x01 (Keyboard)  <-- CHANGED FROM 0x11
    // [3] Modifier: (1=Ctrl, 2=Shift, 4=Alt) <-- CHANGED FROM BYTE 5
    // [4] KeyCode: (HID Usage ID) <-- CHANGED FROM BYTE 6
    
    report[0] = 0x03; 
    report[1] = activeKeyIndex; 
    report[2] = 0x01; // Mode 1 = Standard Keyboard
    report[3] = currentPayload.mod; 
    report[4] = currentPayload.keyByte; 
    
    try {
        console.log(`Sending: [03, ${activeKeyIndex}, 01, ${currentPayload.mod}, ${currentPayload.keyByte}...]`);
        
        await device.sendReport(hwReportId, report);
        
        // Save Metadata
        const name = document.getElementById('bind-name').value;
        const desc = document.getElementById('bind-desc').value;
        const txt = document.getElementById('active-shortcut-display').innerText;
        keyMetadata[activeKeyIndex] = { name, desc, shortcutText: txt };
        localStorage.setItem('sayo_metadata', JSON.stringify(keyMetadata));
        
        refreshSummary();
        alert("Saved! Try testing it below.");
        
    } catch (e) {
        console.error(e);
        // Fallback: If ID 3 fails (common), try ID 0
        if (hwReportId !== 0) {
             console.warn("Retrying with Report ID 0...");
             try {
                await device.sendReport(0, report);
                alert("Saved (via Fallback)!");
                refreshSummary();
             } catch(err) {
                 alert("Write Failed: " + err.message);
             }
        } else {
            alert("Write Failed. Check console.");
        }
    }
}

export async function clearBinding() {
    if (!device) return alert("Connect Keypad first!");
    
    const report = new Uint8Array(hwReportLen).fill(0);
    report[0] = 0x03; 
    report[1] = activeKeyIndex;
    report[2] = 0x00; // Mode 0 = Disable
    
    try {
        await device.sendReport(hwReportId, report);
        delete keyMetadata[activeKeyIndex];
        localStorage.setItem('sayo_metadata', JSON.stringify(keyMetadata));
        
        document.getElementById('bind-name').value = "";
        document.getElementById('bind-desc').value = "";
        document.getElementById('active-shortcut-display').innerText = "None";
        refreshSummary();
        alert("Key Cleared!");
    } catch (e) {
        console.error(e);
        alert("Clear Failed.");
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
if(document.getElementById('clear-binding-btn')) {
    document.getElementById('clear-binding-btn').onclick = clearBinding;
}

document.querySelectorAll('.key').forEach(k => k.onclick = () => handleKeySelection(parseInt(k.dataset.idx)));

window.onload = refreshSummary;