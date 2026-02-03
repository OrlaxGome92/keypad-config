/* main.js */
import { SCAN_CODES, MODIFIERS } from './utils.js';

let device;
let activeKeyIndex = null;
let currentPayload = { mod: 0, keyByte: 0 };

// Variables for Recorder
let tempMod = 0;
let tempKeyByte = 0;
let tempText = "";

// Device Hardware Info
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

// EVENT: Dropdown Changed manually
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
        
        // --- SMART DETECT ---
        const configCollection = device.collections.find(c => c.usagePage === 0xFF00 || c.usagePage === 0xFF60);
        if (configCollection?.outputReports?.length > 0) {
            hwReportId = configCollection.outputReports[0].reportId;
            if (configCollection.outputReports[0].items?.length > 0) {
                const item = configCollection.outputReports[0].items[0];
                hwReportLen = (item.reportCount * item.reportSize) / 8;
            }
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

// 3. Handle Key Selection
export function handleKeySelection(idx) {
    activeKeyIndex = idx; // idx is 0-based from the HTML (0 for K1, 1 for K2...)
    
    // UI Highlight
    document.querySelectorAll('.key').forEach(k => k.classList.remove('active'));
    document.getElementById(`v-${idx}`).classList.add('active');
    document.getElementById('editor-container').classList.remove('hidden');
    document.getElementById('editingLabel').innerText = `Editing Key ${idx + 1}`;
    
    // Calculate Defaults
    const defaultFKeyByte = 0x68 + idx; // F13 + idx
    const defaultFKeyName = `F${13 + idx}`;

    // Load Data
    const data = keyMetadata[idx] || { 
        name: "", 
        desc: "", 
        shortcutText: defaultFKeyName, 
        savedByte: defaultFKeyByte 
    };
    
    // Fill Fields
    document.getElementById('bind-name').value = data.name;
    document.getElementById('bind-desc').value = data.desc;
    document.getElementById('active-shortcut-display').innerText = data.shortcutText;

    // Restore Dropdown State
    if (data.savedByte && SCAN_CODES[data.shortcutText] === data.savedByte) {
         fSelector.value = data.savedByte;
    } else {
         // If current binding is a complex shortcut (Ctrl+C), reset dropdown to default F-key
         fSelector.value = defaultFKeyByte;
    }

    // Reset current payload
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
        
        // Modifiers Bitmask (1=Ctrl, 2=Shift, 4=Alt, 8=Win)
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
        if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) keyPart = e.key.length === 1 ? e.key.toUpperCase() : e.key;
        testInput.value = (mods.length > 0 ? mods.join(" + ") + " + " : "") + keyPart;
        testOutput.innerText = `Debug: Code=${e.code} | Ctrl=${e.ctrlKey}`;
        testInput.style.borderColor = "#00ff00";
        setTimeout(() => testInput.style.borderColor = "#555", 200);
    });
}

// 6. SAVE (CORRECTED PROTOCOL)
export async function saveActiveBinding() {
    if (!device) return alert("Connect Keypad first!");
    
    // Determine what to write: Recording OR Dropdown
    let finalKey = currentPayload.keyByte;
    let finalMod = currentPayload.mod;
    
    // If no new recording, use the dropdown value
    if (finalKey === 0) {
        finalKey = parseInt(document.getElementById('fkey-selector').value);
        finalMod = 0; // F-Keys usually have no modifiers
    }
    
    if (!finalKey) return alert("Error: Invalid Key Selection.");

    const report = new Uint8Array(hwReportLen).fill(0);
    
    // --- PROTOCOL FIX ---
    // Mode 0x01 (Keyboard)
    // Byte 1: Key Index (1-BASED! activeKeyIndex + 1)
    // Byte 3: Key Code (e.g., C)
    // Byte 4: Modifier (e.g., Ctrl)
    
    report[0] = 0x03;               // Command
    report[1] = activeKeyIndex + 1; // Index (1-based: K1=1, K2=2)
    report[2] = 0x01;               // Mode 1: Keyboard
    report[3] = finalKey;           // Byte 3: KEY CODE (Was swapped before)
    report[4] = finalMod;           // Byte 4: MODIFIER (Was swapped before)
    
    try {
        console.log(`Sending: [03, Idx:${report[1]}, Mode:01, Key:${report[3]}, Mod:${report[4]}]`);
        await device.sendReport(hwReportId, report);
        
        // Save Metadata
        const name = document.getElementById('bind-name').value;
        const desc = document.getElementById('bind-desc').value;
        const txt = document.getElementById('active-shortcut-display').innerText;
        
        keyMetadata[activeKeyIndex] = { 
            name, 
            desc, 
            shortcutText: txt, 
            savedByte: finalKey 
        };
        localStorage.setItem('sayo_metadata', JSON.stringify(keyMetadata));
        
        refreshSummary();
        alert("Saved! Test it below.");
        
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
    report[1] = activeKeyIndex + 1; // 1-based index
    report[2] = 0x00; // Mode 0 = Disable
    
    try {
        await device.sendReport(hwReportId, report);
        delete keyMetadata[activeKeyIndex];
        localStorage.setItem('sayo_metadata', JSON.stringify(keyMetadata));
        
        document.getElementById('bind-name').value = "";
        document.getElementById('active-shortcut-display').innerText = "None";
        refreshSummary();
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
if(document.getElementById('clear-binding-btn')) document.getElementById('clear-binding-btn').onclick = clearBinding;
document.querySelectorAll('.key').forEach(k => k.onclick = () => handleKeySelection(parseInt(k.dataset.idx)));

window.onload = refreshSummary;