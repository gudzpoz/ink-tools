from functools import partial
import shutil
from typing import Callable

from utils import *


def print_indented(
    file_writer: TextIOWrapper, line='', indent=0, verbose=False, *args, **kwargs
) -> None:
    s = f'{"    " * indent}{line}'
    if verbose:
        print(s, *args, **kwargs)
    print(s, file=file_writer, *args, **kwargs)


# pln is used as some sort of context
def get_pln(
    file_writer: TextIOWrapper, indent=0, verbose=False
) -> Callable[[str], None]:
    pln = partial(print_indented, file_writer, indent=indent, verbose=verbose)
    def _indent():
        pln1 = get_pln(file_writer, indent + 1, verbose)
        pln1.is_func = pln.is_func
        return pln1
    pln.indent = _indent
    pln.is_func = False
    return pln


divert = lambda d: f'-> {d}'
knot = lambda k: f'=== {k} ==='
func = lambda f: knot(f"function {f}")
stitch = lambda s: f'={s}'


def decompile_action(data, pln):
    # Actions are defined in the game engine. Just print them as comments.
    pln(
        f'// Action: {data["action"]} '
        f'{json.dumps(data.get("userInfo", {}), separators=(",", ":"))}'
    )


BUILTIN_OPS = {
    "And": (2, "&&"),
    "Or": (2, "||"),
    "Not": (1, "!"),
    "Equals": (2, "=="),
    "NotEquals": (2, "!="),
    "GreaterThan": (2, ">"),
    "LessThan": (2, "<"),
    "GreaterThanOrEquals": (2, ">="),
    "LessThanOrEquals": (2, "<="),
    "Add": (2, "+"),
    "Subtract": (2, "-"),
    "Multiply": (2, "*"),
    "Divide": (2, "/"),
    "Mod": (2, "%"),
}


def _dump_to_str(data):
    if isinstance(data, dict):
        key = first_key(data)
        match key:
            case 'func':
                func_name = data[key]
                params = data["params"]
                if func_name in BUILTIN_OPS:
                    _, op = BUILTIN_OPS[func_name]
                    return f'({op.join(map(_dump_to_str, params))})'
                elif func_name == 'FlagIsSet':
                    return params[0]
                return f'''{func_name}({
                    ', '.join(map(_dump_to_str, data['params']))
                })'''
            case 'get':
                return f'{data[key]}'
            case 'buildingBlock':
                return f'''{data[key]}({
                    ', '.join(map(_dump_to_str, data['params'].values()))
                })'''
        if key in VARIABLE_TEXT_SYMBOLS:
            return f'{{{VARIABLE_TEXT_SYMBOLS[key]}{"|".join(map(_dump_to_str, data[key]))}}}'
        raise ValueError(f'Unknown key: {key}')
    elif isinstance(data, list):
        return " ".join(map(_dump_to_str, data))
    elif isinstance(data, str):
        return data
    return json.dumps(data)


def decompile_do_funcs(data, pln):
    for func in data['doFuncs']:
        key = first_key(func)
        args = func[key]
        # Handle common functions
        match key:
            case 'set':
                pln(f'~ {args[0]} = {_dump_to_str(args[1])}')
            case 'buildingBlock':
                pln(f'~ {_dump_to_str(func)}')
            case _:
                raise ValueError(f'Unknown key: {key}')


def decompile_return(data, pln):
    pln(f'~ return ({_dump_to_str(data["return"])})')


def decompile_condition(data, pln):
    condition = _dump_to_str(data['condition'])
    pln(f'{{{condition}:')
    decompile_data(data['then'], pln.indent())
    e = data.get('else')
    if e:
        pln(f'  - else:')
        decompile_data(e, pln.indent())
    pln('}')


def decompile_stitches(data, pln):
    for key, value in data['stitches'].items():
        pln(stitch(key))
        decompile_data(value, pln.indent())


def _find_args(key, data):
    n = 0
    if isinstance(data, dict):
        for v in data.values():
            n = max(n, _find_args(key, v))
    elif isinstance(data, list):
        for v in data:
            n = max(n, _find_args(key, v))
    elif isinstance(data, str):
        p = f'__bb{key}'
        if data.startswith(p):
            n = max(n, int(data[len(p):]) + 1)
    return n


def decompile_building_block(
    key: str, data: Any, pln
):
    name = key
    nargs = _find_args(key, data)
    name += f'({", ".join(f"__bb{key}{i}" for i in range(nargs))})'
    pln(func(name))
    pln1 = pln.indent()
    pln1.is_func = True
    decompile_data(data, pln1)


VARIABLE_TEXT_SYMBOLS = {
    'sequence': '',
    'cycle': '&',
    'shuffle': '~',
}

