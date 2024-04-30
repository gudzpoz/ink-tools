# Translation Tool for Ink

This is a simple tool for extracting content from compiled [Ink](https://github.com/inkle/ink) files to CSV files for translation and then re-importing the translated content back into the compiled Ink files.

## Dependencies

- Python 3.10+
- [`fire`](https://github.com/google/python-fire)

## Usage

- `./data/meta.json` is the JSON file containing the metadata.
- `./exported` is the directory where the extracted content will be saved.
- `./translated` is the directory where the translated JSON files will be saved.

Extract content:
```bash
$ python translation.py extract ./data/meta.json ./exported
```

Import content:
```bash
$ python translation.py import ./exported ./data/meta.json ./translated
```

## License

[GPL-3.0](./LICENSE)
