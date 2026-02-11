"""Claude Vision API integration for image analysis."""

import json
import logging
import os
from typing import Optional

from anthropic import Anthropic

logger = logging.getLogger(__name__)

VISION_MODEL = os.getenv("ANTHROPIC_VISION_MODEL", "claude-haiku-4-5-20251001")
MAX_TOKENS = 1024

ANALYSIS_SYSTEM_PROMPT = """You are a visual analysis assistant for a web development tool. Analyze the provided image and return a JSON object with these fields:

- "description": A concise 1-2 sentence description of what the image shows
- "contentType": One of "screenshot", "photo", "illustration", "icon", "chart", "text-heavy", "mixed"
- "uiElements": Array of UI element descriptions found (buttons, inputs, navigation, etc.) - empty array if not a UI screenshot
- "textContent": Any visible text transcribed from the image (empty string if none)
- "colorPalette": Array of 3-5 dominant color descriptions (e.g., "dark navy blue", "white")
- "layout": Brief description of the visual layout/composition
- "accessibility": Any accessibility observations (contrast issues, missing labels visible, etc.)

Return ONLY valid JSON, no markdown fencing, no explanation."""

_client: Optional[Anthropic] = None


def get_client() -> Anthropic:
    """Lazy-initialize the Anthropic client."""
    global _client
    if _client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable is not set")
        _client = Anthropic(api_key=api_key)
    return _client


def extract_media_type(data_url: str) -> tuple[str, str]:
    """Extract media type and base64 data from a data URL.

    Args:
        data_url: A data URL like "data:image/webp;base64,AAAA..."

    Returns:
        Tuple of (media_type, base64_data)
    """
    header, data = data_url.split(",", 1)
    media_type = header.split(":")[1].split(";")[0]
    return media_type, data


def analyze_image(image_data_url: str, context: str = "") -> dict:
    """Send an image to Claude Vision for analysis.

    Args:
        image_data_url: Base64 data URL (data:image/webp;base64,...)
        context: Optional context about what the image represents

    Returns:
        Parsed JSON analysis result

    Raises:
        ValueError: If API key is not configured
        json.JSONDecodeError: If Claude returns non-JSON response
    """
    client = get_client()
    media_type, base64_data = extract_media_type(image_data_url)

    user_content = [
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": base64_data,
            },
        },
    ]

    prompt_text = "Analyze this image and return the structured JSON."
    if context:
        prompt_text = f"{context}\n\n{prompt_text}"

    user_content.append({"type": "text", "text": prompt_text})

    message = client.messages.create(
        model=VISION_MODEL,
        max_tokens=MAX_TOKENS,
        system=ANALYSIS_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )

    response_text = message.content[0].text
    logger.info(f"Vision API stop_reason={message.stop_reason}, response length={len(response_text)}")

    if not response_text.strip():
        raise ValueError("Vision API returned empty response")

    # Strip markdown code fences if the model wrapped its JSON output
    cleaned = response_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

    return json.loads(cleaned)
