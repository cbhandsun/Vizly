const fs = require('fs');
const cssPath = 'e:/DEV/WorkSpace/Antigravity-WS/Vizly/src/components/ai/AIChatPanel.css';
let content = fs.readFileSync(cssPath, 'utf16le'); // Might be mixed, let's just read as utf8 and replace the corrupted part
if (!content.includes('listening')) {
    content = fs.readFileSync(cssPath, 'utf8');
}

const targetStr = '[data-theme="dark"] .voice-btn.listening';
const idx = content.indexOf(targetStr);
if (idx !== -1) {
    let clean = content.substring(0, idx + targetStr.length);
    clean += " {\n    background: rgba(239, 68, 68, 0.2) !important;\n}\n\n";
    clean += `/* AIConfigModal Hyper-Glass Style */
.ai-hyper-glass-modal .ant-modal-content {
    background-color: var(--designer-panel-bg, rgba(255, 255, 255, 0.72)) !important;
    backdrop-filter: var(--designer-blur, blur(24px) saturate(180%)) !important;
    -webkit-backdrop-filter: var(--designer-blur, blur(24px) saturate(180%)) !important;
    box-shadow: var(--designer-shadow, 0 20px 40px -10px rgba(0, 0, 0, 0.1)) !important;
    border: 1px solid rgba(255, 255, 255, 0.45) !important;
    border-radius: 16px !important;
}

[data-theme='dark'] .ai-hyper-glass-modal .ant-modal-content {
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
}

.ai-hyper-glass-modal .ant-modal-header {
    background: transparent !important;
    border-bottom: 1px solid rgba(0,0,0,0.06);
}

[data-theme='dark'] .ai-hyper-glass-modal .ant-modal-header {
    border-bottom: 1px solid rgba(255,255,255,0.06);
}
`;
    // Clean up any weird null bytes
    clean = clean.replace(/\0/g, '');
    fs.writeFileSync(cssPath, clean, 'utf8');
    console.log('Fixed CSS encoding and applied Hyper-Glass styles.');
} else {
    console.log('Target string not found.');
}
