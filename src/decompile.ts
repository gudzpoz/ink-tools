import fs from 'fs/promises';

import rootNode from '../data/80days.json';

import PoorOldInkSerializer from './decompiler';
import { InkChunkNode, InkRootNode } from './types';

(async () => {
  // @ts-expect-error
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
  for (let i in keys) {
    const knot = keys[i];
    const file = `./data/chunks/${knot}.json`;
    const json: InkChunkNode = JSON.parse(await fs.readFile(file, 'utf-8'));
    const content = serializer.decompile(knot, json);
    await fs.writeFile(`./serialization/content/${String(parseInt(i) + 1).padStart(4, '0')}-${knot}.ink`, content);
  }
})();

