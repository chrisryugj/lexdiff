#!/bin/bash

export PYTHONIOENCODING=utf-8

python -c "
import sys
import json
import re

sys.stdout.reconfigure(encoding='utf-8')

try:
    data = json.load(sys.stdin)
except:
    print('[?] [----------] 0% 남음: 0K (0K/200K) [\$0.00]')
    sys.exit(0)

model_name = data.get('model', {}).get('display_name', '?')
model_id = data.get('model', {}).get('id', '')

# 버전 추출: claude-{name}-{major}-{minor}-{date} 패턴
version = ''
m = re.search(r'claude-(?:\w+-)?(opus|sonnet|haiku)-(\d+)-(\d+)', model_id, re.I)
if m:
    version = f' {m.group(2)}.{m.group(3)}'
else:
    # claude-{major}-{minor}-{name} 패턴 (구버전)
    m = re.search(r'claude-(\d+)-(\d+)-', model_id)
    if m:
        version = f' {m.group(1)}.{m.group(2)}'

ctx = data.get('context_window', {})
input_tokens = ctx.get('total_input_tokens', 0) or 0
output_tokens = ctx.get('total_output_tokens', 0) or 0
context_size = ctx.get('context_window_size', 200000) or 200000
cost = data.get('cost', {}).get('total_cost_usd', 0) or 0

total = input_tokens + output_tokens
remain = context_size - total
pct = int(total * 100 / context_size) if context_size > 0 else 0

total_k = round(total / 1000)
remain_k = round(remain / 1000)
ctx_k = round(context_size / 1000)

RED = '\033[31m'
YELLOW = '\033[33m'
GREEN = '\033[32m'
CYAN = '\033[36m'
DIM = '\033[2m'
RESET = '\033[0m'

color = GREEN if pct < 50 else (YELLOW if pct < 80 else RED)

filled = pct * 10 // 100
bar = '=' * filled + '-' * (10 - filled)

print(f'{CYAN}[{model_name}{version}]{RESET} {color}[{bar}] {pct}%{RESET} {DIM}남음:{RESET} {remain_k}K {DIM}({total_k}K/{ctx_k}K){RESET} {CYAN}[\${cost:.2f}]{RESET}')
"
