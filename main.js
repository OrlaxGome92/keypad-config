/* main.js */
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
        
        // Detailed Report Info
        const out = c.outputReports?.[0];
        const feat = c.featureReports?.[0];
        const inp = c.inputReports?.[0];
        
        let details = [];
        if (out) details.push(`Out: ID${out.reportId} (${out.items?.[0]?.reportCount || '?'} bytes)`);
        if (feat) details.push(`Feat: ID${feat.reportId} (${feat.items?.[0]?.reportCount || '?'} bytes)`);
        if (inp) details.push(`In: ID${inp.reportId}`);

        if (out || feat) hasWrite = true;

        logToConsole(`Coll #${i}: ${type}`, "info");
        if(details.length) logToConsole(`   > ${details.join(', ')}`, "info");
        
        // AUTO-UPDATE PACKET LENGTH
        if (type.includes("VENDOR") && out && out.items?.[0]?.reportCount) {
             const detectedLen = out.items[0].reportCount;
             const lenInput = document.getElementById('force-length');
             if(lenInput && detectedLen > 0) {
                 lenInput.value = detectedLen;
                 logToConsole(`   > Auto-set Packet Length to ${detectedLen}`, 'tx');
             }
        }
    });
    
    logToConsole("-----------------------", "info");

    if (!hasWrite) {
        logToConsole("⚠️ READ-ONLY INTERFACE. Re-Connect & select the other device.", "err");
        alert("Wrong Device! You connected to the 'Keyboard' interface. Please disconnect and try again.");
    }
}

// ----------------------------------------
// CONNECT (FIXED: STRICT FILTER)
// ----------------------------------------
export async function connectDevice() {
    try {
        // We MUST use usagePage 0xFF00 to avoid grabbing the Read-Only Keyboard interface
        const filters = [{ vendorId: 0x1189, usagePage: 0xFF00 }];
        
        const devices = await navigator.hid.requestDevice({ filters });
        
        device = devices[0];
        if (!device) return;
        if (!device.opened) await device.open();
        
        logToConsole(`Device Opened: ${device.productName}`, 'info');
        runDiagnostics();

        // Sync detected values to UI defaults
        const writable = device.collections.find(c => c.usagePage === 0xFF00) || device.collections[0];
        if (writable) {
            let defId = 0;
            if (writable.outputReports?.length > 0) defId = writable.outputReports[0].reportId;
            else if (writable.featureReports?.length > 0) defId = writable.featureReports[0].reportId;
            
            if (defId === 0) defId = 3; // Default to ID 3
            
            document.getElementById('force-report-id').value = defId;
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
// SAVE (FIXED: Method C - 0xA1 Cmd + Correct Order)
// ----------------------------------------
export async function saveActiveBinding() {
    if (!device) return alert("Connect Keypad first!");
    
    const selectedByte = parseInt(fSelector.value);
    
    // Read Settings from Dashboard
    const useType = document.getElementById('force-report-type').value;
    const useId = parseInt(document.getElementById('force-report-id').value);
    const useLen = parseInt(document.getElementById('force-length').value) || 64; 

    // --- PACKET CONSTRUCTION ---
    // Structure: [0xA1, KeyIndex, Type, Modifiers, KeyCode, Pad, Pad, Checksum]
    
    const data = new Uint8Array(useLen).fill(0);
    
    data[0] = 0xA1;               // Byte 0: Command (Write Config)
    data[1] = activeKeyIndex + 1; // Byte 1: Key Index (1-based)
    data[2] = 0x01;               // Byte 2: Type (0x01 = Keyboard)
    data[3] = 0x00;               // Byte 3: Modifiers (MOVED HERE - Was incorrectly at Byte 4)
    data[4] = selectedByte;       // Byte 4: Key Code  (MOVED HERE - Was incorrectly at Byte 3)
    data[5] = 0x00;               // Byte 5: Padding
    data[6] = 0x00;               // Byte 6: Padding

    // Checksum (Sum of bytes 0-6)
    let sum = 0;
    for(let i = 0; i < 7; i++) {
        sum += data[i];
    }
    data[7] = sum & 0xFF; 
    
    logToConsole(`Sending [${data.slice(0,8).join(',')}...] (${useLen} bytes) to ID:${useId}`, 'info');

    try {
        const sendPromise = (useType === 'feature') 
            ? device.sendFeatureReport(useId, data)
            : device.sendReport(useId, data);

        await Promise.race([
            sendPromise,
            new Promise((_, r) => setTimeout(() => r(new Error("Timeout")), 2000))
        ]);
        
        logToConsole(`✅ Packet Sent Successfully`, 'tx');
        
        keyMetadata[activeKeyIndex] = selectedByte;
        localStorage.setItem('keypad_metadata', JSON.stringify(keyMetadata));
        refreshSummary();
        showSuccess();
    } catch (e) { logToConsole(`❌ Error: ${e.message}`, 'err'); }
}

// UI HELPERS
export function handleKeySelection(idx) {
    activeKeyIndex = idx; 
    document.querySelectorAll('.key').forEach(k => k.classList.remove('active'));
    document.getElementById(`v-${idx}`).classList.add('active');
    document.getElementById('editor-container').classList.remove('hidden');
    document.getElementById('editingLabel').innerText = `Editing Key ${idx + 1}`;
    fSelector.value = keyMetadata[idx] || (0x68 + idx);
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
document.getElementById('send-test-btn').onclick = saveActiveBinding;
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
