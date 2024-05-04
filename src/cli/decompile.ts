import fs from 'fs/promises';

import rootNode from '../../data/80days.json';

import PoorOldInkSerializer from '../decompiler';
import { InkChunkNode, InkRootNode } from '../types';

// @ts-expect-error: Excessive stack depth comparing types
const serializer = new PoorOldInkSerializer(rootNode as InkRootNode);

const {
  content: rootContent,
  files,
} = serializer.decompileMeta();

await fs.mkdir('./serialization', { recursive: true });
await fs.writeFile('./serialization/root.ink', rootContent);
await Promise.all(Object.entries(files).map(
  ([file, content]) => fs.writeFile(`./serialization/${file}`, content),
));

await fs.mkdir('./serialization/content', { recursive: true });
const keys = Object.keys(rootNode['indexed-content'].ranges);
await Promise.all(keys.map(async (knot, i) => {
  const file = `./data/chunks/${knot}.json`;
  const json = JSON.parse(await fs.readFile(file, 'utf-8')) as InkChunkNode;
  const content = serializer.decompile(knot, json);
  await fs.writeFile(`./serialization/content/${String(i + 1).padStart(4, '0')}-${knot}.ink`, content);
}));
