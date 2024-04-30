import csv, json
from pathlib import Path
from typing import Any

import fire

TODO = '[[TODO]]'
SKIPPED_PATH_LEAFS = [
    'initial',
    'func',
    'get',
    'linkPath',
    'divert',
    'buildingBlock',
]
SKIPPED_VALUES = [
    '<br><br>'
]
NO_SKIP = False

# Skip common special paths or values
def should_skip(path: list[str], data: str) -> bool:
    if NO_SKIP:
        return False
    if path[-1] in SKIPPED_PATH_LEAFS:
        return True
    if len(path) > 1 and path[-2] == 'params':
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
        csv_writer.writerow([key, data, TODO])
    elif isinstance(data, int):
        if verbose:
            key = '.'.join(path)
            print(f"Skipping {key}: {data}")
    else:
        raise ValueError(f'Unsupported type: {type(data)}')


def extract_one(line: str, csv_file: Path, verbose=False) -> None:
    print(f'Extracting to {csv_file}')
    data = json.loads(line)
    with csv_file.open('w', encoding='utf-8', newline='') as f:
        csv_writer = csv.writer(f)
        dump_data(csv_writer, data, [], verbose)
    if csv_file.stat().st_size == 0:
        csv_file.unlink()
        print(f'Removed empty file {csv_file}')


def import_one(input_file: Path, line: str, verbose=False) -> Any:
    print(f'Importing {input_file}')
    data = json.loads(line)
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


class Main:
    def __init__(self) -> None:
        self.__dict__['import'] = self._import

    def extract(self, src_file: str, output_path: str, verbose=False) -> None:
        src_file = Path(src_file)
        output_path = Path(output_path)
        print(f'Extracting {src_file} to {output_path}')
        if not output_path.exists():
            output_path.mkdir(parents=True)
        if any(output_path.iterdir()):
            confirm = input(f'{output_path} is not empty. Continue? (will remove all files) [y/N] ')
            if confirm.lower() != 'y':
                return
            for file in output_path.iterdir():
                file.unlink()

        with src_file.open(encoding='utf-8') as f:
            for i, line in enumerate(f):
                output_file = output_path / f'data-{i}.csv'
                extract_one(line, output_file, verbose)
                if i > 20:
                    break

    def _import(self, input_path: str, src_file: str, output_file: str, verbose=False) -> None:
        input_path = Path(input_path)
        src_file = Path(src_file)
        output_file = Path(output_file)
        print(f'Importing {input_path} to {output_file}')
        if output_file.exists():
            confirm = input(f'{output_file} already exists. Continue? [y/N] ')
            if confirm.lower() != 'y':
                return
            output_file.unlink()

        with src_file.open(encoding='utf-8') as f:
            with output_file.open('w', encoding='utf-8') as out_f:
                for i, line in enumerate(f):
                    input_file = input_path / f'data-{i}.csv'
                    data = import_one(input_file, line, verbose)
                    print(json.dumps(data), file=out_f)


if __name__ == '__main__':
    fire.Fire(Main)
