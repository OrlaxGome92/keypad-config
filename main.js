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
                console.log(`Detected FEATURE Protocol. ID: ${hwReportId}, Len: ${hwReportLen}`);
            } else if (collection.outputReports?.length > 0) {
                reportType = 'output';
                hwReportId = collection.outputReports[0].reportId;
                const item = collection.outputReports[0].items?.[0];
                if (item) hwReportLen = (item.reportCount * item.reportSize) / 8;
                console.log(`Detected OUTPUT Protocol. ID: ${hwReportId}, Len: ${hwReportLen}`);
            }
        }

        document.getElementById('status').innerText = "Status: Connected";
        document.getElementById('status').style.color = "#00d2ff";
        document.getElementById('connectBtn').style.display = 'none';
        refreshSummary();

    } catch (e) {
        console.error(e);
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

// 4. SAVE (Universal Method)
export async function saveActiveBinding() {
    if (!device) return alert("Connect Keypad first!");
    
    const selectedByte = parseInt(fSelector.value);
    const selectedText = fSelector.options[fSelector.selectedIndex].text;
    
    // Construct Packet
    // Standard Format for VID 1189: [Cmd, Index, Type, Key, Mod, Pad...]
    // Packet length must match hwReportLen (usually 8 or 64)
    const data = new Uint8Array(hwReportLen).fill(0);
    
    data[0] = 0x03;               // Command: Write
    data[1] = activeKeyIndex + 1; // Key Index (1-based)
    data[2] = 0x01;               // Type: Keyboard
    data[3] = selectedByte;       // Key Code
    data[4] = 0x00;               // Modifiers (None)
    
    try {
        console.log(`Sending (${reportType.toUpperCase()} ID:${hwReportId}):`, data);
        
        // Try the detected method first
        if (reportType === 'feature') {
            await device.sendFeatureReport(hwReportId, data);
        } else {
            await device.sendReport(hwReportId, data);
        }
        
        // Save to Metadata
        keyMetadata[activeKeyIndex] = selectedByte;
        localStorage.setItem('keypad_metadata', JSON.stringify(keyMetadata));
        
        refreshSummary();
        showSuccess();
        
    } catch (e) {
        console.warn("Primary send failed, trying fallback...", e);
        try {
            // Fallback: If Feature failed, try Output (or vice versa)
            if (reportType === 'feature') await device.sendReport(hwReportId, data);
            else await device.sendFeatureReport(hwReportId, data);
            
            // If fallback worked, update metadata
            keyMetadata[activeKeyIndex] = selectedByte;
            localStorage.setItem('keypad_metadata', JSON.stringify(keyMetadata));
            refreshSummary();
            showSuccess();
        } catch (e2) {
            console.error(e2);
            alert("Update Failed. Re-plug device and try again.");
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

// Bindings
document.getElementById('connectBtn').onclick = connectDevice;
document.getElementById('save-binding-btn').onclick = saveActiveBinding;
document.querySelectorAll('.key').forEach(k => k.onclick = () => handleKeySelection(parseInt(k.dataset.idx)));

window.onload = refreshSummary;