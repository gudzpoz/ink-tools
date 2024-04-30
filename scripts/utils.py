import json
from typing import Any


def to_json_bytes(data: Any) -> bytes:
    return json.dumps(data, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
