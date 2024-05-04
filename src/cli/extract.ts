import fs from 'fs/promises';

import { stringify as stringifyCsv } from 'csv-stringify/browser/esm/sync';

import rootNode from '../../data/80days.json';

import { TRANSLATABLE_FIELD_KEYS, UNTRANSLATABLE_FIELD_KEYS } from '../types';

type JSONPath = string[];

class JSONPathExtractor {
  extracted: {
    path: JSONPath,
    value: string,
    translated: string,
    meta: string,
  }[];

  constructor() {
    this.extracted = [];
  }

  extractTranslatableFields(node: object | object[], parent: string, path: JSONPath) {
    Object.entries(node).forEach(([key, value]) => {
      if (typeof value === 'string') {
        if (value === '<br><br>' || value.trim() === '') {
          return;
        }
        if (UNTRANSLATABLE_FIELD_KEYS[key] === undefined
          && UNTRANSLATABLE_FIELD_KEYS[parent] !== 1
          && !key.startsWith('__bb')) {
          if (!/^[0-9]+$/.test(key) && !TRANSLATABLE_FIELD_KEYS.includes(key)) {
            throw new Error(`Unknown translatable field: ${key}`);
          }
          this.extracted.push({
            path: [...path, key],
            value,
            translated: value,
            meta: '',
          });
        }
        return;
      }
      if (typeof value !== 'object') {
        return;
      }
      path.push(key);
      this.extractTranslatableFields(value as never, key, path);
      path.pop();
    });
  }

  async export(filename: string) {
    const csv = stringifyCsv(
      this.extracted.map(({
        path, value, translated, meta,
      }) => [
        path.join('.'),
        value,
        translated,
        meta,
      ]),
    );
    this.extracted = [];
    await fs.writeFile(filename, csv);
  }
}

const extractor = new JSONPathExtractor();
extractor.extractTranslatableFields(rootNode.buildingBlocks, '', []);
await fs.mkdir('./serialization/translables/', { recursive: true });
await extractor.export('./serialization/translables/$meta.buildingBlocks.csv');
await Promise.all(Object.keys(rootNode['indexed-content'].ranges).map(async (knot, i) => {
  const file = `./data/chunks/${knot}.json`;
  const json = JSON.parse(await fs.readFile(file, 'utf-8')) as never;
  extractor.extractTranslatableFields(json, '', []);
  await extractor.export(`./serialization/translables/${String(i + 1).padStart(4, '0')}-${knot}.csv`);
}));
