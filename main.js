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
    // F13-F24 Only
    if (keyName.startsWith('F') && parseInt(keyName.substring(1)) >= 13) {
        fSelector.add(new Option(keyName, byte));
    }
});

// EVENT: Dropdown Changed manually
fSelector.addEventListener('change', (e) => {
    // Update the payload immediately so if they click Save it uses this
    currentPayload.keyByte = parseInt(e.target.value);
    currentPayload.mod = 0; 
    
    // Update visual text to match the F-Key name
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
        
        // --- SMART DETECT ---
        const configCollection = device.collections.find(c => c.usagePage === 0xFF00 || c.usagePage === 0xFF60);
        if (configCollection?.outputReports?.length > 0) {
            hwReportId = configCollection.outputReports[0].reportId;
            if (configCollection.outputReports[0].items?.length > 0) {
                const item = configCollection.outputReports[0].items[0];
                hwReportLen = (item.reportCount * item.reportSize) / 8;
            }
        } else {
            hwReportId = 0; // Fallback
        }
        
        console.log(`Connected. ReportID=${hwReportId}, BufferLen=${hwReportLen}`);
        
        document.getElementById('status').innerText = "Status: Connected";
        document.getElementById('status').style.color = "#00d2ff";
        document.getElementById('connectBtn').style.display = 'none';
        refreshSummary();

    } catch (e) {
        console.error(e);
        alert(`Connection Failed: ${e.message}`);
    }
}

// 3. Handle Key Selection (FIXED: Loads Saved F-Key)
export function handleKeySelection(idx) {
    activeKeyIndex = idx;
    
    // UI Highlight
    document.querySelectorAll('.key').forEach(k => k.classList.remove('active'));
    document.getElementById(`v-${idx}`).classList.add('active');
    document.getElementById('editor-container').classList.remove('hidden');
    document.getElementById('editingLabel').innerText = `Editing Key ${idx + 1}`;
    
    // Calculate Default F-Key if none saved (K1=F13, K2=F14...)
    // Note: F13 starts at 0x68 (104). 
    // We can just grab the Byte from utils logic or calculate it.
    // F13=0x68, F14=0x69. So Default = 0x68 + idx.
    const defaultFKeyByte = 0x68 + idx;
    const defaultFKeyName = `F${13 + idx}`;

    // Load Data
    const data = keyMetadata[idx] || { 
        name: "", 
        desc: "", 
        shortcutText: defaultFKeyName, // Default text
        savedByte: defaultFKeyByte     // Default hardware trigger
    };
    
    // Fill Fields
    document.getElementById('bind-name').value = data.name;
    document.getElementById('bind-desc').value = data.desc;
    document.getElementById('active-shortcut-display').innerText = data.shortcutText;

    // --- CRITICAL FIX: Update Dropdown to match saved data ---
    // If we have a saved byte, set the dropdown to it. 
    // If not, try to set it to the calculated default.
    if (data.savedByte) {
        fSelector.value = data.savedByte;
    } else {
        // Safe fallback if logic fails
        fSelector.value = SCAN_CODES["F13"]; 
    }

    // Reset current payload so we don't carry over old clicks
    currentPayload = { mod: 0, keyByte: 0 };
}

// 4. Recorder
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
        
        // Modifiers
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

// 5. Test Zone
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
        testOutput.innerText = `Debug: Code=${e.code} | Ctrl=${e.ctrlKey} | Shift=${e.shiftKey}`;
        
        testInput.style.borderColor = "#00ff00";
        setTimeout(() => testInput.style.borderColor = "#555", 200);
    });
}

