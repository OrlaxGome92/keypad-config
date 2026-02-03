/* main.js */
import { SCAN_CODES } from './utils.js';

let device;
let activeKeyIndex = null;

// Device Hardware Info
let hwReportId = 0;
let hwReportLen = 64;

let keyMetadata = JSON.parse(localStorage.getItem('sayo_metadata')) || {};

// 1. Initialize Dropdown (F13-F24)
const fSelector = document.getElementById('fkey-selector');
// Clear existing options first if any
fSelector.innerHTML = ''; 

// Populate F13 to F24
Object.entries(SCAN_CODES).forEach(([keyName, byte]) => {
    if (keyName.startsWith('F') && parseInt(keyName.substring(1)) >= 13) {
        fSelector.add(new Option(keyName, byte));
    }
});

// 2. Connect Device & Auto-Detect
export async function connectDevice() {
    try {
        const filters = [{ vendorId: 0x1189, productId: 0x8890 }];
        const devices = await navigator.hid.requestDevice({ filters });
        
        device = devices.find(d => d.collections.some(c => c.usagePage === 0xFF00 || c.usagePage === 0xFF60));

        if (!device) return alert("Please select the 'HID-compliant device' (NOT Keyboard).");
        if (!device.opened) await device.open();
        
        // --- SMART DETECT ---
        const configCollection = device.collections.find(c => c.usagePage === 0xFF00 || c.usagePage === 0xFF60);
        if (configCollection?.outputReports?.length > 0) {
            hwReportId = configCollection.outputReports[0].reportId;
            if (configCollection.outputReports[0].items?.length > 0) {
                const item = configCollection.outputReports[0].items[0];
                hwReportLen = (item.reportCount * item.reportSize) / 8;
            }
        }
        
        console.log(`Connected. ReportID=${hwReportId}, BufferLen=${hwReportLen}`);
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
    activeKeyIndex = idx; // idx is 0-based
    
    // UI Highlight
    document.querySelectorAll('.key').forEach(k => k.classList.remove('active'));
    document.getElementById(`v-${idx}`).classList.add('active');
    document.getElementById('editor-container').classList.remove('hidden');
    document.getElementById('editingLabel').innerText = `Editing Key ${idx + 1}`;
    
    // Calculate Defaults: 
    // If no data saved, map K1->F13, K2->F14, etc.
    const defaultFKeyByte = 0x68 + idx; // F13 (0x68) + index
    
    // Load Data
    const data = keyMetadata[idx] || { 
        name: "", 
        desc: "", 
        savedByte: defaultFKeyByte 
    };
    
    // Fill Fields
    document.getElementById('bind-name').value = data.name;
    document.getElementById('bind-desc').value = data.desc;

    // Set Dropdown Value
    // If savedByte exists and is in our list, select it. Otherwise default.
    fSelector.value = data.savedByte;
}

// 4. Test Zone
const testInput = document.getElementById('test-input');
const testOutput = document.getElementById('test-output');
if(testInput) {
    testInput.addEventListener('keydown', (e) => {
        e.preventDefault(); 
        testInput.value = e.code; // Will show "F13", "F14" etc.
        testOutput.innerText = `Received Code: ${e.code}`;
        testInput.style.borderColor = "#00ff00";
        setTimeout(() => testInput.style.borderColor = "#555", 200);
    });
}

// 5. SAVE
export async function saveActiveBinding() {
    if (!device) return alert("Connect Keypad first!");
    
    // Get Value directly from Dropdown
    const selectedByte = parseInt(fSelector.value);
    const selectedText = fSelector.options[fSelector.selectedIndex].text;
    
    if (!selectedByte) return alert("Error: Invalid Selection.");

    const report = new Uint8Array(hwReportLen).fill(0);
    
    // Protocol:
    // Byte 0: Command 0x03
    // Byte 1: Key Index (1-based)
    // Byte 2: Mode 0x01 (Keyboard)
    // Byte 3: Key Code (The F-Key byte)
    // Byte 4: Modifier (0x00 for none)
    
    report[0] = 0x03;               
    report[1] = activeKeyIndex + 1; 
    report[2] = 0x01;               
    report[3] = selectedByte;           
    report[4] = 0x00; // No modifiers for F-keys in this mode          
    
    try {
        console.log(`Sending: [03, Idx:${report[1]}, Mode:01, Key:${report[3]}, Mod:${report[4]}]`);
        await device.sendReport(hwReportId, report);
        
        // Save Metadata
        const name = document.getElementById('bind-name').value;
        const desc = document.getElementById('bind-desc').value;
        
        keyMetadata[activeKeyIndex] = { 
            name, 
            desc, 
            shortcutText: selectedText, // "F13" etc.
            savedByte: selectedByte 
        };
        localStorage.setItem('sayo_metadata', JSON.stringify(keyMetadata));
        
        refreshSummary();
        alert("Saved!");
        
    } catch (e) {
        console.error(e);
        alert("Write Failed.");
    }
}

// 6. CLEAR
export async function clearBinding() {
    if (!device) return alert("Connect Keypad first!");
    const report = new Uint8Array(hwReportLen).fill(0);
    report[0] = 0x03; 
    report[1] = activeKeyIndex + 1; 
    report[2] = 0x00; // Mode 0 = Disable
    
    try {
        await device.sendReport(hwReportId, report);
        delete keyMetadata[activeKeyIndex];
        localStorage.setItem('sayo_metadata', JSON.stringify(keyMetadata));
        
        document.getElementById('bind-name').value = "";
        refreshSummary();
        alert("Key Cleared!");
    } catch (e) { console.error(e); }
}

function refreshSummary() {
    const tbody = document.getElementById('summary-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    const entries = Object.entries(keyMetadata).sort((a, b) => a[0] - b[0]);
    if(entries.length === 0) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No keys programmed.</td></tr>';
    
    entries.forEach(([idx, data]) => {
        tbody.innerHTML += `<tr>
            <td>Key ${parseInt(idx) + 1}</td>
            <td><strong>${data.name || '-'}</strong></td>
            <td><code>${data.shortcutText}</code></td>
            <td style="color:#aaa;">${data.desc || ''}</td>
        </tr>`;
    });
}

// Bindings
document.getElementById('connectBtn').onclick = connectDevice;
document.getElementById('save-binding-btn').onclick = saveActiveBinding;
document.getElementById('clear-binding-btn').onclick = clearBinding;
document.querySelectorAll('.key').forEach(k => k.onclick = () => handleKeySelection(parseInt(k.dataset.idx)));

window.onload = refreshSummary;