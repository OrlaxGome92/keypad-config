/**
 * utils.js - Hardware Mapping for SayoDevice (1189:8890)
 * Focuses on F13-F24 for software-based macro triggers.
 */

// Standard HID Scan Codes for F13 through F24
export const SCAN_CODES = {
    "F13": 0x68,
    "F14": 0x69,
    "F15": 0x6A,
    "F16": 0x6B,
    "F17": 0x6C,
    "F18": 0x6D,
    "F19": 0x6E,
    "F20": 0x6F,
    "F21": 0x70,
    "F22": 0x71,
    "F23": 0x72,
    "F24": 0x73
};

// Modifier Bitmasks used by the CH552G chipset
export const MODIFIERS = {
    "None": 0x00,
    "Ctrl": 0x01,
    "Shift": 0x02,
    "Alt": 0x04,
    "Win": 0x08,
    "Ctrl+Shift": 0x03,
    "Ctrl+Alt": 0x05,
    "Alt+Shift": 0x06,
    "Ctrl+Shift+Alt": 0x07
};