// 6. SAVE (V3 COMBO PROTOCOL)
export async function saveActiveBinding() {
    if (!device) return alert("Connect Keypad first!");
    
    // Logic: If user didn't record a shortcut, use the dropdown value
    let finalKeyByte = currentPayload.keyByte;
    
    // If keyByte is 0, it means the user didn't record a new combo OR change the dropdown manually THIS session.
    // We must grab the current value of the dropdown.
    if (finalKeyByte === 0) {
        finalKeyByte = parseInt(document.getElementById('fkey-selector').value);
    }
    
    if (!finalKeyByte) return alert("Error: Invalid Key Selection.");

    const report = new Uint8Array(hwReportLen).fill(0);
    
    // [0] Cmd, [1] Index, [2] Mode=0x11, [3] ModMask, [4] 0, [5] 0, [6] KeyCode
    report[0] = 0x03; 
    report[1] = activeKeyIndex; 
    report[2] = 0x11; 
    report[3] = currentPayload.mod; 
    report[4] = 0x00; 
    report[5] = 0x00; 
    report[6] = finalKeyByte; 
    
    try {
        console.log(`Sending: [03, ${activeKeyIndex}, 11, ${currentPayload.mod}, 0, 0, ${finalKeyByte}]`);
        await device.sendReport(hwReportId, report);
        
        // Save Metadata (FIXED: SAVING THE F-KEY BYTE)
        const name = document.getElementById('bind-name').value;
        const desc = document.getElementById('bind-desc').value;
        const txt = document.getElementById('active-shortcut-display').innerText;
        
        // We save 'savedByte' using the dropdown value so we can restore it later
        // Note: If the user recorded a combo (like Ctrl+C), 'finalKeyByte' is 'C' (0x06).
        // If they just picked F13, 'finalKeyByte' is 0x68.
        // We probably want to save specifically the hardware trigger preference separate from the combo?
        // Actually, for this specific request, the user wants to ensure the Dropdown (Internal F-Key) is unique.
        // But in this logic, the Dropdown IS the key sent to the device if no combo is recorded.
        // Let's rely on the dropdown's current value for restoration.
        const currentDropdownValue = parseInt(document.getElementById('fkey-selector').value);

        keyMetadata[activeKeyIndex] = { 
            name, 
            desc, 
            shortcutText: txt, 
            savedByte: currentDropdownValue // Persist the dropdown state
        };
        
        localStorage.setItem('sayo_metadata', JSON.stringify(keyMetadata));
        
        refreshSummary();
        alert("Saved!");
        
    } catch (e) {
        console.error(e);
        alert("Write Failed.");
    }
}

// 7. CLEAR
export async function clearBinding() {
    if (!device) return alert("Connect Keypad first!");
    const report = new Uint8Array(hwReportLen).fill(0);
    report[0] = 0x03; 
    report[1] = activeKeyIndex;
    report[2] = 0x00;
    
    try {
        await device.sendReport(hwReportId, report);
        delete keyMetadata[activeKeyIndex];
        localStorage.setItem('sayo_metadata', JSON.stringify(keyMetadata));
        refreshSummary();
        // Reset UI defaults
        document.getElementById('bind-name').value = "";
        document.getElementById('active-shortcut-display').innerText = `F${13 + activeKeyIndex}`;
        document.getElementById('fkey-selector').value = SCAN_CODES[`F${13 + activeKeyIndex}`];
        alert("Key Cleared!");
    } catch (e) { console.error(e); }
}

function refreshSummary() {
    const tbody = document.getElementById('summary-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    const entries = Object.entries(keyMetadata).sort((a, b) => a[0] - b[0]);
    if(entries.length === 0) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No keys programmed.</td></tr>';
    
    entries.forEach(([idx, data]) => {
        // Look up the readable name of the Saved Byte (e.g. 0x68 -> "F13")
        let hwLabel = "Unknown";
        const savedVal = data.savedByte;
        const entry = Object.entries(SCAN_CODES).find(([k, v]) => v === savedVal);
        if(entry) hwLabel = entry[0];

        tbody.innerHTML += `<tr>
            <td>Key ${parseInt(idx) + 1}</td>
            <td><strong>${data.name}</strong></td>
            <td><code>${data.shortcutText}</code> <span style="font-size:0.8em; color:#666">(${hwLabel})</span></td>
            <td style="color:#aaa;">${data.desc}</td>
        </tr>`;
    });
}

// Bindings
document.getElementById('connectBtn').onclick = connectDevice;
document.getElementById('btn-record-popup').onclick = openRecordModal;
document.getElementById('save-binding-btn').onclick = saveActiveBinding;
if(document.getElementById('clear-binding-btn')) document.getElementById('clear-binding-btn').onclick = clearBinding;
document.querySelectorAll('.key').forEach(k => k.onclick = () => handleKeySelection(parseInt(k.dataset.idx)));

window.onload = refreshSummary;