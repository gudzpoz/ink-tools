import csv, json
import time
from functools import lru_cache
from pathlib import Path

import fire
from openai import OpenAI

CACHED_MAX_LEN = 256
CONTEXT_MAX_LEN = 7  # should be an odd number
BATCH_SIZE = 10
GPT_MODEL = 'gpt-3.5-turbo-0125'
OUTPUT_PREFIX = '[GPT]'

PROMPT = '''You are a translator from {source_language} to {target_language}.
Your output should in JSON format with a `result` field containing the translated text in {target_language}.
Do not include anything else in the output.
Try to keep the original whitespace and formatting.
If you are unable to translate the text, you should return the original text.'''
CURRENT_PROMPT = None
CURRENT_HISTORY = []
OPENAI_CLIENT = None


def setup_prompt(source_language: str, target_language: str) -> None:
    global CURRENT_PROMPT, OPENAI_CLIENT
    OPENAI_CLIENT = OpenAI()
    CURRENT_PROMPT = {
        "role": "user",
        "content": PROMPT.format(
            source_language=source_language, target_language=target_language
        ),
    }


def add_to_history(role: str, text: str) -> None:
    CURRENT_HISTORY.append(
        {
            "role": role,
            "content": text,
        }
    )
    if len(CURRENT_HISTORY) > CONTEXT_MAX_LEN:
        CURRENT_HISTORY.pop(0)


@lru_cache(maxsize=CACHED_MAX_LEN)
def translate_text(text: str) -> str:
    add_to_history('user', text)
    messages = [
        CURRENT_PROMPT,
        *CURRENT_HISTORY,
    ]
    response = OPENAI_CLIENT.chat.completions.create(
        model=GPT_MODEL,
        messages=messages,
        temperature=0.3,
    )
    translation = response.choices[0].message.content
    try:
        result = json.loads(translation)['result']
        add_to_history('assistant', translation)
        return result
    except:
        CURRENT_HISTORY.pop()
        return text


def translate_file(
    src_file: Path,
    dst_file: Path,
    verbose=False,
    only_count=False,
) -> tuple[int, int]:
    input, output = 0, 0
    with src_file.open('r', encoding='utf-8') as f, dst_file.open(
        'w', encoding='utf-8', newline=''
    ) as f_out:
        csv_reader = csv.reader(f)
        csv_writer = csv.writer(f_out)
        for row in csv_reader:
            text = row[1]
            input += len(text.split())
            if only_count:
                continue
            translation = translate_text(text)
            if verbose:
                print(f'{text} => {translation}')
            output += len(translation.split())
            if translation != text:
                row[2] = f'{OUTPUT_PREFIX}{translation}'
            csv_writer.writerow(row)
    return input, output


class Main:
    def one(
        self,
        src_file: str,
        dst_file: str,
        source_language="English",
        target_language="Simplified Chinese",
        verbose=False,
        only_count=False,
    ) -> None:
        print(
            f'Translating {src_file} to {dst_file} from {source_language} to {target_language}'
        )
        src_file = Path(src_file)
        dst_file = Path(dst_file)
        dst_file.parent.mkdir(parents=True, exist_ok=True)
        if dst_file.exists():
            confirm = input(f'{dst_file} exists. Overwrite? [y/N] ')
            if confirm.lower() != 'y':
                return
        setup_prompt(source_language, target_language)
        start_time = time.time()
        translate_file(
            src_file,
            dst_file,
            verbose,
            only_count=only_count,
        )
        print(f'Saving to {dst_file}')
        print(f'Done in {time.time() - start_time:.2f}s')

    def all(
        self,
        src_path: str,
        dst_path: str,
        source_language="English",
        target_language="Simplified Chinese",
        verbose=False,
        skip_existing=True,
        only_count=False,
    ) -> None:
        print(
            f'Translating all CSV files in {src_path} from {source_language} to {target_language}'
        )
        src_path = Path(src_path)
        dst_path = Path(dst_path)
        if src_path.resolve() == dst_path.resolve():
            raise ValueError('src_path and dst_path cannot be the same')
        dst_path.mkdir(parents=True, exist_ok=True)
        if not only_count:
            setup_prompt(source_language, target_language)
        src_files = list(src_path.glob('*.csv'))
        njobs = len(src_files)
        ndigits = len(str(njobs))
        start_time = time.time()
        s1, s2 = 0, 0
        for i, src_file in enumerate(src_files):
            dst_file = dst_path / src_file.name
            print(
                f'[{i+1:0{ndigits}d}/{njobs}] Translating {src_file} to {dst_file}: ',
                end='',
                flush=True,
            )
            if skip_existing and dst_file.exists():
                print(f'Skipping')
                continue
            wc1, wc2 = translate_file(
                src_file,
                dst_file,
                verbose,
                only_count=only_count,
            )
            print(f'{wc1} => {wc2}')
            s1 += wc1
            s2 += wc2
        print(f's1 = {s1}, s2 = {s2}')
        print(f'Results saved to {dst_path}')
        print(f'Done in {time.time() - start_time:.2f}s')


if __name__ == '__main__':
    fire.Fire(Main)
