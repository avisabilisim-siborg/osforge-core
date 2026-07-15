// Minimal ambient declaration for the global base64 decoder. No npm dependency.
// `atob` is a standard global in modern Node and browsers; it decodes base64 to a
// binary (latin1) string — sufficient for detecting ASCII injection payloads hidden
// in base64. This package adds NO npm dependency and binds no Node types.
declare function atob(data: string): string;
