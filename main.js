/* main.js */
import { SCAN_CODES } from './utils.js';

let device;
let activeKeyIndex = null;

// Hardware Protocol Info
let reportType = 'output'; // 'output' or 'feature'
let hwReportId = 0;
let hwReportLen = 8; // Default to 8 bytes

// Local Metadata Storage
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
// DEBUG LOGGING SYSTEM
// ----------------------------------------
function logToConsole(msg, type = 'info') {
    const consoleDiv = document.getElementById('console-log');
    if (!consoleDiv) return;

    const entry = document.createElement('div');
    entry.classList.add('log-entry', `log-${type}`);
    
    const time = new Date().toLocaleTimeString().split(' ')[0];
    entry.innerText = `[${time}] ${msg}`;
    
    consoleDiv.appendChild(entry);
    consoleDiv.scrollTop = consoleDiv.scrollHeight; // Auto-scroll
}

// ----------------------------------------
// DIAGNOSTIC TOOL
// ----------------------------------------
async function runDiagnostics() {
    if (!device) return logToConsole("❌ No device connected.", "err");

    logToConsole("--- DIAGNOSTIC SCAN ---", "info");
    logToConsole(`Product: ${device.productName}`, "info");
    
    let hasWriteCabability = false;

    device.collections.forEach((c, i) => {
        const type = (c.usagePage === 0xFF00) ? "✅ VENDOR (Config)" : 
                     (c.usagePage === 0x01)   ? "🔒 GENERIC (Mouse/Key)" : 
                     (c.usagePage === 0x0C)   ? "🔊 CONSUMER (Knob)" :
                     `❓ Unknown (0x${c.usagePage.toString(16)})`;
        
        const outLen = c.outputReports?.length || 0;
        const featLen = c.featureReports?.length || 0;
        
        if (outLen > 0 || featLen > 0) hasWriteCabability = true;

        logToConsole(`Coll #${i}: ${type} [Out:${outLen} Feat:${featLen}]`, "info");
    });
    
    logToConsole("-----------------------", "info");

    if (!hasWriteCabability) {
        logToConsole("⚠️ WARNING: READ-ONLY INTERFACE DETECTED", "err");
        logToConsole("👉 Please click 'Connect' again and select the OTHER device in the list!", "err");
        alert("Wrong Interface Selected!\n\nYou connected to the Volume Knob.\nPlease click Connect again and pick the OTHER 'Mini Keyboard' in the list.");
    }
}

// 2. Connect Device (With Filter Update)
export async function connectDevice() {
    try {
        // FILTER UPDATE: Specifically ask for Usage Page 0xFF00.
        // This forces Windows to show the "Configuration" interface 
        // instead of just the "Knob/Mouse" interface.
        const filters = [
            { vendorId: 0x1189, usagePage: 0xFF00 } 
        ];

        let devices;
        try {
            // Try Strict Filter First (Best for Windows)
            devices = await navigator.hid.requestDevice({ filters });
        } catch (err) {
            // Fallback: If strict fails, try generic (Best for Mac/Linux)
            console.warn("Strict filter failed, trying generic...", err);
            devices = await navigator.hid.requestDevice({ filters: [{ vendorId: 0x1189 }] });
        }
        
        device = devices[0];
        if (!device) return;

        if (!device.opened) await device.open();
        
        logToConsole(`Device Opened: ${device.productName}`, 'info');

        // Run Diagnostic immediately
        runDiagnostics();

        // --- PROTOCOL DETECTION ---
        // Look for the writable collection
        const writableCollection = device.collections.find(c => 
            (c.outputReports && c.outputReports.length > 0) || 
            (c.featureReports && c.featureReports.length > 0) ||
            c.usagePage === 0xFF00 // Trust the vendor page even if reports look empty
        );

        if (writableCollection) {
            // Default to Feature report for 0xFF00 (Standard for these chips)
            if (writableCollection.featureReports?.length > 0) {
                reportType = 'feature';
                hwReportId = writableCollection.featureReports[0].reportId;
            } else if (writableCollection.outputReports?.length > 0) {
                reportType = 'output';
                hwReportId = writableCollection.outputReports[0].reportId;
            } else {
                // If reports are missing from descriptor, assume Output ID 0
                reportType = 'output'; 
                hwReportId = 0; 
            }
            logToConsole(`✅ Protocol: ${reportType.toUpperCase()} | ID: ${hwReportId}`, 'tx');
        } else {
            reportType = 'output';
            hwReportId = 0; 
            logToConsole(`⚠️ No descriptor found. Defaulting to Output ID: 0`, 'err');
        }

        document.getElementById('status').innerText = "Status: Connected";
        document.getElementById('status').style.color = "#00d2ff";
        document.getElementById('connectBtn').style.display = 'none';
        refreshSummary();

    } catch (e) {
        console.error(e);
        logToConsole(`Connection Failed: ${e.message}`, 'err');
    }
}

