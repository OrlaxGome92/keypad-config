// utils.js - Comprehensive HID Mapping for 6-Key + Knob Hardware (1189:8890)

// Standard HID Keyboard Usage IDs
export const SCAN_CODES = {
    "None": 0x00,
    
    // Alphanumeric Keys
    "A": 0x04, "B": 0x05, "C": 0x06, "D": 0x07, "E": 0x08, "F": 0x09, "G": 0x0A,
    "H": 0x0B, "I": 0x0C, "J": 0x0D, "K": 0x0E, "L": 0x0F, "M": 0x10, "N": 0x11,
    "O": 0x12, "P": 0x13, "Q": 0x14, "R": 0x15, "S": 0x16, "T": 0x17, "U": 0x18,
    "V": 0x19, "W": 0x1A, "X": 0x1B, "Y": 0x1C, "Z": 0x1D,
    "1": 0x1E, "2": 0x1F, "3": 0x20, "4": 0x21, "5": 0x22, "6": 0x23, "7": 0x24,
    "8": 0x25, "9": 0x26, "0": 0x27,

    // Controls & Symbols
    "Enter": 0x28, "Esc": 0x29, "Backspace": 0x2A, "Tab": 0x2B, "Space": 0x2C,
    "Minus": 0x2D, "Equal": 0x2E, "LBracket": 0x2F, "RBracket": 0x30, "Backslash": 0x31,
    "Semicolon": 0x33, "Quote": 0x34, "Tilde": 0x35, "Comma": 0x36, "Dot": 0x37, "Slash": 0x38,
    "Caps": 0x39,

    // Function Keys (Standard)
    "F1": 0x3A, "F2": 0x3B, "F3": 0x3C, "F4": 0x3D, "F5": 0x3E, "F6": 0x3F,
    "F7": 0x40, "F8": 0x41, "F9": 0x42, "F10": 0x43, "F11": 0x44, "F12": 0x45,

    // Extended Function Keys (Useful for software layer triggers)
    "F13": 0x68, "F14": 0x69, "F15": 0x6A, "F16": 0x6B, "F17": 0x6C, "F18": 0x6D,
    "F19": 0x6E, "F20": 0x6F, "F21": 0x70, "F22": 0x71, "F23": 0x72, "F24": 0x73,

    // Navigation & Editing
    "PrintScreen": 0x46, "ScrollLock": 0x47, "Pause": 0x48, "Insert": 0x49,
    "Home": 0x4A, "PageUp": 0x4B, "Delete": 0x4C, "End": 0x4D, "PageDown": 0x4E,
    "Right": 0x4F, "Left": 0x50, "Down": 0x51, "Up": 0x52,

    // Multimedia & System (Consumer Page Codes)
    "Mute": 0xEF, 
    "VolUp": 0xED, 
    "VolDown": 0xEE, 
    "MediaPlay": 0xE8, 
    "MediaNext": 0xEB, 
    "MediaPrev": 0xEA,
    "Calc": 0xFB,       // Opens Windows Calculator
    "MyComputer": 0xFC, // Opens File Explorer
};

// Bitmask values for modifiers
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