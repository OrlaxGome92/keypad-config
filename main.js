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
        fSelector.add(new Option(keyName, byte)); // Value is the Byte directly
    }
});

// EVENT: Dropdown Changed manually
fSelector.addEventListener('change', (e) => {
    // If user picks from dropdown, set that as the key
    currentPayload.keyByte = parseInt(e.target.value);
    currentPayload.mod = 0; // Reset modifiers for pure F-key
    
    // Update UI to reflect manual choice
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
 * 3. Handle Key Selection (Clicking a visual key)
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
    
    // Reset payload to 0 until they record/select something new
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
    tempKeyByte = 0; // Reset temp
    tempText = "Listening...";
    recorderDisplay.innerText = tempText;
}

window.addEventListener('keydown', (e) => {
    if (modal.classList.contains('hidden')) return;
    e.preventDefault();

    // 1. Calculate Modifiers
    tempMod = (e.ctrlKey ? 0x01 : 0) | (e.shiftKey ? 0x02 : 0) | (e.altKey ? 0x04 : 0);
    
    const mods = [];
    if (e.ctrlKey) mods.push("Ctrl");
    if (e.shiftKey) mods.push("Shift");
    if (e.altKey) mods.push("Alt");
    
    // 2. Identify the Main Key (if it's not a modifier)
    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        // Look up the mapping in utils.js
        const code = SCAN_CODES[e.code];
        
        if (code) {
            tempKeyByte = code; // Success: Found the HEX code for this key
            const keyLabel = e.key.length === 1 ? e.key.toUpperCase() : e.key;
            tempText = (mods.length > 0 ? mods.join('+') + '+' : '') + keyLabel;
            
            recorderDisplay.innerText = tempText;
            recorderDisplay.style.color = "#00d2ff";
        } else {
            recorderDisplay.innerText = "Unknown Key: " + e.code;
            recorderDisplay.style.color = "orange";
        }
    } else {
        // Just modifiers displayed so far
        recorderDisplay.innerText = mods.join('+') + "...";
    }
});

document.getElementById('modal-save').onclick = () => {
    // Commit temp recording to the actual payload
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
 * 5. Save To Hardware
 */
export async function saveActiveBinding() {
    if (!device) return alert("Connect Keypad first!");
    
    // Validation: Did we actually select/record a key?
    // If the byte is 0, check if the dropdown has a fallback
    if (currentPayload.keyByte === 0) {
        const dropdownVal = parseInt(document.getElementById('fkey-selector').value);
        if (dropdownVal) {
             currentPayload.keyByte = dropdownVal;
        } else {
             return alert("Please select an F-Key or Record a shortcut first.");
        }
    }

    const report = new Uint8Array(hwReportLen).fill(0);
    report[0] = 0x03;             // Command
    report[1] = activeKeyIndex;   // Key Index
    report[2] = 0x11;             // Type: HID
    report[3] = 0x01;             // Mod 1
    report[4] = 0x01;             // Mod 2
    report[5] = currentPayload.mod;     // The Modifiers (Ctrl/Shift)
    report[6] = currentPayload.keyByte; // The Actual Key (C, V, or F13)

    try {
        console.log(`Writing: KeyIdx=${activeKeyIndex} Mod=${report[5]} Code=${report[6]}`);
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