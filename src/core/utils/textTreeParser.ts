export interface ParsedTreeNode {
    label: string;
    children: ParsedTreeNode[];
}

/**
 * Parses a multi-line string containing indented lists or plain text into a hierarchical tree structure.
 * 
 * Supports:
 * - standard tab indentations
 * - space indentations (2 or 4 spaces)
 * - Markdown list prefixes (e.g. "- ", "* ", "1. ")
 */
export function parseIndentedText(text: string): ParsedTreeNode[] {
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    const roots: ParsedTreeNode[] = [];
    
    // Stack pairs: [node, indentLevel]
    const stack: { node: ParsedTreeNode, indent: number }[] = [];

    for (const line of lines) {
        // Calculate indent level by counting leading whitespace
        const match = line.match(/^(\s*)(.*)$/);
        if (!match) continue;
        
        let indentStr = match[1];
        let content = match[2];

        // Replace tabs with 4 spaces to normalize indent depth calculation
        indentStr = indentStr.replace(/\t/g, '    ');
        const currentIndent = indentStr.length;

        // Wash markdown prefixes (e.g., "- ", "* ", "1. ")
        content = content.replace(/^([*+-]\s|\d+\.\s)/, '').trim();
        
        const newNode: ParsedTreeNode = { label: content, children: [] };

        // Pop from stack until we find a parent that has a strictly smaller indent level
        while (stack.length > 0 && stack[stack.length - 1].indent >= currentIndent) {
            stack.pop();
        }

        if (stack.length === 0) {
            roots.push(newNode);
        } else {
            // The top of the stack is our parent
            stack[stack.length - 1].node.children.push(newNode);
        }

        stack.push({ node: newNode, indent: currentIndent });
    }

    return roots;
}
