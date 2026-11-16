import json

with open('C:\\Users\\AC\\.gemini\\antigravity\\brain\\299d67b6-9acf-40b7-9d7e-38d8d088d99d\\.system_generated\\logs\\transcript.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if 'hero.png' in line:
            data = json.loads(line)
            print(f"Line {i}, Source: {data.get('source')}, Type: {data.get('type')}")
            # If it's model output or tool call, print summary
            if 'tool_calls' in data:
                for tc in data['tool_calls']:
                    print(f"  Tool: {tc.get('name')}, Args: {list(tc.get('args', {}).keys())}")
            else:
                content = data.get('content', '')
                print(f"  Content: {content[:200]}")
