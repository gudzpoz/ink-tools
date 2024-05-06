import fs from 'fs/promises';
import { parse as parseCsv } from 'csv-parse/sync';

import rootNode from '../../data/80days.json';

import PoorOldInkSerializer from '../decompiler';
import { InkChunkNode, InkRootNode } from '../types';

type LineNumbers = {
  line: number,
  children: Record<string, LineNumbers>,
};
const lineNumbers: LineNumbers = {
  line: 1,
  children: {},
};

const serializer = new PoorOldInkSerializer(
  // @ts-expect-error: Excessive stack depth comparing types
  rootNode as InkRootNode,
  (name, path) => {
    const abs = [name, ...path];
    let current = lineNumbers;
    for (let i = 0; i < abs.length; i += 1) {
      const seg = abs[i];
      if (!current.children[seg]) {
        return current.line;
      }
      current = current.children[seg];
    }
    return current.line;
  },
);

type CsvTranslation = {
  json_path: string,
  original: string,
  translated: string,
};
async function gatherLineNumbers(csvFile: string, prefixPath: string[]) {
  let csv;
  try {
    csv = await fs.readFile(csvFile, 'utf-8');
  } catch (e) {
    lineNumbers.children[prefixPath[0]] = {
      line: 1,
      children: {},
    };
    return '';
  }
  const translations = parseCsv(csv, {
    bom: true,
    cast: false,
    columns: ['json_path', 'original', 'translated'],
    skip_empty_lines: true,
    relax_column_count_less: true,
    relax_column_count_more: true,
  }) as CsvTranslation[];
  translations.forEach(({ json_path }, i) => {
    const lineNumber = i + 2; // 1 for header, 1 for first line
    const path = [...prefixPath, ...json_path.split('.')];
    const target = path.reduce((current, seg) => {
      if (current.children[seg]) {
        return current.children[seg];
      }
      // eslint-disable-next-line no-param-reassign
      current.children[seg] = {
        line: 1,
        children: {},
      };
      return current.children[seg];
    }, lineNumbers);
    target.line = lineNumber;
  });
  return csv;
}

const rootCsv = await gatherLineNumbers(
  './output/filtered/build/machine-translated/$meta.buildingBlocks.csv',
  ['', 'buildingBlocks'],
);
const {
  content: rootContent,
  files,
} = serializer.decompileMeta();

await fs.mkdir('./serialization', { recursive: true });
await fs.mkdir('./serialization/map', { recursive: true });
await fs.writeFile('./serialization/root.ink', rootContent);
await Promise.all(Object.entries(files).map(
  async ([file, content]) => {
    if (typeof content === 'string') {
      await fs.writeFile(`./serialization/${file}`, content);
      return;
    }
    content.setSourceContent('<input>', rootCsv);
    const out = content.toStringWithSourceMap();
    await fs.writeFile(`./serialization/${file}`, out.code);
    await fs.writeFile(`./serialization/${file}.map`, out.map.toString());
  },
));

await fs.mkdir('./serialization/content', { recursive: true });
const keys = Object.keys(rootNode['indexed-content'].ranges);
async function decompileOne(knot: string, i: number) {
  const csv = await gatherLineNumbers(
    `./output/filtered/build/machine-translated/${String(i + 1).padStart(4, '0')}-${knot}.csv`,
    [knot],
  );
  const file = `./data/chunks/${knot}.json`;
  const json = JSON.parse(await fs.readFile(file, 'utf-8')) as InkChunkNode;
  const content = serializer.decompile(knot, json);
  content.setSourceContent('<input>', csv);
  const out = content.toStringWithSourceMap();
  await fs.writeFile(`./serialization/content/${String(i + 1).padStart(4, '0')}-${knot}.ink`, out.code);
  await fs.writeFile(`./serialization/content/${String(i + 1).padStart(4, '0')}-${knot}.ink.map`, out.map.toString());
}
// await decompileOne(keys[2570 - 1], 2570 - 1);
await Promise.all(keys.map((knot, i) => decompileOne(knot, i)));