// 3. Handle Key Selection
export function handleKeySelection(idx) {
    activeKeyIndex = idx; 
    
    // UI Highlight
    document.querySelectorAll('.key').forEach(k => k.classList.remove('active'));
    document.getElementById(`v-${idx}`).classList.add('active');
    document.getElementById('editor-container').classList.remove('hidden');
    document.getElementById('editingLabel').innerText = `Editing Key ${idx + 1}`;
    
    // Logic: Default to F13+idx if not set
    const defaultByte = 0x68 + idx; // F13 + idx
    const savedByte = keyMetadata[idx] || defaultByte;
    
    fSelector.value = savedByte;
}

// 4. SAVE (Robust Method with Length Override & Timeout)
export async function saveActiveBinding() {
    if (!device) return alert("Connect Keypad first!");
    
    const selectedByte = parseInt(fSelector.value);
    
    // 1. Get Values from Debug Panel
    const forceType = document.getElementById('force-report-type').value;
    const forceId = parseInt(document.getElementById('force-report-id').value);
    // CRITICAL: Use the length from the debug panel (default 8)
    const forceLen = parseInt(document.getElementById('force-length').value) || 8;

    // 2. Construct Data Packet (Respecting forced length)
    const data = new Uint8Array(forceLen).fill(0);
    
    // Standard Packet Structure for VID 0x1189
    data[0] = 0x03;               // Command: Write
    data[1] = activeKeyIndex + 1; // Key Index (1-based)
    data[2] = 0x01;               // Type: Keyboard
    data[3] = selectedByte;       // Key Code
    data[4] = 0x00;               // Modifiers
    
    logToConsole(`Preparing Packet (${data.length} bytes): [${data.join(', ')}]`, 'info');
    logToConsole(`Target: ${forceType.toUpperCase()} | ReportID: ${forceId}`, 'info');

    try {
        // 3. Send with Timeout (Prevents hanging if ID/Length is wrong)
        const sendPromise = (forceType === 'feature') 
            ? device.sendFeatureReport(forceId, data)
            : device.sendReport(forceId, data);

        // Race against a 2-second timeout
        await Promise.race([
            sendPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout: Device didn't respond (Try changing Length or ID)")), 2000))
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
    
    // Helper to find name from byte
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
// INPUT TESTER & EVENTS
// ----------------------------------------
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

// Bindings
document.getElementById('connectBtn').onclick = connectDevice;
document.getElementById('save-binding-btn').onclick = saveActiveBinding;
document.querySelectorAll('.key').forEach(k => k.onclick = () => handleKeySelection(parseInt(k.dataset.idx)));

const clearBtn = document.getElementById('clearLogBtn');
if(clearBtn) clearBtn.onclick = () => { document.getElementById('console-log').innerHTML = ''; };

const resendBtn = document.getElementById('send-test-btn');
if(resendBtn) resendBtn.onclick = saveActiveBinding;

const diagnoseBtn = document.getElementById('diagnoseBtn');
if(diagnoseBtn) diagnoseBtn.onclick = runDiagnostics;

window.onload = refreshSummary;