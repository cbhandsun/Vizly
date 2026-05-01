import os
import re

src_dir = 'e:/DEV/WorkSpace/Antigravity-WS/Vizly/src'

for root, _, files in os.walk(src_dir):
    for f in files:
        if not f.endswith(('.ts', '.tsx')): continue
        if f in ['antdStaticBridge.ts', 'AntdApiBridge.tsx']: continue
        path = os.path.join(root, f)
        
        try:
            with open(path, 'r', encoding='utf-8') as file:
                content = file.read()
        except Exception:
            continue
            
        original_content = content
        
        need_message = bool(re.search(r'\bmessage\.(success|error|warning|info|loading)\(', content))
        need_notification = bool(re.search(r'\bnotification\.(success|error|warning|info|open)\(', content))
        need_modal = bool(re.search(r'\bModal\.(confirm|info|warning|error|success)\(', content))
        
        if not (need_message or need_notification or need_modal):
            continue
            
        imports_to_add = []
        if need_message:
            content = re.sub(r'\bmessage\.(success|error|warning|info|loading)\(', r'appMessage.\1(', content)
            imports_to_add.append('appMessage')
        if need_notification:
            content = re.sub(r'\bnotification\.(success|error|warning|info|open)\(', r'appNotification.\1(', content)
            imports_to_add.append('appNotification')
        if need_modal:
            content = re.sub(r'\bModal\.(confirm|info|warning|error|success)\(', r'appModal.\1(', content)
            imports_to_add.append('appModal')
            
        if imports_to_add:
            # Check if they are already imported
            already_imported = []
            for imp in imports_to_add:
                if re.search(fr'\b{imp}\b', original_content) and 'antdStaticBridge' in original_content:
                    already_imported.append(imp)
            
            imports_to_add = [imp for imp in imports_to_add if imp not in already_imported]
            
            if imports_to_add:
                import_statement = f"import {{ {', '.join(imports_to_add)} }} from '@/core/utils/antdStaticBridge';\n"
                
                last_import_pos = 0
                for match in re.finditer(r'^import\s+.*$', content, re.MULTILINE):
                    last_import_pos = match.end()
                    
                if last_import_pos == 0:
                    content = import_statement + content
                else:
                    content = content[:last_import_pos] + '\n' + import_statement + content[last_import_pos:]
                
        if content != original_content:
            with open(path, 'w', encoding='utf-8') as file:
                file.write(content)
            print(f'Updated {path}')
