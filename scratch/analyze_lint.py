import re
from collections import defaultdict

def analyze_lint(file_path):
    rule_counts = defaultdict(int)
    file_warnings = defaultdict(list)
    
    current_file = None
    
    with open(file_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            
            # Match a file path (starts with E:\ or other drive, or has path separators)
            # Exclude code frame paths that end with line numbers (e.g. path.tsx:123:45)
            if (re.match(r'^[A-Za-z]:\\', line) or line.startswith('src/')) and not re.search(r':\d+(?::\d+)?$', line):
                # It's a file path
                current_file = line
                continue
            
            # Match warning/error line, e.g. "10:6  warning  'ThemeManagerStub' is defined but never used                   @typescript-eslint/no-unused-vars"
            # Some lines are multi-line React Compiler details, we only care about lines containing "warning" or "error" followed by rule name
            match = re.search(r'^(?:\d+:\d+|\d+)\s+(warning|error)\s+(.*?)\s+(\S+)$', line)
            if match:
                level = match.group(1)
                message = match.group(2)
                rule = match.group(3)
                
                rule_counts[rule] += 1
                if current_file:
                    file_warnings[current_file].append((rule, line))
            elif line.startswith('✖') or line.startswith('✔'):
                safe_line = line.encode('ascii', 'replace').decode('ascii')
                print(f"Summary line found: {safe_line}")

    print("\n--- Warnings count by Rule ---")
    sorted_rules = sorted(rule_counts.items(), key=lambda x: x[1], reverse=True)
    for rule, count in sorted_rules:
        print(f"{rule}: {count}")
        
    print("\n--- Top 10 files with most warnings ---")
    sorted_files = sorted(file_warnings.items(), key=lambda x: len(x[1]), reverse=True)
    for file, warnings in sorted_files[:10]:
        print(f"{file}: {len(warnings)} warnings")
        # Print a breakdown of rules for this file
        file_rule_counts = defaultdict(int)
        for rule, _ in warnings:
            file_rule_counts[rule] += 1
        for rule, r_count in sorted(file_rule_counts.items(), key=lambda x: x[1], reverse=True):
            print(f"  - {rule}: {r_count}")

if __name__ == '__main__':
    analyze_lint('current-eslint-errors.txt')
