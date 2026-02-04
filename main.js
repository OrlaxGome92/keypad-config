/* main.js */
import { SCAN_CODES } from './utils.js';

let device;
let activeKeyIndex = null;
let keyMetadata = JSON.parse(localStorage.getItem('keypad_metadata')) || {};

// 1. Initialize Dropdown (F13-F24 + Standard Keys)
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
        logToConsole("   Action: Unplug device, Replug, and select the OTHER interface in the popup.", "err");
        alert("Wrong Interface Selected! You chose the 'Keyboard' part. Please disconnect, click Connect again, and select the other 'Mini Keyboard' option.");
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
        // This usually forces the browser to show the correct interface or both.
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

    // --- STEP 1: CONSTRUCT KEY PACKET ---
    // Structure: [KeyIndex, 0x11, 0x01, 0x01, Modifiers, KeyCode, ...Padding]
    const packet = new Uint8Array(64).fill(0);
    
    // KeyIndex: 1=Key1, 2=Key2, ... 13=KnobCW, 14=KnobCCW, 15=KnobClick
    packet[0] = activeKeyIndex + 1; 
    packet[1] = 0x11;         // Command: Write
    packet[2] = 0x01;         // Fixed
    packet[3] = 0x01;         // Fixed
    packet[4] = 0x00;         // Modifiers (0=None, 1=Ctrl, 2=Shift, 4=Alt, 8=Gui)
    packet[5] = selectedByte; // Key Code
    
    logToConsole(`1. Setting Key ${activeKeyIndex + 1} to [${selectedByte}]...`, 'info');

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
        
        logToConsole(`✅ Packet Sent Successfully`, 'tx');
        
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
    document.querySelectorAll('.key').forEach(k => k.classList.remove('active'));
    document.getElementById(`v-${idx}`).classList.add('active');
    document.getElementById('editor-container').classList.remove('hidden');
    document.getElementById('editingLabel').innerText = `Editing Key ${idx + 1}`;
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
    const entries = Object.entries(keyMetadata).sort((a, b) => a[0] - b[0]);
    if(entries.length === 0) tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;">No keys programmed.</td></tr>';
    
    const getName = (byte) => {
        for(let opt of fSelector.options) if(parseInt(opt.value) === byte) return opt.text;
        return `Byte ${byte}`;
    };
    entries.forEach(([idx, byte]) => tbody.innerHTML += `<tr><td>Key ${parseInt(idx)+1}</td><td><strong>${getName(byte)}</strong></td></tr>`);
}

// INIT
document.getElementById('connectBtn').onclick = connectDevice;
document.getElementById('save-binding-btn').onclick = saveActiveBinding;
document.querySelectorAll('.key').forEach(k => k.onclick = () => handleKeySelection(parseInt(k.dataset.idx)));
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
