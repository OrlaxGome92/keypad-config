import { SCAN_CODES, MODIFIERS } from './utils.js';

let device;

/**
 * Connects to the hardware. 
 * Note: We filter for usagePage 0xFF00 to avoid the blocked Keyboard interface.
 */
export async function connectDevice() {
    try {
        const filters = [{ vendorId: 0x1189, productId: 0x8890 }];
        const devices = await navigator.hid.requestDevice({ filters });
        
        // The "NotAllowedError" usually happens because the browser picks the Keyboard interface.
        // We look for the Vendor-Defined collection (0xFF00) which allows configuration.
        device = devices.find(d => 
            d.collections.some(c => c.usagePage === 0xFF00 || c.usagePage === 0xFF60)
        );

        if (!device) {
            alert("Keypad found, but the configuration interface is restricted. Please re-plug and pick a different entry in the list.");
            return;
        }

        await device.open();
        
        // UI Updates
        document.getElementById('status').innerText = "Status: Connected to " + device.productName;
        document.getElementById('connectBtn').style.display = 'none';
        
        console.log("HID Connection Established on Vendor Interface.");
    } catch (error) {
        console.error("Connection failed:", error);
        alert("Connection failed. Ensure you are on HTTPS and chose the correct device.");
    }
}

/**
 * Sends the 64-byte configuration packet to the keypad.
 */
export async function saveKeyConfig(index, modName, keyName) {
    if (!device || !device.opened) {
        alert("Please connect the device first!");
        return;
    }

    const modByte = MODIFIERS[modName] || 0;
    const keyByte = SCAN_CODES[keyName] || 0;

    // Standard 64-byte report for the 1189:8890 chipset.
    const report = new Uint8Array(64);
    report[0] = 0x03; // Command: Set Key
    report[1] = index; // 0-5 for Keys, 6 for Knob
    report[2] = 0x11; // Mode: Static Key
    report[3] = 0x01; // Layer 1
    report[4] = 0x01; // Enable
    report[5] = modByte;
    report[6] = keyByte;

    try {
        // Attempting write on Report ID 0
        await device.sendReport(0, report);
        alert(`Successfully saved Key ${index + 1}!`);
    } catch (error) {
        console.error("Write failed:", error);
        // Fallback for different firmware versions
        try {
            await device.sendReport(1, report.slice(1));
            alert("Saved successfully via alternate Report ID.");
        } catch (e) {
            alert("NotAllowedError: The browser is blocking the write to this specific interface. Try re-plugging.");
        }
    }
}

// --- FIXING THE EXPORT CONFLICT ---
// We explicitly bind these to the window object so the HTML 'onclick' can find them.
window.connectDevice = connectDevice;
window.saveKeyConfig = saveKeyConfig;

/**
 * Media Slideshow Logic
 * Replicates the folder-browsing feature of your Tkinter app.
 */
let mediaFiles = [];
let slideTimer;

export async function selectMediaFolder() {
    try {
        const directoryHandle = await window.showDirectoryPicker();
        mediaFiles = [];
        for await (const entry of directoryHandle.values()) {
            if (entry.kind === 'file' && /\.(jpe?g|png|gif)$/i.test(entry.name)) {
                mediaFiles.push(await entry.getFile());
            }
        }
        if (mediaFiles.length > 0) startSlideshow();
    } catch (e) { console.log("Folder selection cancelled."); }
}

function startSlideshow() {
    if (slideTimer) clearInterval(slideTimer);
    const img = document.getElementById('slide');
    const status = document.getElementById('mediaStatus');
    let i = 0;

    status.style.display = 'none';
    img.classList.remove('hidden');

    const next = () => {
        img.src = URL.createObjectURL(mediaFiles[i]);
        i = (i + 1) % mediaFiles.length;
    };
    next();
    slideTimer = setInterval(next, 5000); // 5-second interval
}

// Bind folder button
window.selectMediaFolder = selectMediaFolder;
document.getElementById('folderBtn').onclick = selectMediaFolder;