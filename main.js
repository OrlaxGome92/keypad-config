/* main.js - Updated for VID 0x1189 "Mini Keyboard" Protocol */
import { SCAN_CODES } from './utils.js';

let device;
let activeKeyIndex = null;
let keyMetadata = JSON.parse(localStorage.getItem('keypad_metadata')) || {};

// 1. Initialize Dropdown (F13-F24 and Standard Keys)
const fSelector = document.getElementById('fkey-selector');
fSelector.innerHTML = ''; 
Object.entries(SCAN_CODES).forEach(([keyName, byte]) => {
    // Add F13-F24 and standard keys for easier testing
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
    
    let hasWrite = false;
    device.collections.forEach((c, i) => {
        const type = (c.usagePage === 0xFF00) ? "✅ VENDOR (Config)" : 
                     (c.usagePage === 0x01)   ? "🔒 GENERIC" : 
                     `❓ Unknown (0x${c.usagePage.toString(16)})`;
        
        logToConsole(`Coll #${i}: ${type}`, "info");
        if (c.outputReports?.length > 0) hasWrite = true;
    });
    
    logToConsole("-----------------------", "info");

    if (!hasWrite) {
        logToConsole("⚠️ WARNING: No Output Reports detected. You might need to reconnect.", "err");
    }
}

// ----------------------------------------
// CONNECT (Targeting VID 0x1189)
// ----------------------------------------
export async function connectDevice() {
    try {
        // Filter specifically for the "Mini Keyboard" generic chip
        const filters = [{ vendorId: 0x1189 }];
        
        const devices = await navigator.hid.requestDevice({ filters });
        
        device = devices[0];
        if (!device) return;
        if (!device.opened) await device.open();
        
        logToConsole(`Device Opened: ${device.productName}`, 'info');
        runDiagnostics();

        document.getElementById('status').innerText = "Status: Connected (0x1189)";
        document.getElementById('status').style.color = "#00d2ff";
        document.getElementById('connectBtn').style.display = 'none';
        refreshSummary();

    } catch (e) {
        console.error(e);
        logToConsole(`Connect Error: ${e.message}`, 'err');
    }
}

// ----------------------------------------
// SAVE (The "Mini Keyboard" Protocol)
// ----------------------------------------
export async function saveActiveBinding() {
    if (!device) return alert("Connect Keypad first!");
    
    const selectedByte = parseInt(fSelector.value);
    // 0x1189 Devices almost always use Report ID 3 for configuration
    const reportId = 3; 

    // --- STEP 1: CONSTRUCT KEY ASSIGNMENT PACKET ---
    // Protocol derived from "MINI KeyBoard.exe" behavior
    // Structure: [KeyIndex, 0x11, 0x01, 0x01, Modifiers, KeyCode, ...Padding]
    
    const packet = new Uint8Array(64).fill(0);
    
    // Key Index: 1-based (1=Key1, 2=Key2... 13=KnobCW, 14=KnobCCW, 15=KnobClick)
    packet[0] = activeKeyIndex + 1; 
    
    packet[1] = 0x11;         // Command: Write Key
    packet[2] = 0x01;         // Fixed
    packet[3] = 0x01;         // Fixed
    packet[4] = 0x00;         // Modifiers (0=None, 1=Ctrl, 2=Shift, 4=Alt, 8=Gui)
    packet[5] = selectedByte; // The Key Code (e.g. 0x04 for 'a')
    
    logToConsole(`1. Setting Key ${activeKeyIndex + 1} to [${selectedByte}]...`, 'info');
    logToConsole(`   > Sending: [${packet.slice(0, 8).join(',')}]`, 'tx');

    try {
        // Send Key Assignment
        await device.sendReport(reportId, packet);
        
        // --- STEP 2: SEND SAVE/PERSIST COMMAND ---
        // Structure: [0xAA, 0xAA, ...Padding]
        // This tells the chip to burn the changes to EEPROM
        
        await new Promise(r => setTimeout(r, 150)); // Safety delay
        
        const savePacket = new Uint8Array(64).fill(0);
        savePacket[0] = 0xAA;
        savePacket[1] = 0xAA;
        
        logToConsole(`2. Persisting to EEPROM (0xAA)...`, 'info');
        await device.sendReport(reportId, savePacket);
        
        logToConsole(`✅ Packet Sent Successfully`, 'tx');
        
        keyMetadata[activeKeyIndex] = selectedByte;
        localStorage.setItem('keypad_metadata', JSON.stringify(keyMetadata));
        refreshSummary();
        showSuccess();
        
    } catch (e) { 
        logToConsole(`❌ Error: ${e.message}`, 'err'); 
        alert("Write Failed. Try reconnecting the device.");
    }
}

// UI HELPERS
export function handleKeySelection(idx) {
    activeKeyIndex = idx; 
    document.querySelectorAll('.key').forEach(k => k.classList.remove('active'));
    document.getElementById(`v-${idx}`).classList.add('active');
    document.getElementById('editor-container').classList.remove('hidden');
    document.getElementById('editingLabel').innerText = `Editing Key ${idx + 1}`;
    
    // Set dropdown to existing value or default
    fSelector.value = keyMetadata[idx] || (0x04); // Default to 'a' (0x04) if undefined
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
    
    entries.forEach(([idx, byte]) => {
        tbody.innerHTML += `<tr><td>Key ${parseInt(idx)+1}</td><td><strong>${getName(byte)}</strong></td></tr>`;
    });
}

// INIT
document.getElementById('connectBtn').onclick = connectDevice;
document.getElementById('save-binding-btn').onclick = saveActiveBinding;
document.querySelectorAll('.key').forEach(k => k.onclick = () => handleKeySelection(parseInt(k.dataset.idx)));
document.getElementById('clearLogBtn').onclick = () => document.getElementById('console-log').innerHTML = '';
document.getElementById('diagnoseBtn').onclick = runDiagnostics;

// Optional: Simple test zone
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
