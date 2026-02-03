/* main.js */
import { SCAN_CODES } from './utils.js';

let device;
let activeKeyIndex = null;

// Hardware Protocol Info
let reportType = 'output'; // 'output' or 'feature'
let hwReportId = 0;
let hwReportLen = 8; // Default to 8 bytes for these pads

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
// NEW: DEBUG LOGGING SYSTEM
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

// 2. Connect Device & Auto-Detect Report Type
export async function connectDevice() {
    try {
        // VID 0x1189 is the standard for "MINI KeyBoard"
        const filters = [{ vendorId: 0x1189 }];
        const devices = await navigator.hid.requestDevice({ filters });
        
        device = devices[0];
        if (!device) return;

        if (!device.opened) await device.open();
        
        console.log("Device Info:", device.collections);
        logToConsole(`Device Opened: ${device.productName}`, 'info');

        // --- PROTOCOL DETECTION ---
        // Search for the config collection (usually UsagePage 0xFF00 or Generic Desktop)
        // We prioritize Feature Reports for configuration on these devices.
        const collection = device.collections.find(c => c.usagePage === 0xFF00) || device.collections[0];
        
        if (collection) {
            if (collection.featureReports?.length > 0) {
                reportType = 'feature';
                hwReportId = collection.featureReports[0].reportId;
                const item = collection.featureReports[0].items?.[0];
                if (item) hwReportLen = (item.reportCount * item.reportSize) / 8;
                logToConsole(`Detected FEATURE Protocol. ID: ${hwReportId}, Len: ${hwReportLen}`, 'info');
            } else if (collection.outputReports?.length > 0) {
                reportType = 'output';
                hwReportId = collection.outputReports[0].reportId;
                const item = collection.outputReports[0].items?.[0];
                if (item) hwReportLen = (item.reportCount * item.reportSize) / 8;
                logToConsole(`Detected OUTPUT Protocol. ID: ${hwReportId}, Len: ${hwReportLen}`, 'info');
            }
        }

        document.getElementById('status').innerText = "Status: Connected";
        document.getElementById('status').style.color = "#00d2ff";
        document.getElementById('connectBtn').style.display = 'none';
        refreshSummary();

    } catch (e) {
        console.error(e);
        logToConsole(`Connection Failed: ${e.message}`, 'err');
        alert(`Connection Failed: ${e.message}`);
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

// 4. SAVE (Universal Method with Debug Overrides)
export async function saveActiveBinding() {
    if (!device) return alert("Connect Keypad first!");
    
    const selectedByte = parseInt(fSelector.value);
    const selectedText = fSelector.options[fSelector.selectedIndex].text;
    
    // Check for Manual Overrides in Debug Panel
    const forceType = document.getElementById('force-report-type').value;
    const forceIdVal = document.getElementById('force-report-id').value;
    const forceId = parseInt(forceIdVal);

    // Determine Logic
    const useType = (forceType !== 'auto') ? forceType : reportType;
    const useId = (forceIdVal !== "0" && !isNaN(forceId)) ? forceId : hwReportId;

    // Construct Packet
    // Standard Format for VID 1189: [Cmd, Index, Type, Key, Mod, Pad...]
    // Packet length must match hwReportLen (usually 8 or 64)
    const data = new Uint8Array(hwReportLen).fill(0);
    
    data[0] = 0x03;               // Command: Write
    data[1] = activeKeyIndex + 1; // Key Index (1-based)
    data[2] = 0x01;               // Type: Keyboard
    data[3] = selectedByte;       // Key Code
    data[4] = 0x00;               // Modifiers (None)
    
    logToConsole(`Preparing Packet: [${data.join(', ')}]`, 'info');
    logToConsole(`Target: ${useType.toUpperCase()} | ReportID: ${useId}`, 'info');

    try {
        // Try the detected/selected method
        if (useType === 'feature') {
            await device.sendFeatureReport(useId, data);
        } else {
            await device.sendReport(useId, data);
        }
        
        logToConsole(`✅ Packet Sent Successfully`, 'tx');

        // Save to Metadata
        keyMetadata[activeKeyIndex] = selectedByte;
        localStorage.setItem('keypad_metadata', JSON.stringify(keyMetadata));
        
        refreshSummary();
        showSuccess();
        
    } catch (e) {
        logToConsole(`❌ Primary send failed: ${e.message}`, 'err');
        console.warn("Primary send failed, trying fallback...", e);
        
        // Only attempt fallback if we are in Auto mode (don't override user manual choice)
        if (forceType === 'auto') {
            try {
                logToConsole(`⚠️ Attempting Fallback (swapping report type)...`, 'info');
                // Fallback: If Feature failed, try Output (or vice versa)
                if (reportType === 'feature') await device.sendReport(hwReportId, data);
                else await device.sendFeatureReport(hwReportId, data);
                
                logToConsole(`✅ Fallback Sent Successfully`, 'tx');

                // If fallback worked, update metadata
                keyMetadata[activeKeyIndex] = selectedByte;
                localStorage.setItem('keypad_metadata', JSON.stringify(keyMetadata));
                refreshSummary();
                showSuccess();
            } catch (e2) {
                console.error(e2);
                logToConsole(`❌ Fallback Failed: ${e2.message}`, 'err');
                alert("Update Failed. Check Log for details.");
            }
        }
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
// NEW: INPUT TESTER LOGIC
// ----------------------------------------
const testZone = document.getElementById('key-test-zone');

if (testZone) {
    testZone.addEventListener('keydown', (e) => {
        e.preventDefault(); // Stop browser actions (like F5 refresh or scrolling)
        
        document.getElementById('last-key-display').innerText = `${e.code}`;
        document.getElementById('d-code').innerText = e.code;
        document.getElementById('d-key').innerText = e.key;
        document.getElementById('d-which').innerText = e.which; // Deprecated but useful for legacy checks
        
        // Flash the box to show activity
        testZone.style.backgroundColor = '#333';
        setTimeout(() => testZone.style.backgroundColor = '#222', 100);
    });
}

// Bindings
document.getElementById('connectBtn').onclick = connectDevice;
document.getElementById('save-binding-btn').onclick = saveActiveBinding;
document.querySelectorAll('.key').forEach(k => k.onclick = () => handleKeySelection(parseInt(k.dataset.idx)));

// Debug Bindings
const clearBtn = document.getElementById('clearLogBtn');
if(clearBtn) clearBtn.onclick = () => { document.getElementById('console-log').innerHTML = ''; };

const resendBtn = document.getElementById('send-test-btn');
if(resendBtn) resendBtn.onclick = saveActiveBinding;

window.onload = refreshSummary;