def decompile_variable_text(data, pln):
    key = first_key(data)
    xs = data[key]
    pln(f'{{{VARIABLE_TEXT_SYMBOLS[key]}{"|".join(map(_dump_to_str, xs))}}}')


def decompile_data(data: Any, pln):
    if isinstance(data, list):
        for item in data:
            decompile_data(item, pln)
        return pln()
    if isinstance(data, dict):
        key = first_key(data)
        match key:
            case 'action':
                return decompile_action(data, pln)
            case 'doFuncs':
                return decompile_do_funcs(data, pln)
            case 'return':
                return decompile_return(data, pln)
            case 'condition':
                return decompile_condition(data, pln)
            case 'buildingBlock':
                return pln(f'~ {_dump_to_str(data)}')
            case 'divert':
                if pln.is_func:
                    return pln(f'// {divert(data[key])}')
                return pln(divert(data[key]))
            case 'initial':
                return decompile_stitches(data, pln)
            case 'content':
                return decompile_data(data[key], pln)
        if key in VARIABLE_TEXT_SYMBOLS:
            return decompile_variable_text(data, pln)
        raise ValueError(f'Unknown data: {key}')
    pln(_dump_to_str(data), end='')


def decompile_meta(
    metadata: dict, output_file: Path, ndigits: int, verbose=False
) -> None:
    indexed_content = metadata['indexed-content']
    with open_to_write(output_file) as f_out:
        pln = get_pln(f_out, verbose=verbose)
        pln(f'INCLUDE variables.ink')
        pln(f'INCLUDE buildingBlocks.ink')
        pln(f'INCLUDE indexed-content.ink')
        pln()
        pln(divert(metadata["initial"]))

    output_path = output_file.parent
    with open_to_write(output_path / f'variables.ink') as f_out:
        pln = get_pln(f_out, verbose=verbose)
        for key, value in metadata.get('variables', {}).items():
            pln(f"VAR {key} = {json.dumps(value)}")

    with open_to_write(output_path / f'indexed-content.ink') as f_out:
        pln = get_pln(f_out, verbose=verbose)
        for i, key in enumerate(indexed_content['ranges']):
            filename = f'{key}.ink'
            if ndigits > 0:
                filename = f'{i+1:0{ndigits}}-{filename}'
            pln(f'INCLUDE content/{filename}')

    with open_to_write(output_path / f'buildingBlocks.ink') as f_out:
        pln = get_pln(f_out, verbose=verbose)
        for key, value in metadata.get('buildingBlocks', {}).items():
            decompile_building_block(key, value, pln)


def decompile_to_file(
    data: Any, output_file: Path, key: str, ndigits: int, verbose=False
) -> None:
    with open_to_write(output_file) as f_out:
        pln = get_pln(f_out, verbose=verbose)
        pln(knot(key))
        decompile_data(data, pln)


def main(meta_file: str, output_path: str, numbering=False, verbose=False, threads=4):
    meta_file = Path(meta_file)
    output_path = Path(output_path)
    if meta_file.resolve().parent == output_path.resolve():
        raise ValueError('Output path cannot be the same as the input meta file path')
    print(f'Decompiling {meta_file} to {output_path}')
    if output_path.exists() and any(output_path.iterdir()):
        confirm = input(
            f'{output_path} is not empty. Continue? (will remove all files) [y/N] '
        )
        if confirm.lower() != 'y':
            return
        shutil.rmtree(output_path)
    content_path = output_path / 'content'
    content_path.mkdir(parents=True)

    start_time = time.time()
    metadata, content = load_meta_and_content(meta_file)
    ranges = metadata['indexed-content']['ranges']
    njobs = len(ranges)
    ndigits = len(str(njobs))

    output_meta_file = output_path / f'main.ink'
    # decompile_meta(metadata, output_meta_file, ndigits if numbering else 0, verbose)

    def process(i, key, value):
        start, length = map(int, value.split())
        json_str = content[start : start + length]
        print(f'({i}/{njobs}) ', end='')
        filename = f'{key}.ink'
        if numbering:
            filename = f'{i:0{ndigits}}-{filename}'
        data = decompile_to_file(
            json.loads(json_str),
            content_path / filename,
            key,
            ndigits if numbering else 0,
            verbose,
        )
        return data

    futures = []
    with ThreadPoolExecutor(max_workers=threads) as executor:
        for i, (key, value) in enumerate(ranges.items()):
            # i, key = 0, '__auto_return_replacement_block'
            # value = ranges[key]
            futures.append(executor.submit(process, i + 1, key, value))
    for future in futures:
        future.result()
    print(f'Finished decompiling to {output_meta_file}')
    print(f'Time elapsed: {time.time() - start_time:.2f}s')


if __name__ == '__main__':
    fire.Fire(main)
