/* main.js - Protocol Tweaker Version */
import { SCAN_CODES } from './utils.js';

let device;
let activeKeyIndex = null;
let keyMetadata = JSON.parse(localStorage.getItem('keypad_metadata')) || {};

// 1. Initialize Dropdown (F13-F24)
const fSelector = document.getElementById('fkey-selector');
fSelector.innerHTML = ''; 
Object.entries(SCAN_CODES).forEach(([keyName, byte]) => {
    if (keyName.startsWith('F') && parseInt(keyName.substring(1)) >= 13) {
        fSelector.add(new Option(keyName, byte));
    }
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
    logToConsole(`Product: ${device.productName}`, "info");
    
    let hasWrite = false;
    device.collections.forEach((c, i) => {
        const type = (c.usagePage === 0xFF00) ? "✅ VENDOR (Config)" : 
                     (c.usagePage === 0x01)   ? "🔒 GENERIC" : 
                     (c.usagePage === 0x0C)   ? "🔊 KNOB" : 
                     `❓ Unknown (0x${c.usagePage.toString(16)})`;
        
        const out = c.outputReports?.length || 0;
        const feat = c.featureReports?.length || 0;
        
        if (out > 0 || feat > 0) hasWrite = true;

        logToConsole(`Coll #${i}: ${type} [Out:${out} Feat:${feat}]`, "info");
    });
    
    logToConsole("-----------------------", "info");

    if (!hasWrite) {
        logToConsole("⚠️ READ-ONLY INTERFACE. Re-Connect & select the other device.", "err");
        alert("Wrong Device! Please connect to the other 'Mini Keyboard' in the list.");
    }
}

// ----------------------------------------
// CONNECT
// ----------------------------------------
export async function connectDevice() {
    try {
        // Strict Filter for Vendor Page 0xFF00
        const filters = [{ vendorId: 0x1189, usagePage: 0xFF00 }];

        let devices;
        try {
            devices = await navigator.hid.requestDevice({ filters });
        } catch (err) {
            console.warn("Strict filter failed, trying generic...", err);
            devices = await navigator.hid.requestDevice({ filters: [{ vendorId: 0x1189 }] });
        }
        
        device = devices[0];
        if (!device) return;

        if (!device.opened) await device.open();
        
        logToConsole(`Device Opened: ${device.productName}`, 'info');
        runDiagnostics();

        // --- AUTO DETECT PROTOCOL ---
        // We look for the writable collection to set defaults
        const writable = device.collections.find(c => c.usagePage === 0xFF00) || device.collections[0];
        let defId = 0; 
        let defType = 'output';

        if (writable) {
            if (writable.outputReports?.length > 0) {
                defType = 'output';
                defId = writable.outputReports[0].reportId;
            } else if (writable.featureReports?.length > 0) {
                defType = 'feature';
                defId = writable.featureReports[0].reportId;
            }
            logToConsole(`✅ Auto-Detected: ${defType.toUpperCase()} ID:${defId}`, 'tx');

            // Sync detected values to the UI Controls
            document.getElementById('force-report-id').value = defId;
            document.getElementById('force-report-type').value = defType;
        }

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
// SAVE (WITH PROTOCOL TWEAKER)
// ----------------------------------------
export async function saveActiveBinding() {
    if (!device) return alert("Connect Keypad first!");
    
    const selectedByte = parseInt(fSelector.value);
    
    // 1. READ BASIC SETTINGS
    const useType = document.getElementById('force-report-type').value;
    const useId = parseInt(document.getElementById('force-report-id').value);
    const useLen = parseInt(document.getElementById('force-length').value) || 8;

    // 2. READ PROTOCOL TWEAKER SETTINGS
    const cmdHex = document.getElementById('force-cmd').value; // e.g., "0x03"
    const cmdByte = parseInt(cmdHex, 16); 
    const checksumMode = document.getElementById('force-checksum').value;

    // 3. CONSTRUCT PACKET
    const data = new Uint8Array(useLen).fill(0);
    
    data[0] = cmdByte;            // Byte 0: Command (Controlled by Tweaker)
    data[1] = activeKeyIndex + 1; // Byte 1: Key Index
    data[2] = 0x01;               // Byte 2: Type (Keyboard)
    data[3] = selectedByte;       // Byte 3: Key Code
    data[4] = 0x00;               // Byte 4: Modifiers
    data[5] = 0x00;               // Byte 5: Reserved
    data[6] = 0x00;               // Byte 6: Reserved
    
    // 4. CALCULATE CHECKSUM
    let sum = 0;
    
    // Some firmwares include the Report ID in the checksum
    if (checksumMode === 'id_sum') {
        sum += useId;
    }

    // Sum data bytes 0-6
    for(let i=0; i<7; i++) {
        sum += data[i];
    }
    
    // Apply Checksum to Byte 7 if enabled
    if (checksumMode !== 'none') {
        data[7] = sum & 0xFF;
    }
    
    logToConsole(`Sending [${data.slice(0,8).join(',')}] to ${useType.toUpperCase()} ID:${useId}`, 'info');

    try {
        const sendPromise = (useType === 'feature') 
            ? device.sendFeatureReport(useId, data)
            : device.sendReport(useId, data);

        // Timeout to prevent hanging
        await Promise.race([
            sendPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2000))
        ]);
        
        logToConsole(`✅ Packet Sent Successfully`, 'tx');

        // Update Metadata
        keyMetadata[activeKeyIndex] = selectedByte;
        localStorage.setItem('keypad_metadata', JSON.stringify(keyMetadata));
        
        refreshSummary();
        showSuccess();
        
    } catch (e) {
        logToConsole(`❌ Error: ${e.message}`, 'err');
    }
}

// ----------------------------------------
// UI HELPERS
// ----------------------------------------
export function handleKeySelection(idx) {
    activeKeyIndex = idx; 
    
    document.querySelectorAll('.key').forEach(k => k.classList.remove('active'));
    document.getElementById(`v-${idx}`).classList.add('active');
    document.getElementById('editor-container').classList.remove('hidden');
    document.getElementById('editingLabel').innerText = `Editing Key ${idx + 1}`;
    
    const defaultByte = 0x68 + idx;
    const savedByte = keyMetadata[idx] || defaultByte;
    fSelector.value = savedByte;
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
        for(let opt of fSelector.options) {
            if(parseInt(opt.value) === byte) return opt.text;
        }
        return `Byte ${byte}`;
    };

    entries.forEach(([idx, byte]) => {
        tbody.innerHTML += `<tr>
            <td>Key ${parseInt(idx) + 1}</td>
            <td><strong>${getName(byte)}</strong></td>
        </tr>`;
    });
}

// ----------------------------------------
// INITIALIZATION
// ----------------------------------------
document.getElementById('connectBtn').onclick = connectDevice;
document.getElementById('save-binding-btn').onclick = saveActiveBinding;
document.querySelectorAll('.key').forEach(k => k.onclick = () => handleKeySelection(parseInt(k.dataset.idx)));

// Debug / Tweaker Bindings
document.getElementById('clearLogBtn').onclick = () => { document.getElementById('console-log').innerHTML = ''; };
document.getElementById('send-test-btn').onclick = saveActiveBinding;
document.getElementById('diagnoseBtn').onclick = runDiagnostics;

// Input Tester
const testZone = document.getElementById('key-test-zone');
if (testZone) {
    testZone.addEventListener('keydown', (e) => {
        e.preventDefault(); 
        document.getElementById('last-key-display').innerText = `${e.code}`;
        document.getElementById('d-code').innerText = e.code;
        document.getElementById('d-key').innerText = e.key;
        document.getElementById('d-which').innerText = e.which;
        testZone.style.backgroundColor = '#333';
        setTimeout(() => testZone.style.backgroundColor = '#222', 100);
    });
}

window.onload = refreshSummary;