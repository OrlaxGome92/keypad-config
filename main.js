/* main.js */
import { SCAN_CODES } from './utils.js';

let device;
let activeKeyIndex = null;
let keyMetadata = JSON.parse(localStorage.getItem('keypad_metadata')) || {};

// 1. Initialize Dropdown with All Codes (Media, Layers, Keys)
const fSelector = document.getElementById('fkey-selector');
fSelector.innerHTML = ''; 
Object.entries(SCAN_CODES).forEach(([keyName, byte]) => {
    fSelector.add(new Option(keyName, byte));
});

// ----------------------------------------
// LOGGING
// ----------------------------------------
function logToConsole(msg, type = 'info') {
    const consoleDiv = document.getElementById('console-log');
    if (!consoleDiv) return;
    const entry = document.createElement('div');
    entry.classList.add('log-entry', `log-${type}`);
    entry.innerText = `[${new Date().toLocaleTimeString().split(' ')[0]}] ${msg}`;
    consoleDiv.appendChild(entry);
    consoleDiv.scrollTop = consoleDiv.scrollHeight; 
}

// ----------------------------------------
// DIAGNOSTICS
// ----------------------------------------
async function runDiagnostics() {
    if (!device) return logToConsole("❌ No device connected.", "err");

    logToConsole("--- DIAGNOSTIC SCAN ---", "info");
    logToConsole(`Product: ${device.productName} (VID: 0x${device.vendorId.toString(16)})`, "info");
    
    let writableFound = false;
    device.collections.forEach((c, i) => {
        const type = (c.usagePage === 0xFF00) ? "✅ VENDOR (Config)" : 
                     (c.usagePage === 0x01)   ? "🔒 GENERIC (Keyboard)" : 
                     `❓ Unknown (0x${c.usagePage.toString(16)})`;
        
        logToConsole(`Coll #${i}: ${type}`, "info");
        
        // check if this collection supports Output Reports (Write)
        if (c.outputReports && c.outputReports.length > 0) {
            writableFound = true;
            logToConsole(`   > Writable Output Detected!`, 'tx');
        }
    });
    
    logToConsole("-----------------------", "info");

    if (!writableFound) {
        logToConsole("⚠️ READ-ONLY MODE DETECTED", "err");
        logToConsole("   Action: Unplug, Replug, and select the OTHER interface.", "err");
        alert("Read-Only Mode! You selected the 'Keyboard' interface. Disconnect and try the other 'Mini Keyboard' option.");
    } else {
        logToConsole("✅ Ready to Write.", "tx");
    }
}

// ----------------------------------------
// CONNECT (Targeting Config Interface 0xFF00)
// ----------------------------------------
export async function connectDevice() {
    try {
        // 1. Try to filter specifically for the Config Interface (Usage Page 0xFF00)
        // This forces the browser to request the specific writable interface.
        const filters = [
            { vendorId: 0x1189, usagePage: 0xFF00 }
        ];
        
        let devices;
        try {
            devices = await navigator.hid.requestDevice({ filters });
        } catch (e) {
            // Fallback if specific filter is not supported by browser/device
            console.warn("Specific filter failed, trying generic VID...", e);
            devices = await navigator.hid.requestDevice({ filters: [{ vendorId: 0x1189 }] });
        }
        
        device = devices[0];
        if (!device) return;
        
        if (!device.opened) await device.open();
        
        logToConsole(`Device Opened: ${device.productName}`, 'info');
        runDiagnostics();

        document.getElementById('status').innerText = "Status: Connected";
        document.getElementById('status').style.color = "#00d2ff";
        document.getElementById('connectBtn').style.display = 'none';
        refreshSummary();

    } catch (e) {
        console.error(e);
        logToConsole(`Connect Error: ${e.message}`, 'err');
    }
}

