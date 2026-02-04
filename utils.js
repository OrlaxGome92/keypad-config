/* utils.js */

export const SCAN_CODES = {
    // --- MEDIA CONTROLS ---
    'Mute': 0x7F,
    'Volume Up': 0x80,
    'Volume Down': 0x81,
    'Play/Pause': 0xCD, // Standard HID Play/Pause
    'Next Track': 0xB5,
    'Prev Track': 0xB6,

    // --- LAYER SWITCHING (Common for 0x1189) ---
    // Assigning a key to these will switch the keypad to that layer
    'LAYER 1': 0xF1,
    'LAYER 2': 0xF2,
    'LAYER 3': 0xF3,
    'LAYER 4': 0xF4,

    // --- STANDARD LETTERS ---
    'a': 0x04, 'b': 0x05, 'c': 0x06, 'd': 0x07,
    'e': 0x08, 'f': 0x09, 'g': 0x0A, 'h': 0x0B,
    'i': 0x0C, 'j': 0x0D, 'k': 0x0E, 'l': 0x0F,
    'm': 0x10, 'n': 0x11, 'o': 0x12, 'p': 0x13,
    'q': 0x14, 'r': 0x15, 's': 0x16, 't': 0x17,
    'u': 0x18, 'v': 0x19, 'w': 0x1A, 'x': 0x1B,
    'y': 0x1C, 'z': 0x1D,

    // --- NUMBERS ---
    '1': 0x1E, '2': 0x1F, '3': 0x20, '4': 0x21,
    '5': 0x22, '6': 0x23, '7': 0x24, '8': 0x25,
    '9': 0x26, '0': 0x27,

    // --- STANDARD FUNCTIONS ---
    'Enter': 0x28, 
    'Escape': 0x29, 
    'Backspace': 0x2A,
    'Tab': 0x2B, 
    'Space': 0x2C,
    'Caps Lock': 0x39,
    
    // --- F-KEYS (Standard) ---
    'F1': 0x3A, 'F2': 0x3B, 'F3': 0x3C, 'F4': 0x3D,
    'F5': 0x3E, 'F6': 0x3F, 'F7': 0x40, 'F8': 0x41,
    'F9': 0x42, 'F10': 0x43, 'F11': 0x44, 'F12': 0x45,

    // --- F-KEYS (Extended - Good for Macros) ---
    'F13': 0x68, 'F14': 0x69, 'F15': 0x6A, 'F16': 0x6B,
    'F17': 0x6C, 'F18': 0x6D, 'F19': 0x6E, 'F20': 0x6F,
    'F21': 0x70, 'F22': 0x71, 'F23': 0x72, 'F24': 0x73,

    // --- ARROWS & NAV ---
    'Right': 0x4F, 'Left': 0x50, 'Down': 0x51, 'Up': 0x52,
    'Insert': 0x49, 'Home': 0x4A, 'PageUp': 0x4B,
    'Delete': 0x4C, 'End': 0x4D, 'PageDown': 0x4E,
    
    // --- MODIFIERS (As standalone keys) ---
    // Note: Usually modifiers are sent in Byte 4, but some devices 
    // allow mapping them as standard keys using these codes:
    'Left Ctrl': 0xE0,
    'Left Shift': 0xE1,
    'Left Alt': 0xE2,
    'Left GUI (Win)': 0xE3,
    'Right Ctrl': 0xE4,
    'Right Shift': 0xE5,
    'Right Alt': 0xE6,
    'Right GUI': 0xE7
};
