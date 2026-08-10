import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(
    'src/core/components/diagrams/DiagramContextMenu.css',
    'utf8',
);

describe('diagram context menu visual surface', () => {
    it('uses opaque menu surfaces so dense canvas content cannot bleed through', () => {
        expect(stylesheet).toMatch(
            /\.diagram-context-menu\s*\{[^}]*background-color:\s*#fff\s*!important;/s,
        );
        expect(stylesheet).toMatch(
            /html\[data-theme='dark'\] \.diagram-context-menu\s*\{[^}]*background-color:\s*#1e1e1e\s*!important;/s,
        );
    });

    it('keeps submenu surfaces opaque in light and dark themes', () => {
        expect(stylesheet).toMatch(
            /\.ant-menu-submenu-popup\.diagram-context-menu-popup \.ant-menu\s*\{[^}]*background-color:\s*#fff\s*!important;/s,
        );
        expect(stylesheet).toMatch(
            /html\[data-theme='dark'\] \.ant-menu-submenu-popup\.diagram-context-menu-popup \.ant-menu\s*\{[^}]*background-color:\s*#1e1e1e\s*!important;/s,
        );
    });
});
