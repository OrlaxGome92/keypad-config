/* utils.js */

// HID Usage Tables for Keyboard/Keypad (Usage Page 0x07)
// These map standard browser KeyboardEvent.code values to HID Usage IDs
export const SCAN_CODES = {
    // Letters
    "KeyA": 0x04, "KeyB": 0x05, "KeyC": 0x06, "KeyD": 0x07, "KeyE": 0x08,
    "KeyF": 0x09, "KeyG": 0x0A, "KeyH": 0x0B, "KeyI": 0x0C, "KeyJ": 0x0D,
    "KeyK": 0x0E, "KeyL": 0x0F, "KeyM": 0x10, "KeyN": 0x11, "KeyO": 0x12,
    "KeyP": 0x13, "KeyQ": 0x14, "KeyR": 0x15, "KeyS": 0x16, "KeyT": 0x17,
    "KeyU": 0x18, "KeyV": 0x19, "KeyW": 0x1A, "KeyX": 0x1B, "KeyY": 0x1C, "KeyZ": 0x1D,

    // Numbers
    "Digit1": 0x1E, "Digit2": 0x1F, "Digit3": 0x20, "Digit4": 0x21, "Digit5": 0x22,
    "Digit6": 0x23, "Digit7": 0x24, "Digit8": 0x25, "Digit9": 0x26, "Digit0": 0x27,

    // Function Keys
    "F1": 0x3A, "F2": 0x3B, "F3": 0x3C, "F4": 0x3D, "F5": 0x3E, "F6": 0x3F,
    "F7": 0x40, "F8": 0x41, "F9": 0x42, "F10": 0x43, "F11": 0x44, "F12": 0x45,
    "F13": 0x68, "F14": 0x69, "F15": 0x6A, "F16": 0x6B, "F17": 0x6C, "F18": 0x6D,
    "F19": 0x6E, "F20": 0x6F, "F21": 0x70, "F22": 0x71, "F23": 0x72, "F24": 0x73,

    // Common Nav
    "Enter": 0x28, "Escape": 0x29, "Backspace": 0x2A, "Tab": 0x2B, "Space": 0x2C,
    "ArrowRight": 0x4F, "ArrowLeft": 0x50, "ArrowDown": 0x51, "ArrowUp": 0x52,
    "Insert": 0x49, "Delete": 0x4C, "Home": 0x4A, "End": 0x4D, "PageUp": 0x4B, "PageDown": 0x4E
};

// Modifier Bitmask (For Byte 4 of the report)
export const MODIFIERS = {
    "None": 0x00,
    "Ctrl": 0x01,  // Left Control
    "Shift": 0x02, // Left Shift
    "Alt": 0x04,   // Left Alt
    "Win": 0x08,   // Left GUI (Windows/Command)
    "RCtrl": 0x10, // Right Control
    "RShift": 0x20,// Right Shift
    "RAlt": 0x40,  // Right Alt
    "RWin": 0x80   // Right GUI
};