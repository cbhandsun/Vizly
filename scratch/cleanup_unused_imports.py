import re
import os

def clean_file_imports(file_path, warnings):
    if not os.path.exists(file_path):
        return
    
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    modified = False
    
    # Sort warnings by line number (descending to help if we do any shifting, but we try to do in-place)
    # Actually, we do it in-place to keep line numbers intact for other warnings.
    for line_num, var_name in sorted(warnings, key=lambda x: x[0], reverse=True):
        if line_num > len(lines):
            continue
            
        idx = line_num - 1
        line = lines[idx]
        
        # Check if this line is part of an import statement
        # We look at the line itself, or scan up to 5 lines backward to see if it starts with 'import'
        is_import = False
        import_start_idx = idx
        for k in range(idx, max(-1, idx - 6), -1):
            if 'import ' in lines[k]:
                is_import = True
                import_start_idx = k
                break
            if ';' in lines[k] and k < idx:
                # Met a previous statement end, so not part of import
                break
                
        if not is_import:
            continue
            
        # We found an import statement. Let's remove the var_name.
        orig_line = line
        
        # Case 1: Curly braces named imports
        # We search from import_start_idx downwards to find the matching closing brace or semicolon
        import_block_indices = []
        for k in range(import_start_idx, len(lines)):
            import_block_indices.append(k)
            if ';' in lines[k] or 'from' in lines[k]:
                # We can stop here
                if '}' in lines[k] or (k + 1 < len(lines) and 'from' in lines[k+1]):
                    pass
            if 'from' in lines[k]:
                break
                
        # Combine the import block lines for regex matching
        import_text = "".join(lines[k] for k in import_block_indices)
        
        # Check if var_name is in curly braces
        curly_match = re.search(r'\{([^}]+)\}', import_text)
        if curly_match:
            braces_content = curly_match.group(1)
            # Remove the variable name from braces content
            # Match variable name as a whole word, optionally with a comma before or after
            new_braces_content = braces_content
            # Pattern 1: preceded by comma
            new_braces_content = re.sub(r',\s*\b' + re.escape(var_name) + r'\b', '', new_braces_content)
            # Pattern 2: followed by comma
            new_braces_content = re.sub(r'\b' + re.escape(var_name) + r'\b\s*,', '', new_braces_content)
            # Pattern 3: single variable
            new_braces_content = re.sub(r'\b' + re.escape(var_name) + r'\b', '', new_braces_content)
            
            # If the braces content is now empty, we might have "import {} from 'module'"
            # We can check if we should remove the whole import, or just leave it
            # Let's replace the curly braces in the text
            new_import_text = import_text.replace(braces_content, new_braces_content)
            
            # Split back into lines
            new_import_lines = new_import_text.splitlines(keepends=True)
            if len(new_import_lines) == len(import_block_indices):
                for offset, k in enumerate(import_block_indices):
                    lines[k] = new_import_lines[offset]
                modified = True
                print(f"[{file_path}:{line_num}] Removed named import '{var_name}'")
        else:
            # Case 2: Default or Namespace import (e.g. import var_name from 'module' or import * as var_name)
            # Since the whole import is unused, we can comment it out or clear the lines
            if var_name in line:
                for k in import_block_indices:
                    lines[k] = f"// {lines[k]}" if not lines[k].strip().startswith("//") else lines[k]
                modified = True
                print(f"[{file_path}:{line_num}] Commented out unused default import '{var_name}'")
                
    if modified:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.writelines(lines)

def main():
    report_path = 'current-eslint-errors-utf8.txt'
    if not os.path.exists(report_path):
        report_path = 'current-eslint-errors.txt'
    if not os.path.exists(report_path):
        print("Report file not found.")
        return
        
    # Parse report
    import_warnings = {} # file_path -> list of (line_num, var_name)
    current_file = None
    
    try:
        with open(report_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    except UnicodeDecodeError:
        with open(report_path, 'r', encoding='utf-16') as f:
            lines = f.readlines()
            
    for line in lines:
        line = line.strip()
        if not line:
            continue
                
        if re.match(r'^[A-Za-z]:\\', line) or line.startswith('src/'):
            current_file = line
            continue
            
        # e.g., "  6:20  warning  'Rectangle' is defined but never used. Allowed unused vars must match /^_/u  @typescript-eslint/no-unused-vars"
        match = re.search(r'^(\d+):(\d+)\s+(warning|error)\s+\'([^\']+)\' is (?:defined|assigned a value) but never used.*@typescript-eslint/no-unused-vars', line)
        if match and current_file:
            line_num = int(match.group(1))
            var_name = match.group(4)
            
            if current_file not in import_warnings:
                import_warnings[current_file] = []
            import_warnings[current_file].append((line_num, var_name))
                
    print(f"Found {len(import_warnings)} files with unused variable warnings.")
    
    total_cleaned = 0
    for file_path, warnings in import_warnings.items():
        # Only clean files under src/
        if 'src\\' in file_path or 'src/' in file_path:
            clean_file_imports(file_path, warnings)
            total_cleaned += 1
            
    print(f"Finished cleaning imports in {total_cleaned} files.")

if __name__ == '__main__':
    main()
