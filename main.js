import { SCAN_CODES, MODIFIERS } from './utils.js';

let device;
let activeKeyIndex = null;
let tempMod = 0;
let tempKey = 0;
let tempText = "";

// Metadata storage for the summary table
let keyMetadata = JSON.parse(localStorage.getItem('sayo_metadata')) || {};

// Initialize the F-Key Dropdown
const fSelector = document.getElementById('fkey-selector');
Object.keys(SCAN_CODES).forEach(f => {
    if(f.startsWith('F')) fSelector.add(new Option(f, f));
});

/**
 * 1. Hardware Connection
 * Specifically filters for the Vendor interface to bypass the NotAllowedError.
 */
export async function connectDevice() {
    try {
        const filters = [{ vendorId: 0x1189, productId: 0x8890 }];
        const devices = await navigator.hid.requestDevice({ filters });
        
        // Target Usage Page 0xFF00 (Vendor Defined) to avoid restricted keyboard interface
        device = devices.find(d => 
            d.collections.some(c => c.usagePage === 0xFF00 || c.usagePage === 0xFF60)
        );

        if (!device) {
            alert("Security Error: Please select the entry that is NOT the keyboard (Interface 2).");
            return;
        }

        await device.open();
        document.getElementById('status').innerText = "Status: Connected";
        document.getElementById('connectBtn').style.display = 'none';
        refreshSummary();
    } catch (e) {
        alert("Connection failed. Ensure you are using HTTPS and selected the correct interface.");
    }
}

/**
 * 2. Key Selection
 * Loads existing metadata and automatically syncs the F-key dropdown.
 */
export function handleKeySelection(idx) {
    activeKeyIndex = idx;
    document.querySelectorAll('.key').forEach(k => k.classList.remove('active'));
    document.getElementById(`v-${idx}`).classList.add('active');
    document.getElementById('editor-container').classList.remove('hidden');
    
    // Load existing metadata
    const data = keyMetadata[idx] || { name: "", desc: "", shortcutText: "No shortcut recorded", fKey: `F${13 + idx}` };
    document.getElementById('bind-name').value = data.name;
    document.getElementById('bind-desc').value = data.desc;
    document.getElementById('active-shortcut-display').innerText = data.shortcutText;
    
    // Sync the F-Key dropdown to the saved value or the default offset
    document.getElementById('fkey-selector').value = data.fKey;
}

/**
 * 3. Modal Recording Logic
 */
const modal = document.getElementById('record-modal');
const recorderDisplay = document.getElementById('modal-recorder-display');

export function openRecordModal() {
    modal.classList.remove('hidden');
    tempMod = 0;
    tempText = "Listening...";
    recorderDisplay.innerText = tempText;
}

window.addEventListener('keydown', (e) => {
    if (modal.classList.contains('hidden')) return;
    e.preventDefault();

    // Capture Modifiers
    tempMod = (e.ctrlKey ? 0x01 : 0) | (e.shiftKey ? 0x02 : 0) | (e.altKey ? 0x04 : 0);
    
    // Display human-readable text
    const mods = [];
    if (e.ctrlKey) mods.push("Ctrl");
    if (e.shiftKey) mods.push("Shift");
    if (e.altKey) mods.push("Alt");
    
    tempText = (mods.length > 0 ? mods.join('+') + '+' : '') + e.key.toUpperCase();
    recorderDisplay.innerText = tempText;
});

document.getElementById('modal-save').onclick = () => {
    document.getElementById('active-shortcut-display').innerText = tempText;
    modal.classList.add('hidden');
};

document.getElementById('modal-reset').onclick = () => {
    tempMod = 0;
    tempText = "Listening...";
    recorderDisplay.innerText = tempText;
};

document.getElementById('modal-cancel').onclick = () => modal.classList.add('hidden');

/**
 * 4. Save to Hardware with Report ID Fallback
 */
export async function saveActiveBinding() {
    if (!device) return alert("Connect Keypad first!");

    const fKeyName = document.getElementById('fkey-selector').value;
    const hardwareKeyByte = SCAN_CODES[fKeyName];
    const name = document.getElementById('bind-name').value;
    const desc = document.getElementById('bind-desc').value;
    const shortcutText = document.getElementById('active-shortcut-display').innerText;

    const report = new Uint8Array(64);
    report[0] = 0x03; 
    report[1] = activeKeyIndex; 
    report[2] = 0x11; 
    report[3] = 0x01; 
    report[4] = 0x01; 
    report[5] = tempMod;
    report[6] = hardwareKeyByte;

    try {
        await device.sendReport(0, report);
        finalize(name, desc, shortcutText, fKeyName);
    } catch (e) {
        try {
            // Force Fallback to Report ID 1
            await device.sendReport(1, report.slice(1));
            finalize(name, desc, shortcutText, fKeyName);
        } catch (err) {
            alert("Write Failed: Ensure you selected the non-keyboard interface (Interface 2).");
        }
    }
}

function finalize(name, desc, shortcutText, fKeyName) {
    keyMetadata[activeKeyIndex] = { name, desc, shortcutText, fKey: fKeyName };
    localStorage.setItem('sayo_metadata', JSON.stringify(keyMetadata));
    alert("Hardware programmed successfully!");
    refreshSummary();
}

/**
 * 5. Summary Table Refresh
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
            <td>${data.name}</td>
            <td>${data.shortcutText}</td>
            <td>${data.desc}</td>
        </tr>`;
        tbody.innerHTML += row;
    });
}

// Global Bindings
window.connectDevice = connectDevice;
window.handleKeySelection = handleKeySelection;
window.startNewBinding = openRecordModal;
window.saveActiveBinding = saveActiveBinding;

document.getElementById('connectBtn').onclick = connectDevice;
document.getElementById('btn-record-popup').onclick = openRecordModal;
document.getElementById('save-binding-btn').onclick = saveActiveBinding;
window.onload = refreshSummary;