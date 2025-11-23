#!/usr/bin/env python3
"""
Remove 'false ?' dead code blocks from law-viewer.tsx
"""

import re

# Read file
with open('components/law-viewer.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern: ") : false ? (" ... ") : ("
# We need to find and remove the false branch

# Strategy: Find all ") : false ? (" and replace with ") : ("
# But keep everything after the matching closing

# Find all false blocks
lines = content.split('\n')
new_lines = []
skip_until = -1
false_depth = 0
in_false_block = False

for i, line in enumerate(lines):
    line_num = i + 1

    # If we're skipping, check if we've reached the end
    if in_false_block:
        # Track parentheses
        false_depth += line.count('(') - line.count(')')

        # Check for ") : (" at depth 0
        if false_depth == 0 and re.search(r'^\s*\) : \(', line):
            # Found the end of false block
            in_false_block = False
            # Don't skip this line, but don't add it either (it's the closing)
            continue
        else:
            # Skip this line (part of false block)
            continue

    # Check if this line starts a false block
    if re.search(r'^\s*\) : false \? \(', line):
        print(f"Found false block at line {line_num}")
        in_false_block = True
        false_depth = 0  # Reset depth
        # Remove comment line above if it exists
        if new_lines and new_lines[-1].strip().startswith('//'):
            print(f"  Removing comment at line {line_num - 1}: {new_lines[-1].strip()}")
            new_lines.pop()
        continue  # Skip this line

    # Keep this line
    new_lines.append(line)

# Write back
output = '\n'.join(new_lines)
with open('components/law-viewer.tsx', 'w', encoding='utf-8') as f:
    f.write(output)

print(f"\nRemoved {len(lines) - len(new_lines)} lines")
print(f"   Original: {len(lines)} lines")
print(f"   Final:    {len(new_lines)} lines")
