# Translation Tools for Ink

This is a collection of tools for helping with the translation of
[Ink](https://github.com/inkle/ink) files. Currently only support old version of Ink.

## Dependencies

- Python 3.10+
- [`fire`](https://github.com/google/python-fire)

## Text Extraction/Import

A simple tool for extracting content from compiled JSON files to CSV files for translation
and then re-importing the translated content back.

- `./data/meta.json` is the JSON file containing the metadata. `inkcontent.txt` should be placed accordingly.
- `./exported` is the directory where the extracted content will be saved.
- `./data-new` is the directory where the new `meta.json` and `inkcontent.txt` will be saved.

Extract content:
```bash
$ python ./scripts/extract_text.py extract ./data/meta.json ./exported
```

Import content:
```bash
$ python ./scripts/extract_text.py import ./exported ./data/meta.json ./data-new
```

## TODO

- [ ] Figure out a way to detect `ref` parameters.

## License

[GPL-3.0](./LICENSE)
