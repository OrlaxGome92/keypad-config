import { SCAN_CODES, MODIFIERS } from './utils.js';

let device;
let activeKeyIndex = null;
let isRecording = false;
let recordedMod = 0;
let recordedKey = 0;

// Local database to store Names, Descriptions, and Shortcut Text
let keyMetadata = JSON.parse(localStorage.getItem('sayo_metadata')) || {};

/**
 * Hardware Connection Logic
 * Filters for the Vendor Interface to bypass NotAllowedError.
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
            alert("Keypad found, but configuration interface is blocked. Re-plug and select 'HID-compliant device' (Interface 2).");
            return;
        }

        await device.open();
        document.getElementById('status').innerText = "Status: Connected to " + device.productName;
        document.getElementById('connectBtn').style.display = 'none';
    } catch (e) {
        alert("Connection failed. Ensure you are using HTTPS and selected the correct interface.");
    }
}

/**
 * CRUD: Handle Key Selection
 * Opens the sidebar and loads existing metadata.
 */
export function handleKeySelection(idx) {
    activeKeyIndex = idx;
    isRecording = false;
    
    document.querySelectorAll('.key').forEach(k => k.classList.remove('active'));
    document.getElementById(`v-${idx}`).classList.add('active');
    document.getElementById('editor-container').classList.remove('hidden');
    document.getElementById('binding-form').classList.add('hidden');
    
    const label = idx === 6 ? "Knob" : `Key ${idx + 1}`;
    document.getElementById('editingLabel').innerText = label;

    // Load existing metadata if available
    const data = keyMetadata[idx] || { name: "", desc: "", shortcutText: "Click 'New' to record" };
    document.getElementById('bind-name').value = data.name;
    document.getElementById('bind-desc').value = data.desc;
    document.getElementById('shortcut-recorder').innerText = data.shortcutText;
}

/**
 * CRUD: New Binding (Record Mode)
 */
export function startNewBinding() {
    isRecording = true;
    recordedMod = 0;
    recordedKey = 0;
    
    document.getElementById('binding-form').classList.remove('hidden');
    const recorder = document.getElementById('shortcut-recorder');
    recorder.innerText = "Listening... Press keys now";
}

/**
 * Keyboard Listener for Recording
 * Maps physical presses to internal F13-F24 range (0x68-0x73)
 */
window.addEventListener('keydown', (e) => {
    if (!isRecording) return;
    e.preventDefault();

    // Calculate HID Modifiers
    recordedMod = (e.ctrlKey ? 0x01 : 0) | (e.shiftKey ? 0x02 : 0) | (e.altKey ? 0x04 : 0);
    
    // Hardcode to F13-F24 based on the physical button index
    recordedKey = 0x68 + activeKeyIndex; 

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
    const shortcutText = document.getElementById('shortcut-recorder').innerText;

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
        // Attempt write on Report ID 0
        await device.sendReport(0, report);
        finalizeSave(name, desc, shortcutText);
    } catch (e) {
        // Fallback: Force Report ID 1 (Fixes NotAllowedError on some firmware)
        try {
            await device.sendReport(1, report.slice(1));
            finalizeSave(name, desc, shortcutText);
        } catch (err) {
            alert("Error: NotAllowedError. Ensure you selected 'HID-compliant device' and NOT 'Keyboard'.");
        }
    }
}

function finalizeSave(name, desc, shortcutText) {
    // Save metadata locally for the Summary Table
    keyMetadata[activeKeyIndex] = { name, desc, shortcutText, mod: recordedMod, key: recordedKey };
    localStorage.setItem('sayo_metadata', JSON.stringify(keyMetadata));
    
    isRecording = false;
    alert(`Success! Hardware programmed to F${13 + activeKeyIndex}`);
}

/**
 * CRUD: Delete
 */
export async function deleteBinding() {
    if (!confirm("Clear this key?")) return;
    
    recordedMod = 0;
    recordedKey = 0;
    
    await saveActiveBinding();
    delete keyMetadata[activeKeyIndex];
    localStorage.setItem('sayo_metadata', JSON.stringify(keyMetadata));
    location.reload(); // Refresh to update table
}

// Global Bindings for index.html
window.connectDevice = connectDevice;
window.handleKeySelection = handleKeySelection;
window.startNewBinding = startNewBinding;
window.saveActiveBinding = saveActiveBinding;
window.deleteBinding = deleteBinding;