import { SCAN_CODES, MODIFIERS } from './utils.js';

let device;
let activeKeyIndex = null;
let isRecording = false;
let recordedMod = 0;
let recordedKey = 0;

// Local database to store Names and Descriptions
let keyMetadata = JSON.parse(localStorage.getItem('sayo_metadata')) || {};

/**
 * Hardware Connection Logic
 * Filters for the Vendor Interface to bypass NotAllowedError.
 */
export async function connectDevice() {
    try {
        const filters = [{ vendorId: 0x1189, productId: 0x8890 }];
        const devices = await navigator.hid.requestDevice({ filters });
        
        // Target Usage Page 0xFF00 (Vendor Defined)
        device = devices.find(d => 
            d.collections.some(c => c.usagePage === 0xFF00 || c.usagePage === 0xFF60)
        );

        if (!device) {
            alert("Keypad found, but configuration interface is blocked. Re-plug and select 'HID-compliant device'.");
            return;
        }

        await device.open();
        document.getElementById('status').innerText = "Status: Connected to " + device.productName;
        document.getElementById('connectBtn').style.display = 'none';
    } catch (e) {
        alert("Connection failed. Ensure you are using HTTPS.");
    }
}

/**
 * CRUD: Handle Key Selection
 * Opens the sidebar and loads existing metadata.
 */
export function handleKeySelection(idx) {
    activeKeyIndex = idx;
    isRecording = false;
    
    // UI Feedback
    document.querySelectorAll('.key').forEach(k => k.classList.remove('active'));
    document.getElementById(`v-${idx}`).classList.add('active');
    document.getElementById('editor-container').classList.remove('hidden');
    document.getElementById('binding-form').classList.add('hidden');
    
    const label = idx === 6 ? "Knob" : `Key ${idx + 1}`;
    document.getElementById('editingLabel').innerText = label;

    // Load existing metadata if available
    const data = keyMetadata[idx] || { name: "", desc: "" };
    document.getElementById('bind-name').value = data.name;
    document.getElementById('bind-desc').value = data.desc;
}

/**
 * CRUD: New Binding (Record Mode)
 * Starts listening for physical keystrokes.
 */
export function startNewBinding() {
    isRecording = true;
    recordedMod = 0;
    recordedKey = 0;
    
    document.getElementById('binding-form').classList.remove('hidden');
    const recorder = document.getElementById('shortcut-recorder');
    recorder.innerText = "Listening... Press keys now";
    recorder.style.borderColor = "var(--primary)";
}

/**
 * Keyboard Listener for Recording
 */
window.addEventListener('keydown', (e) => {
    if (!isRecording) return;
    
    // Prevent browser default actions (like Ctrl+S saving the page)
    e.preventDefault();

    // Calculate HID Modifiers
    recordedMod = (e.ctrlKey ? 0x01 : 0) | (e.shiftKey ? 0x02 : 0) | (e.altKey ? 0x04 : 0) | (e.metaKey ? 0x08 : 0);
    
    // Map to HID Scan Code from utils.js
    const keyLookup = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    recordedKey = SCAN_CODES[keyLookup] || 0;

    const modText = (e.ctrlKey ? 'Ctrl+' : '') + (e.shiftKey ? 'Shift+' : '') + (e.altKey ? 'Alt+' : '');
    document.getElementById('shortcut-recorder').innerText = `${modText}${e.key}`;
});

/**
 * CRUD: Save / Update
 * Sends data to hardware and saves metadata to LocalStorage.
 */
export async function saveActiveBinding() {
    if (!device) return alert("Connect Keypad first!");

    const name = document.getElementById('bind-name').value;
    const desc = document.getElementById('bind-desc').value;

    // Sayo 64-byte protocol
    const report = new Uint8Array(64);
    report[0] = 0x03; 
    report[1] = activeKeyIndex; 
    report[2] = 0x11; 
    report[3] = 0x01; 
    report[4] = 0x01; 
    report[5] = recordedMod;
    report[6] = recordedKey;

    try {
        await device.sendReport(0, report);
        
        // Save metadata locally
        keyMetadata[activeKeyIndex] = { name, desc, mod: recordedMod, key: recordedKey };
        localStorage.setItem('sayo_metadata', JSON.stringify(keyMetadata));
        
        isRecording = false;
        alert("Keypad updated successfully!");
    } catch (e) {
        alert("Write failed: " + e.message);
    }
}

/**
 * CRUD: Delete
 * Wipes the key by sending 0x00 (None).
 */
export async function deleteBinding() {
    if (!confirm("Clear this key's configuration?")) return;
    
    recordedMod = 0;
    recordedKey = 0;
    document.getElementById('bind-name').value = "";
    document.getElementById('bind-desc').value = "";
    
    await saveActiveBinding();
    delete keyMetadata[activeKeyIndex];
    localStorage.setItem('sayo_metadata', JSON.stringify(keyMetadata));
}

// Global Bindings to resolve Export Conflict
window.connectDevice = connectDevice;
window.handleKeySelection = handleKeySelection;
window.startNewBinding = startNewBinding;
window.saveActiveBinding = saveActiveBinding;
window.deleteBinding = deleteBinding;