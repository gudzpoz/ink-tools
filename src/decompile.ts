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
  for (let knot in rootNode['indexed-content'].ranges) {
    const file = `./data/chunks/${knot}.json`;
    const json: InkChunkNode = JSON.parse(await fs.readFile(file, 'utf-8'));
    const content = serializer.decompile(knot, json);
    await fs.writeFile(`./serialization/content/${knot}.ink`, content);
  }
})();

