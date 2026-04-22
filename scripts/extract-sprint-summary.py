import re

content = open('SPRINT.md').read()
blocks = re.split(r'\n---\n', content)
output = []

for block in blocks:
    header = re.search(r'## (Week \d+.*)', block)
    status = re.search(r'\| Status\s*\|\s*(.+?)\s*\|', block)
    active = re.search(r'\| Active days\s*\|\s*(.+?)\s*\|', block)
    commits = re.search(r'\| Total commits\s*\|\s*(.+?)\s*\|', block)
    if header and status and active and commits:
        output.append(
            header.group(1).strip() + '\n' +
            'Status: ' + status.group(1).strip() + '\n' +
            'Active days: ' + active.group(1).strip() + '\n' +
            'Total commits: ' + commits.group(1).strip()
        )

print('\n\n'.join(output))