// ----------------------------------------
// SAVE (Mini Keyboard 0x1189 Protocol)
// ----------------------------------------
export async function saveActiveBinding() {
    if (!device) return alert("Connect Keypad first!");
    
    // Check if we are on a writable interface
    const writable = device.collections.some(c => c.outputReports && c.outputReports.length > 0);
    if (!writable) return alert("Read-Only Interface! Reconnect and choose the other device option.");

    const selectedByte = parseInt(fSelector.value);
    const reportId = 3; // Standard for this controller

    // --- ID MAPPING FIX ---
    // UI Index 12 (Right) -> Was 13, Now 14
    // UI Index 13 (Left)  -> Was 14, Now 13
    
    let targetId = activeKeyIndex + 1; // Default
    
    if (activeKeyIndex === 12) targetId = 14; // Swap Right to 14
    if (activeKeyIndex === 13) targetId = 13; // Swap Left to 13

    // --- STEP 1: CONSTRUCT KEY PACKET ---
    // Structure: [KeyIndex, 0x11, 0x01, 0x01, Modifiers, KeyCode, ...Padding]
    const packet = new Uint8Array(64).fill(0);
    
    // KeyIndex Mapping:
    // UI Index 0-5  -> Device ID 1-6 (Keys)
    // UI Index 12   -> Device ID 13 (Knob CW)
    // UI Index 13   -> Device ID 14 (Knob CCW)
    // UI Index 14   -> Device ID 15 (Knob Press)
    packet[0] = activeKeyIndex + 1; 
    
    packet[1] = 0x11;         // Command: Write
    packet[2] = 0x01;         // Fixed
    packet[3] = 0x01;         // Fixed
    packet[4] = 0x00;         // Modifiers (We map them as main keys in utils.js)
    packet[5] = selectedByte; // Key Code
    
    logToConsole(`1. Setting Key ID:${packet[0]} to [0x${selectedByte.toString(16).toUpperCase()}]...`, 'info');

    try {
        // Send Assignment
        await device.sendReport(reportId, packet);
        
        // --- STEP 2: SAVE TO EEPROM ---
        await new Promise(r => setTimeout(r, 100)); // Short delay
        
        const savePacket = new Uint8Array(64).fill(0);
        savePacket[0] = 0xAA; // Magic Byte 1
        savePacket[1] = 0xAA; // Magic Byte 2
        
        logToConsole(`2. Persisting (0xAA)...`, 'info');
        await device.sendReport(reportId, savePacket);
        
        logToConsole(`✅ Key Saved Successfully`, 'tx');
        
        keyMetadata[activeKeyIndex] = selectedByte;
        localStorage.setItem('keypad_metadata', JSON.stringify(keyMetadata));
        refreshSummary();
        showSuccess();
    } catch (e) { 
        logToConsole(`❌ Write Error: ${e.message}`, 'err'); 
    }
}

// UI HELPERS
export function handleKeySelection(idx) {
    activeKeyIndex = idx; 
    
    // Visual Selection Logic
    document.querySelectorAll('.key').forEach(k => k.classList.remove('active'));
    // Handle specific knob selectors
    const el = document.getElementById(`v-${idx}`);
    if(el) el.classList.add('active');
    
    document.getElementById('editor-container').classList.remove('hidden');
    
    // Dynamic Label
    let label = `Editing Key ${idx + 1}`;
    if (idx === 12) label = "Editing Knob Right (CW)";
    if (idx === 13) label = "Editing Knob Left (CCW)";
    if (idx === 14) label = "Editing Knob Press";
    
    document.getElementById('editingLabel').innerText = label;
    
    // Pre-select current value or default to 'a'
    fSelector.value = keyMetadata[idx] || 0x04;
}

function showSuccess() {
    const msg = document.getElementById('save-msg');
    msg.classList.add('show-success');
    setTimeout(() => msg.classList.remove('show-success'), 2000);
}

function refreshSummary() {
    const tbody = document.getElementById('summary-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    const entries = Object.entries(keyMetadata).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
    
    if(entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;">No keys programmed.</td></tr>';
        return;
    }
    
    const getName = (byte) => {
        for(let opt of fSelector.options) if(parseInt(opt.value) === byte) return opt.text;
        return `Byte 0x${byte.toString(16).toUpperCase()}`;
    };

    // Helper to format Key Names
    const getKeyLabel = (idx) => {
        const i = parseInt(idx);
        if (i === 12) return "Knob Right (CW)";
        if (i === 13) return "Knob Left (CCW)";
        if (i === 14) return "Knob Press";
        return `Key ${i + 1}`;
    };

    entries.forEach(([idx, byte]) => {
        tbody.innerHTML += `<tr><td>${getKeyLabel(idx)}</td><td><strong>${getName(byte)}</strong></td></tr>`;
    });
}

// INIT
document.getElementById('connectBtn').onclick = connectDevice;
document.getElementById('save-binding-btn').onclick = saveActiveBinding;

// Bind Click Events for Keys & Knobs
document.querySelectorAll('.key').forEach(k => {
    k.onclick = () => handleKeySelection(parseInt(k.dataset.idx));
});

document.getElementById('clearLogBtn').onclick = () => document.getElementById('console-log').innerHTML = '';
document.getElementById('diagnoseBtn').onclick = runDiagnostics;

// Optional Test Zone
const testZone = document.getElementById('key-test-zone');
if(testZone) testZone.addEventListener('keydown', (e) => {
    e.preventDefault();
    document.getElementById('last-key-display').innerText = e.code;
    document.getElementById('d-code').innerText = e.code;
    document.getElementById('d-key').innerText = e.key;
    document.getElementById('d-which').innerText = e.which;
    testZone.style.backgroundColor = '#333';
    setTimeout(() => testZone.style.backgroundColor = '#222', 100);
});

window.onload = refreshSummary;

