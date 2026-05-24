import re
import os
from collections import defaultdict

def prefix_file_vars(file_path, warnings_by_line):
    if not os.path.exists(file_path):
        return
        
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    modified = False
    
    # Process line by line
    for line_num, warnings in warnings_by_line.items():
        if line_num > len(lines):
            continue
            
        idx = line_num - 1
        line = lines[idx]
        
        # Sort warnings on this line by column number in descending order
        # to ensure character insertions don't invalidate subsequent column indices
        sorted_warnings = sorted(warnings, key=lambda x: x[0], reverse=True)
        
        for col_num, var_name in sorted_warnings:
            col_idx = col_num - 1
            if col_idx < 0 or col_idx >= len(line):
                continue
                
            # Verify that the variable name matches at the reported column
            current_substring = line[col_idx : col_idx + len(var_name)]
            if current_substring == var_name:
                # If it's already prefixed with _, skip it
                if col_idx > 0 and line[col_idx - 1] == '_':
                    continue
                if var_name.startswith('_'):
                    continue
                    
                # Prefix with _
                line = line[:col_idx] + "_" + var_name + line[col_idx + len(var_name):]
                lines[idx] = line
                modified = True
                print(f"[{file_path}:{line_num}:{col_num}] Prefixed '{var_name}' -> '_{var_name}'")
            else:
                # Sometimes column index is slightly off in ESLint reports (e.g. on destructuring or default exports)
                # Let's do a search on the line for the word var_name as a fallback
                # but only if it matches exactly once as a whole word to prevent false replacements
                matches = [m.start() for m in re.finditer(r'\b' + re.escape(var_name) + r'\b', line)]
                if len(matches) == 1:
                    match_col = matches[0]
                    if match_col > 0 and line[match_col - 1] == '_':
                        continue
                    line = line[:match_col] + "_" + var_name + line[match_col + len(var_name):]
                    lines[idx] = line
                    modified = True
                    print(f"[{file_path}:{line_num}] Fallback Prefixed '{var_name}' -> '_{var_name}'")
                
    if modified:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.writelines(lines)

def main():
    report_path = 'current-eslint-errors.txt'
    if not os.path.exists(report_path):
        print(f"Report {report_path} not found.")
        return
        
    # file_path -> line_num -> list of (col_num, var_name)
    unused_vars = defaultdict(lambda: defaultdict(list))
    current_file = None
    
    with open(report_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
                
            if re.match(r'^[A-Za-z]:\\', line) or line.startswith('src/'):
                current_file = line
                continue
                
            # e.g., "  106:16  warning  'x' is assigned a value but never used. Allowed unused vars must match /^_/u  @typescript-eslint/no-unused-vars"
            match = re.search(r'^(\d+):(\d+)\s+(warning|error)\s+\'([^\']+)\' is (?:defined|assigned a value) but never used.*@typescript-eslint/no-unused-vars', line)
            if match and current_file:
                line_num = int(match.group(1))
                col_num = int(match.group(2))
                var_name = match.group(4)
                
                # Check if it looks like an import line. We can check the source line during modification,
                # but let's register it first.
                unused_vars[current_file][line_num].append((col_num, var_name))
                
    print(f"Found {len(unused_vars)} files with unused variables to prefix.")
    
    total_prefixed = 0
    for file_path, warnings_by_line in unused_vars.items():
        # Only clean files under src/ (and ignore build/scratch directories)
        if 'src\\' in file_path or 'src/' in file_path:
            # Check if it has any imports to be extra safe
            # Actually, since cleanup_unused_imports.py already ran,
            # any remaining no-unused-vars warnings are local variables or function parameters.
            # We can safely prefix them.
            prefix_file_vars(file_path, warnings_by_line)
            total_prefixed += 1
            
    print(f"Finished prefixing unused variables in {total_prefixed} files.")

if __name__ == '__main__':
    main()
