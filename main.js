/* main.js - Final Solved Mapping (15-16-17) */
import { SCAN_CODES } from './utils.js';

let device;
let activeKeyIndex = null;
let keyMetadata = JSON.parse(localStorage.getItem('keypad_metadata')) || {};

// 1. Initialize Dropdown with All Codes
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
        
        if (c.outputReports && c.outputReports.length > 0) {
            writableFound = true;
            logToConsole(`   > Writable Output Detected!`, 'tx');
        }
    });
    
    logToConsole("-----------------------", "info");

    if (!writableFound) {
        logToConsole("⚠️ READ-ONLY MODE DETECTED", "err");
        alert("Read-Only Mode! Reconnect and select the other interface option.");
    } else {
        logToConsole("✅ Ready to Write.", "tx");
    }
}

// ----------------------------------------
// CONNECT
// ----------------------------------------
export async function connectDevice() {
    try {
        const filters = [{ vendorId: 0x1189, usagePage: 0xFF00 }];
        let devices;
        try {
            devices = await navigator.hid.requestDevice({ filters });
        } catch (e) {
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
// SAVE (Solved: Left=15, Center=16, Right=17)
// ----------------------------------------
export async function saveActiveBinding() {
    if (!device) return alert("Connect Keypad first!");
    
    const writable = device.collections.some(c => c.outputReports && c.outputReports.length > 0);
    if (!writable) return alert("Read-Only Interface! Reconnect and choose the other device option.");

    const selectedByte = parseInt(fSelector.value);
    const reportId = 3; 

    // --- TARGET ID LOGIC ---
    let targetId;
    
    // 1. CHECK DEBUG OVERRIDE
    const debugIdInput = document.getElementById('debug-target-id');
    if (debugIdInput && debugIdInput.value) {
        targetId = parseInt(debugIdInput.value);
        logToConsole(`⚠️ DEBUG: Overriding Target ID to ${targetId}`, 'info');
    } else {
        // 2. USE FINAL SOLVED MAPPING
        // Based on user logs:
        // ID 15 written with F24 -> Result: Left Knob is F24. (Left = 15)
        // ID 16 written with F23 -> Result: Center Knob is F23. (Center = 16)
        // ID 17 (Previous) -> Result: Right Knob is F24. (Right = 17)
        
        if (activeKeyIndex >= 12) {
            // It's a Knob
            if (activeKeyIndex === 12) targetId = 17; // UI: Right (CW)
            if (activeKeyIndex === 13) targetId = 15; // UI: Left (CCW)
            if (activeKeyIndex === 14) targetId = 18; // UI: Press
            
            logToConsole(`Mapping UI Knob Idx ${activeKeyIndex} -> Device ID ${targetId}`, 'info');
        } else {
            // It's a Key (0-5) -> ID (1-6)
            targetId = activeKeyIndex + 1;
        }
    }

    // --- PACKET CONSTRUCTION ---
    const packet = new Uint8Array(64).fill(0);
    packet[0] = targetId; 
    packet[1] = 0x11;         // Command: Write
    packet[2] = 0x01;         // Fixed
    packet[3] = 0x01;         // Fixed
    packet[4] = 0x00;         // Modifiers 
    packet[5] = selectedByte; // Key Code
    
    logToConsole(`1. Setting Key ID:${targetId} to [0x${selectedByte.toString(16).toUpperCase()}]...`, 'info');

    try {
        await device.sendReport(reportId, packet);
        await new Promise(r => setTimeout(r, 100));
        
        const savePacket = new Uint8Array(64).fill(0);
        savePacket[0] = 0xAA; 
        savePacket[1] = 0xAA; 
        
        logToConsole(`2. Persisting (0xAA)...`, 'info');
        await device.sendReport(reportId, savePacket);
        
        logToConsole(`✅ Packet Sent Successfully`, 'tx');
        
        if (!debugIdInput.value) {
            keyMetadata[activeKeyIndex] = selectedByte;
            localStorage.setItem('keypad_metadata', JSON.stringify(keyMetadata));
            refreshSummary();
        }
        showSuccess();
    } catch (e) { 
        logToConsole(`❌ Write Error: ${e.message}`, 'err'); 
    }
}

// UI HELPERS
export function handleKeySelection(idx) {
    activeKeyIndex = idx; 
    document.querySelectorAll('.key').forEach(k => k.classList.remove('active'));
    const el = document.getElementById(`v-${idx}`);
    if(el) el.classList.add('active');
    
    document.getElementById('editor-container').classList.remove('hidden');
    
    let label = `Editing Key ${idx + 1}`;
    if (idx === 12) label = "Editing Knob Right (CW)";
    if (idx === 13) label = "Editing Knob Left (CCW)";
    if (idx === 14) label = "Editing Knob Press";
    
    document.getElementById('editingLabel').innerText = label;
    fSelector.value = keyMetadata[idx] || 0x04;
    
    const debugInput = document.getElementById('debug-target-id');
    if(debugInput) debugInput.value = '';
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
document.getElementById('send-test-btn').onclick = saveActiveBinding;

document.querySelectorAll('.key').forEach(k => {
    k.onclick = () => handleKeySelection(parseInt(k.dataset.idx));
});

document.getElementById('clearLogBtn').onclick = () => document.getElementById('console-log').innerHTML = '';
document.getElementById('diagnoseBtn').onclick = runDiagnostics;

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


