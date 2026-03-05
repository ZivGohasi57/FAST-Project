import os
import sys

output_filename = "files_list.txt"
script_name = os.path.basename(sys.argv[0])
root_dir = "."

# רשימת תיקיות שצריך לדלג עליהן כדי לא להעמיס על הקובץ
ignore_dirs = {'.git', 'node_modules', 'dist', 'build', '.vite'}
# רשימת קבצים ספציפיים שאין צורך לקרוא (הם סתם ארוכים)
ignore_files = {output_filename, script_name, ".DS_Store", "package-lock.json"}

with open(output_filename, "w", encoding="utf-8") as f:
    for root, dirs, files in os.walk(root_dir):
        # מחיקת התיקיות מהרשימה כדי ש-os.walk לא ייכנס אליהן בכלל
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        
        for file in files:
            if file in ignore_files:
                continue
            
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, root_dir)
            
            try:
                with open(full_path, "r", encoding="utf-8") as current_file:
                    content = current_file.read()
                    
                f.write(f"File Location: {rel_path}\n")
                f.write("Content:\n")
                f.write(content)
                if not content.endswith("\n"):
                    f.write("\n")
                f.write("-" * 40 + "\n")
                
            except UnicodeDecodeError:
                continue
            except Exception:
                continue