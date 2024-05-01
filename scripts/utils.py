from io import TextIOWrapper
import csv, json
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import fire


def to_json_bytes(data: Any) -> bytes:
    return json.dumps(data, separators=(',', ':'), ensure_ascii=False).encode('utf-8')


def load_meta_and_content(meta_file: str | Path) -> tuple[dict[str, Any], bytes]:
    meta_file = Path(meta_file)
    metadata = json.loads(meta_file.read_text(encoding='utf-8'))
    indexed_content = metadata['indexed-content']

    content_filename = f'{indexed_content["filename"]}.txt'
    content_file = meta_file.parent / content_filename
    content = content_file.read_bytes()
    return metadata, content


def first_key(d: dict[str, Any]) -> str:
    return next(iter(d))


def open_to_write(file: Path) -> TextIOWrapper:
    print(f'Writing to {file}')
    return file.open('w', encoding='utf-8')
