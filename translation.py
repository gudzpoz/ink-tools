import csv, json
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import fire

META_PREFIX = '$meta'
# TODO: should we extract variables?
META_FIELD_KEYS = ['variables', 'buildingBlocks']
SKIPPED_PATH_LEAFS = [
    'initial',
    'func',
    'get',
    'linkPath',
    'divert',
    'buildingBlock',
    'action',
]
SKIPPED_PARENT_LEAFS = ['set', 'params']
SKIPPED_VALUES = ['<br><br>']
NO_SKIP = False
REMOVE_EMPTY = True


def to_json_bytes(data: Any) -> bytes:
    return json.dumps(data, separators=(',', ':'), ensure_ascii=False).encode('utf-8')


# Skip common special paths or values
def should_skip(path: list[str], data: str) -> bool:
    if NO_SKIP:
        return False
    if path[-1] in SKIPPED_PATH_LEAFS:
        return True
    if len(path) > 1 and path[-2] in SKIPPED_PARENT_LEAFS:
        return True
    if data.strip() == '':
        return True
    if data in SKIPPED_VALUES:
        return True
    return False


def dump_data(csv_writer, data: Any, path: list[str] = [], verbose=False) -> None:
    if isinstance(data, dict):
        for k, v in data.items():
            dump_data(csv_writer, v, path + [k], verbose)
    elif isinstance(data, list):
        for i, item in enumerate(data):
            dump_data(csv_writer, item, path + [str(i)], verbose)
    elif isinstance(data, str):
        key = '.'.join(path)
        if should_skip(path, data):
            if verbose:
                print(f"Skipping {key}: {data}")
            return
        if verbose:
            print(f'{key}: {data}')
        csv_writer.writerow([key, data, data])
    elif isinstance(data, int) or isinstance(data, float) or isinstance(data, bool):
        if verbose:
            key = '.'.join(path)
            print(f"Skipping {key}: {data}")
    else:
        raise ValueError(f'Unsupported type: {type(data)}')


def extract_meta(data: dict[str, Any], output_path: Path, verbose=False) -> None:
    for key in META_FIELD_KEYS:
        if key not in data:
            continue
        extract_one(data[key], output_path / f'{META_PREFIX}.{key}.csv', verbose)


def extract_one(data: dict[str, Any], csv_file: Path, verbose=False) -> None:
    print(f'Extracting to {csv_file}')
    with csv_file.open('w', encoding='utf-8', newline='') as f:
        csv_writer = csv.writer(f)
        dump_data(csv_writer, data, [], verbose)
    if REMOVE_EMPTY and csv_file.stat().st_size == 0:
        csv_file.unlink()
        print(f'Removed empty file {csv_file}')


def import_one(data: dict[str, Any], input_file: Path, verbose=False) -> Any:
    print(f'Importing {input_file}')
    if not input_file.exists():
        print(f'{input_file} not found. Skipping')
        return data
    with input_file.open(encoding='utf-8') as f:
        csv_reader = csv.reader(f)
        for row in csv_reader:
            key, _, translation = row
            path = key.split('.')
            current = data
            for k in path[:-1]:
                if isinstance(current, list):
                    k = int(k)
                current = current[k]
            k = path[-1]
            if isinstance(current, list):
                k = int(k)
            current[k] = translation
    return data


# Inplace import
def import_meta(data: dict[str, Any], input_path: Path, verbose=False) -> None:
    for key in ['variables', 'buildingBlocks']:
        input_file = input_path / f'{META_PREFIX}.{key}.csv'
        data[key] = import_one(data[key], input_file, verbose)


class Main:
    def __init__(self) -> None:
        self.__dict__['import'] = self._import

    def extract(
        self,
        meta_file: str,
        output_path: str,
        verbose=False,
        threads=4,
    ) -> None:
        meta_file = Path(meta_file)
        output_path = Path(output_path)
        print(f'Extracting {meta_file} to {output_path}')
        if not output_path.exists():
            output_path.mkdir(parents=True)
        if any(output_path.iterdir()):
            confirm = input(
                f'{output_path} is not empty. Continue? (will remove all files) [y/N] '
            )
            if confirm.lower() != 'y':
                return
            for file in output_path.iterdir():
                file.unlink()

        start_time = time.time()
        metadata = json.loads(meta_file.read_text(encoding='utf-8'))
        indexed_content = metadata['indexed-content']
        ranges = indexed_content['ranges']

        content_filename = f'{indexed_content["filename"]}.txt'
        content_file = meta_file.parent / content_filename
        content = content_file.read_bytes()

        extract_meta(metadata, output_path, verbose)

        njobs = len(ranges) + 1

        def process(i, key, value):
            start, length = map(int, value.split())
            json_str = content[start : start + length]
            print(f'({i + 1}/{njobs}) ', end='')
            extract_one(json.loads(json_str), output_path / f'{key}.csv', verbose)

        futures = []
        with ThreadPoolExecutor(max_workers=threads) as executor:
            for i, (key, value) in enumerate(ranges.items()):
                futures.append(executor.submit(process, i, key, value))
        for future in futures:
            future.result()
        print(f'Finished extracting to {output_path}')
        print(f'Time elapsed: {time.time() - start_time:.2f}s')

    def _import(
        self,
        input_path: str,
        meta_file: str,
        output_path: str,
        verbose=False,
        threads=4,
    ) -> None:
        input_path = Path(input_path)
        meta_file = Path(meta_file)
        output_path = Path(output_path)
        if meta_file.resolve().parent == output_path.resolve():
            raise ValueError(
                'Output path cannot be the same as the input meta file path'
            )
        output_meta_file = output_path / meta_file.name
        print(f'Extracting {meta_file} to {output_path}')
        if not output_path.exists():
            output_path.mkdir(parents=True)
        if any(output_path.iterdir()):
            confirm = input(
                f'{output_path} is not empty. Continue? (will remove all files) [y/N] '
            )
            if confirm.lower() != 'y':
                return
            for file in output_path.iterdir():
                file.unlink()

        start_time = time.time()
        metadata = json.loads(meta_file.read_text(encoding='utf-8'))
        indexed_content = metadata['indexed-content']
        ranges = indexed_content['ranges']

        content_filename = f'{indexed_content["filename"]}.txt'
        content_file = meta_file.parent / content_filename
        content = content_file.read_bytes()

        output_content_file = output_path / content_filename
        output_content = output_content_file.open('wb')

        current_bytes = 0
        njobs = len(ranges) + 1

        def process(i, key, value):
            start, length = map(int, value.split())
            json_str = content[start : start + length]
            print(f'({i + 1}/{njobs}) ', end='')
            data = import_one(json.loads(json_str), input_path / f'{key}.csv', verbose)
            return data

        futures = []
        with ThreadPoolExecutor(max_workers=threads) as executor:
            for i, (key, value) in enumerate(ranges.items()):
                futures.append(executor.submit(process, i, key, value))
        for future in futures:
            data = future.result()
            output_bytes = to_json_bytes(data) + b'\n'
            output_bytes_len = len(output_bytes)
            output_content.write(output_bytes)
            current_bytes += output_bytes_len
            ranges[key] = f'{current_bytes} {len(output_bytes)}'
        output_content.close()
        import_meta(metadata, input_path, verbose)
        output_meta_file.write_bytes(to_json_bytes(metadata))
        print(f'Finished importing to {output_meta_file} and {output_content_file}')
        print(f'Time elapsed: {time.time() - start_time:.2f}s')


if __name__ == '__main__':
    fire.Fire(Main)
