# Translation Tools for Ink

> These tools are designed to be used internally in a fan translation community around 80 Days,
> the game made by Inkle, and are not intended for general use.
> If you, too, want to use these tools, please contact the maintainer.
>
> 如果是群里的想要参与开发的群友，请看群里的 Trello 链接里的 `ink-tools 使用及开发文档` 来了解开发流程。

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
