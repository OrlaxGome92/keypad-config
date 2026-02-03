import { SCAN_CODES, MODIFIERS } from './utils.js';

let device;
let activeIndex = 0;
let layers = JSON.parse(localStorage.getItem('sayo_layers')) || [{ name: "Base", bindings: {} }];
let currentLayer = 0;

// --- HARDWARE CONNECT ---
document.getElementById('connectBtn').onclick = async () => {
    try {
        const filters = [{ vendorId: 0x1189, productId: 0x8890 }];
        const devices = await navigator.hid.requestDevice({ filters });
        // Target the Vendor-Defined interface to bypass browser blocks
        device = devices.find(d => d.collections.some(c => c.usagePage === 0xFF00)) || devices[0];
        await device.open();
        document.getElementById('status').innerText = "Hardware Connected";
    } catch (e) { alert("HID Error: Use HTTPS and select the correct interface."); }
};

// --- MACRO EXECUTION ENGINE ---
// Replicates your Python _run_composed_macro logic
async function runSoftwareMacro(steps) {
    for (const step of steps) {
        if (step.type === 'delay') {
            await new Promise(r => setTimeout(r, step.value * 1000));
        } else if (step.type === 'text') {
            console.log("Typing: " + step.value); // Web can't 'type' into other apps easily
        } else if (step.type === 'url') {
            window.open(step.value, '_blank');
        }
    }
}

// --- SYNC TO HARDWARE ---
document.getElementById('saveBtn').onclick = async () => {
    if (!device) return alert("Connect Keypad First");
    
    const mod = MODIFIERS[document.getElementById('modSelect').value];
    const key = SCAN_CODES[document.getElementById('keySelect').value];

    const report = new Uint8Array(64);
    report[0] = 0x03; // Write command for 1189:8890
    report[1] = activeIndex; 
    report[2] = 0x11; // Static Mode
    report[3] = 0x01; // Hardware Layer
    report[4] = 0x01; // Enable
    report[5] = mod;
    report[6] = key;

    try {
        await device.sendReport(0, report);
        alert("Hardware Key Updated!");
    } catch (e) { alert("NotAllowedError: Re-plug device and select the 2nd/3rd interface option."); }
};

// --- KEYBOARD LISTENER (Layer Switching) ---
// Replicates your 'handle_trigger' logic for F13-F24
window.addEventListener('keydown', (e) => {
    if (e.key === 'F24') { // Cycle Layer Up
        currentLayer = (currentLayer + 1) % layers.length;
        updateUI();
    }
});