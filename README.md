# Translation Tool for Ink

This is a simple tool for extracting content from compiled [Ink](https://www.inklestudios.com/ink/) files to CSV files for translation and then re-importing the translated content back into the compiled Ink files.

## Dependencies

- Python 3.10+
- [`fire`](https://github.com/google/python-fire)

## Usage

- `./data/src.json` is the JSON file containing the metadata.
- `./data/src.inkcontent.txt` is the text file containing the content.
- `./exported` is the directory where the extracted content will be saved.

Extract content:
```bash
$ python ink.py extract ./data/src.json ./exported
```

Import content:
```bash
$ python ink.py import ./exported ./data/src.json ./data/dst.json
```

## License

GPL-3.0