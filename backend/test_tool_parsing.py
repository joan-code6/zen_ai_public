import re
import json

text = """I'll search your notes for birthday information. <|tool_calls_section_begin|> <|tool_call_begin|> functions.search_notes:0 <|tool_call_argument_begin|> {"keywords":"birthday birth date born geburtstag", "triggerWords":"birthday geburtstag born date birth"} <|tool_call_end|> <|tool_calls_section_end|>"""

tool_section_pattern = r'<\|tool_calls_section_begin\|>(.*?)<\|tool_calls_section_end\|>'
tool_section_match = re.search(tool_section_pattern, text, re.DOTALL)

if tool_section_match:
    print('Found tool section')
    tool_section = tool_section_match.group(1)
    print('Section:', tool_section[:100])
    
    tool_call_pattern = r'<\|tool_call_begin\|>\s*(\S+?):(\d+)\s*<\|tool_call_argument_begin\|>\s*(\{.*?\})\s*<\|tool_call_end\|>'
    
    for match in re.finditer(tool_call_pattern, tool_section, re.DOTALL):
        function_name = match.group(1)
        call_id = match.group(2)
        args_json = match.group(3)
        print(f'Function: {function_name}, ID: {call_id}')
        print(f'Args: {args_json}')
        args = json.loads(args_json)
        print(f'Parsed args: {args}')
    
    cleaned = re.sub(tool_section_pattern, '', text, flags=re.DOTALL).strip()
    print(f'Cleaned text: "{cleaned}"')
else:
    print('No tool section found')
