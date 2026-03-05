import os
import sys

output_filename = "files_list.txt"
script_name = os.path.basename(sys.argv[0])
root_dir = "."

with open(output_filename, "w", encoding="utf-8") as f:
    for root, dirs, files in os.walk(root_dir):
        if '.git' in dirs:
            dirs.remove('.git')
            
        for file in files:
            if file in (output_filename, script_name, ".DS_Store"):
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