import { SCAN_CODES, MODIFIERS } from './utils.js';

let device;

/**
 * Connects to the SayoDevice/Keypad and selects the non-keyboard interface.
 * Browsers block the 'Keyboard' usage page for security.
 */
export async function connectDevice() {
    try {
        const filters = [{ vendorId: 0x1189, productId: 0x8890 }];
        const devices = await navigator.hid.requestDevice({ filters });
        
        // Find the interface with usagePage 0xFF00 (Vendor Defined).
        // Selecting the correct interface is critical to avoid NotAllowedError.
        device = devices.find(d => 
            d.collections.some(c => c.usagePage === 0xFF00 || c.usagePage === 0xFF60)
        );

        if (!device) {
            alert("Keypad found, but the configuration interface is blocked. Re-plug and select a different entry.");
            return;
        }

        await device.open();
        document.getElementById('status').innerText = `Connected: ${device.productName}`;
        document.getElementById('connectBtn').style.display = 'none';
        
        console.log("Device opened successfully on Vendor Interface.");
    } catch (error) {
        console.error("Connection failed:", error);
        alert("Connection Error: Ensure you are using HTTPS or Localhost.");
    }
}

/**
 * Sends a 64-byte configuration report to the hardware.
 * Replicates the SayoDevice 'Set Key' protocol.
 */
export async function saveKeyConfig(index, modName, keyName) {
    if (!device || !device.opened) {
        alert("Please connect the device first!");
        return;
    }

    const modByte = MODIFIERS[modName] || 0;
    const keyByte = SCAN_CODES[keyName] || 0;

    // The CH552G chipset used in these pads requires a 64-byte buffer.
    const report = new Uint8Array(64);
    report[0] = 0x03; // Command: Write to Keypad memory
    report[1] = index; // 0-5 for Keys, 6 for Knob
    report[2] = 0x11; // Mode: Static Key assignment
    report[3] = 0x01; // Layer (Default to Layer 1)
    report[4] = 0x01; // State: Enable Key
    report[5] = modByte;
    report[6] = keyByte;

    try {
        // We use Report ID 0 as standard for this hardware.
        await device.sendReport(0, report);
        alert(`Success! Key ${index + 1} updated.`);
    } catch (error) {
        console.error("Write failed:", error);
        // Fallback for different firmware versions that expect Report ID 1
        try {
            await device.sendReport(1, report.slice(1));
            alert(`Success (via ID 1)! Key ${index + 1} updated.`);
        } catch (e) {
            alert("NotAllowedError: Chrome is still blocking the write. Try re-plugging.");
        }
    }
}

/**
 * Handles the Media Slideshow using the File System Access API.
 * Replicates the directory listing feature of your Tkinter app.
 */
let mediaFiles = [];
let slideInterval;

export async function selectMediaFolder() {
    try {
        // showDirectoryPicker is the web equivalent of your 'browse' function.
        const directoryHandle = await window.showDirectoryPicker();
        mediaFiles = [];
        
        for await (const entry of directoryHandle.values()) {
            if (entry.kind === 'file' && /\.(jpe?g|png|gif)$/i.test(entry.name)) {
                mediaFiles.push(await entry.getFile());
            }
        }

        if (mediaFiles.length > 0) {
            startSlideshow();
        } else {
            alert("No images found in that folder.");
        }
    } catch (err) {
        console.log("Folder selection cancelled or failed.");
    }
}

function startSlideshow() {
    if (slideInterval) clearInterval(slideInterval);
    
    const slideImg = document.getElementById('slide');
    const statusText = document.getElementById('mediaStatus');
    let idx = 0;

    statusText.style.display = 'none';
    slideImg.classList.remove('hidden');

    const updateImage = () => {
        const file = mediaFiles[idx];
        const url = URL.createObjectURL(file);
        slideImg.src = url;
        idx = (idx + 1) % mediaFiles.length;
    };

    updateImage();
    // Replicates your Tkinter slideshow interval.
    slideInterval = setInterval(updateImage, 5000); 
}

// Bind the folder selection to the button since it needs a user gesture
document.getElementById('folderBtn').addEventListener('click', selectMediaFolder);