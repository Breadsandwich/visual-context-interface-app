"""HTML injection and path rewriting utilities."""

import json
import re
from bs4 import BeautifulSoup


def _json_dumps_html_safe(value: str) -> str:
    """Serialize value to JSON, escaping characters unsafe inside <script> tags."""
    return json.dumps(value).replace("<", "\\u003c").replace(">", "\\u003e")


def inject_inspector_script(html: str, parent_origin: str = "") -> str:
    """Inject inspector scripts before </body> tag."""
    origin_json = _json_dumps_html_safe(parent_origin)
    injection = f'''
    <script>window.__INSPECTOR_PARENT_ORIGIN__ = {origin_json};</script>
    <script src="/inspector/html2canvas.min.js"></script>
    <script src="/inspector/inspector.js"></script>
    '''

    # Try to inject before </body>
    if "</body>" in html.lower():
        # Case-insensitive replacement
        pattern = re.compile(r'</body>', re.IGNORECASE)
        return pattern.sub(f'{injection}</body>', html, count=1)

    # If no body tag, append to end
    return html + injection


def rewrite_asset_paths(html: str) -> str:
    """Rewrite relative paths to go through proxy."""
    soup = BeautifulSoup(html, 'lxml')

    # Rewrite href attributes (stylesheets, links)
    for tag in soup.find_all(href=True):
        href = tag['href']
        if should_rewrite_path(href):
            tag['href'] = rewrite_path(href)

    # Rewrite src attributes (scripts, images)
    for tag in soup.find_all(src=True):
        src = tag['src']
        if should_rewrite_path(src):
            tag['src'] = rewrite_path(src)

    # Rewrite action attributes (forms)
    for tag in soup.find_all(action=True):
        action = tag['action']
        if should_rewrite_path(action):
            tag['action'] = rewrite_path(action)

    return str(soup)


def should_rewrite_path(path: str) -> bool:
    """Check if a path should be rewritten to go through proxy."""
    if not path:
        return False

    # Skip absolute URLs
    if path.startswith(('http://', 'https://', '//')):
        return False

    # Skip data URIs
    if path.startswith('data:'):
        return False

    # Skip inspector paths (already correct)
    if path.startswith('/inspector'):
        return False

    # Skip proxy paths (already rewritten)
    if path.startswith('/proxy'):
        return False

    # Skip hash links
    if path.startswith('#'):
        return False

    # Skip javascript: links
    if path.startswith('javascript:'):
        return False

    return True


def rewrite_path(path: str) -> str:
    """Rewrite a path to go through the proxy."""
    # Handle root-relative paths
    if path.startswith('/'):
        return f'/proxy{path}'

    # Handle relative paths
    return f'/proxy/{path}'
