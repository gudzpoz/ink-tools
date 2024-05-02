import fs from 'fs/promises';

import type { InkRootNode } from './types';

import gameDataIndexJson from '../data/80days.json';

// 下面这行代码可以用来检查生成的类型是否正确（移除掉 @ts-expect-error）。
// 但是 JSON 实在太大了，所以必定会生成一个 Excessive stack depth comparing types 错误。
// 主要查看有没有其它的报错来检查类型是否匹配。

// @ts-expect-error: Excessive stack depth comparing types
const index: InkRootNode = gameDataIndexJson;
// 除了上面这个以外，可以去 ./auto-type-tests.ts 里看看 TypeScript 有没有报错。

// 下面先按照 InkRootNode['indexed-content'] 从 inkcontent 里提取细分文件的脚本
async function splitChunks() {
  const indexedContent = index['indexed-content'];
  const content = await fs.readFile('./data/80days.inkcontent.txt');
  await fs.mkdir('./data/chunks', { recursive: true });
  const typeCheckers = [
    `import { InkBlock } from './types';`,
    `import { InkChunkNode } from './types';`,
  ];
  const chunks: Record<string, any> = {};
  await Promise.all(Object.entries(indexedContent.ranges).map(([key, value], i) => {
    const filename = `${key}.json`;
    const [startS, lengthS] = value.split(' ');
    const start = parseInt(startS, 10);
    const length = parseInt(lengthS, 10);
    const chunk = JSON.parse(content.subarray(start, start + length).toString('utf-8'));
    const pretty = JSON.stringify(chunk, null, 2);
    // ENDFLOW 文件内容只有 {}，会报错。
    if (key !== 'ENDFLOW') {
      typeCheckers.push(`import testeeJson${i} from '../data/chunks/${filename}';`);
      // 其余可以分为两类，一个是有 initial 字段的，按 InkChunkNode 类型来处理。否则就是 InkBlock[]。
      if (pretty.indexOf('"initial"') === -1) {
        chunks[key] = { chunk };
        typeCheckers.push(`const testeeJson${i}Typed: InkBlock[] = testeeJson${i};`);
      } else {
        Object.entries(chunk.stitches).forEach(([stitche, content]) => {
          chunks[`${key}.${stitche}`] = content;
        });
        typeCheckers.push(`const testeeJson${i}Typed: InkChunkNode = testeeJson${i};`);
      }
      typeCheckers.push(`console.assert(testeeJson${i}Typed);\n`);
    }
    return fs.writeFile(`./data/chunks/${filename}`, pretty);
  }));
  await fs.writeFile('./src/auto-type-tests.ts', typeCheckers.join('\n'));
  return chunks;
}
const chunksPromise = splitChunks();

// 下面全部都是尝试自动化生成 buildingBlocks 的类型定义的尝试。

const { buildingBlocks } = index;

/**
 * `Record<field 名, 类型信息>`。
 * 其中 `field 名` 可能是 `A` 或是 `A[]` 格式的，后者指的是数组。
 */
type Info = Record<string, {
  /**
   * 记录了某一个 field 可能的值的类型，基本就是 number, string 或者 boolean。
   */
  values: Set<string>,
  /**
   * 如果某一个 field 是一个对象，那么记录下这个对象所有可能的 field 名称。
   */
  nestedValues: Set<string>,
}>;

function collectStructures(
  key: string,
  block: Record<string, any> | any[] | string | number,
  info: Info,
): string {
  if (Array.isArray(block)) {
    block.forEach((v) => collectStructures(key + '[]', v, info));
    return '[<nested>]';
  }
  if (info[key] === undefined) {
    info[key] = {
      values: new Set(),
      nestedValues: new Set(),
    };
  }
  if (typeof block !== 'object') {
    info[key].values.add(typeof block);
    return JSON.stringify(block);
  }
  Object.entries(block).forEach(([key, value]) => {
    collectStructures(key, value, info);
  });
  const keys = Object.keys(block).sort();
  keys.forEach((k) => info[key].nestedValues.add(k));
  return `{${keys.join(',')}}`;
}

/**
 * 收集 buildingBlocks 的结构信息到 Info 中。
 */
function collectInfoFromFile(blocks: typeof buildingBlocks, info: Info, root: Set<string>) {
  Object.values(blocks).forEach((block) => {
    block.forEach((step: any | string) => {
      if (typeof step === 'string') {
        return;
      }
      root.add(Object.keys(step).sort().join(','));
      Object.entries(step)
        .map(([k, v]) => {
          collectStructures(k, v as any, info);
        });
    });
  });
}

/**
 * 根据 Info 生成 TypeScript 类型信息。懒得用 OpenAPI 了。
 */
class TypeGenerator {
  private info: Info;

  constructor(info: Info) {
    this.info = info;
  }

  innerForType(nestedValues: Set<string>): string {
    return Array.from(nestedValues).sort()
      .map((k) => `  ${k}?: Type_${k},`).join('\n');
  }

  typeFor(name: string): string[] {
    switch (name) {
      case 'return':
        return ['Type_set[number]'];
      default:
        break;
    }
    const { values, nestedValues } = this.info[name];
    const types: string[] = Array.from(values);
    if (nestedValues.size !== 0) {
      types.push(`{\n${this.innerForType(nestedValues)}\n}`);
    }
    if (types.length === 0) {
      return ['{}'];
    }
    return types;
  }

  generate(): string {
    const types = Object.fromEntries(Object.keys(this.info)
      .filter((name) => !name.startsWith('__bb')) // 这是函数参数
      .map((k) => [`Type_${k}`, this.typeFor(k)]));
    const mergedTypes: typeof types = {};
    Object.entries(types).forEach(([k, v]) => {
      const match = /^([^\[\]]+)([\[\]]+)$/.exec(k);
      let name, suffix;
      if (match === null) {
        name = k;
        suffix = '';
      } else {
        [, name, suffix] = match;
      }
      if (mergedTypes[name] === undefined) {
        mergedTypes[name] = [];
      }
      mergedTypes[name].push(`(${v.join(' | ')})${suffix}`);
      if (name === 'Type_params') {
        mergedTypes[name] = mergedTypes[name].filter((v) => v.indexOf('__bb') === -1);
        mergedTypes[name].push('{ [key: `__bb${string}`]: Type_return | undefined }');
      }
    });
    return Object.entries(mergedTypes)
      .map(([k, v]) => `export type ${k} = ${v.join(' | ')};`)
      .join('\n\n');
  }
}

const info: Info = {};
const root: Set<string> = new Set();
collectInfoFromFile(buildingBlocks, info, root);
(async () => {
  const chunks = await chunksPromise;
  Object.entries(chunks).forEach(([key, value]) => {
    try {
      collectInfoFromFile(value, info, root);
    } catch (e) {
      console.error(key, e);
      throw e;
    }
  })
  fs.writeFile(
    './data/80days.format.json',
    JSON.stringify(
      info,
      (_k, v) => (v instanceof Set ? [...v].sort() : v),
      2,
    ),
  );
  console.log('buildingBlocks 对象的可能 field：', Array.from(root).sort());
  const types = new TypeGenerator(info).generate();
  fs.writeFile(
    './src/auto-types.ts',
    types,
  );
})();
