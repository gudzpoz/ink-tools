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
  const typeCheckers = [`import { InkChunkNode } from './types';`];
  const chunks: Record<string, any> = {};
  await Promise.all(Object.entries(indexedContent.ranges).map(([key, value], i) => {
    const filename = `${key}.json`;
    const [startS, lengthS] = value.split(' ');
    const start = parseInt(startS, 10);
    const length = parseInt(lengthS, 10);
    const chunk = JSON.parse(content.subarray(start, start + length).toString('utf-8'));
    const pretty = JSON.stringify(chunk, null, 2);
    typeCheckers.push(`import testeeJson${i} from '../data/chunks/${filename}';
const testeeJson${i}Typed: InkChunkNode = testeeJson${i};
console.assert(testeeJson${i}Typed);
`);
    // 除 ENDFLOW 外可以分为两类，一个是有 initial 字段的，按 InkChunkNode 类型来处理。否则就是 InkBlock[]。
    if (pretty.indexOf('"initial"') === -1) {
      chunks[key] = { chunk };
    } else {
      Object.entries(chunk.stitches).forEach(([stitche, content]) => {
        chunks[`${key}.${stitche}`] = content;
      });
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
 * 并集统计出所有可能的 field，交集统计出必须有的 field。
 */
type FieldStats = {
  union: Set<string>,
  intersect?: Set<string>,
};
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
  /**
   * 记录下和某一个 field 相关的所有其它 field，以便推理出对象的类型。
   */
  keysTogether: Record<string, FieldStats>,
  /**
   * 记录下某一个 field 可能的值。如果这个 field 对应的是枚举的话会方便理解很多。
   */
  valueEnumeration: Set<string>,
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
      keysTogether: {},
      valueEnumeration: new Set(),
    };
  }
  if (typeof block !== 'object') {
    info[key].values.add(typeof block);
    if (typeof block === 'string') {
      info[key].valueEnumeration.add(block);
    }
    return JSON.stringify(block);
  }
  Object.entries(block).forEach(([key, value]) => {
    collectStructures(key, value, info);
  });
  const keys = Object.keys(block).sort();
  // 有些 field 是空的 {}，特殊处理。
  if (keys.length === 0) {
    info[key].values.add('{}');
    return '{}';
  }
  // 统计交集和各 field 同时出现的其它 field 的交集并集。
  keys.forEach((k) => {
    const data = info[key];
    data.nestedValues.add(k);
    if (data.keysTogether[k] === undefined) {
      data.keysTogether[k] = {
        union: new Set(),
      };
    }
    const meta = data.keysTogether[k];
    keys.forEach((ki) => meta.union.add(ki));
    meta.intersect = (meta.intersect === undefined
      ? new Set(keys)
      : new Set([...meta.intersect].filter((i) => keys.includes(i))));
  });
  return `{${keys.join(',')}}`;
}

/**
 * 收集 buildingBlocks 的结构信息到 Info 中。
 */
function collectInfoFromFile(blocks: typeof buildingBlocks, info: Info) {
  Object.values(blocks).forEach((block) => {
    if (!Array.isArray(block) && Object.keys(block).length === 0) {
      return;
    }
    // 我们认为主要节点就是 then 数组里的元素。
    // 所以把根数组里的也算在 then 里。
    // 把这个改成 'root' 之类的不重复的字段也可以。
    collectStructures('then', block, info);
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

  innerForType(stats: FieldStats): string {
    return Array.from(stats.union).sort()
      // 在一大堆同时出现的 field 里，永远出现的（交集）为必须值，其余可空。
      .map((k) => `  ${k}${stats.intersect?.has(k) ? '' : '?'}: Type_${k},`).join('\n');
  }

  typeFor(name: string): string[] {
    switch (name) {
      case 'return':
        return ['Type_set[number]'];
      default:
        break;
    }
    const { values, nestedValues, keysTogether } = this.info[name];
    const types: string[] = Array.from(values);
    if (nestedValues.size !== 0) {
      this.groupFields(keysTogether).forEach((group) => {
        types.push(`{\n${this.innerForType(group)}\n}`);
      });
    }
    if (types.length === 0) {
      return ['{}'];
    }
    return types;
  }

  /**
   * 将 field 分组。
   *
   * 例如 `Type_then` 里面，`{ cycle: Type_cycle }` 和 `{ sequence: Type_sequence }`
   * 都有出现，但是 `cycle` 和 `sequence` 从来没有同时出现，此时我们即可推断
   * 它们分属两种类型。
   *
   * 这里顺便把分组之后组内必定出现的一些元素给统计出来了，
   * 这在 `nnerForType` 里面用来判断 field 是否可空。
   *
   * @param keysTogether 统计信息
   * @returns 分组信息
   */
  groupFields(keysTogether: Info[string]['keysTogether']): FieldStats[] {
    let sets = Object.values(keysTogether).map((s) => s.union);
    let unmerged: Set<string>[] = [];
    const merged: FieldStats[] = [];
    while (sets.length !== 0) {
      unmerged = [];
      const group = sets.reduce((prev, current) => {
        const intersects = [...prev].filter((i) => current.has(i)).length !== 0;
        if (intersects || current.size === 0 || prev.size === 0) {
          return new Set([...prev, ...current]);
        } else {
          unmerged.push(current);
          return prev;
        }
      });
      if (group.size !== 0) {
        merged.push({
          union: group,
          intersect: [...group].map((key) => keysTogether[key].intersect || new Set<string>())
            .reduce((prev, current) => new Set([...prev].filter((i) => current.has(i)))),
        });
      }
      sets = unmerged;
    }
    return merged;
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
      mergedTypes[name] = mergedTypes[name].filter((v) => v.indexOf('__bb') === -1);
      if (name === 'Type_params') {
        if (name === 'Type_params') {
        mergedTypes[name].push('{ [key: `__bb${string}`]: Type_return | undefined }');
        }
      }
    });
    return Object.entries(mergedTypes)
      .map(([k, v]) => `export type ${k} = ${v.join(' | ')};`)
      .join('\n\n');
  }
}

function prettyJson(o: any) {
  return JSON.stringify(
    o,
    (_k, v) => (v instanceof Set ? [...v].sort() : v),
    2,
  );
}

const info: Info = {};
collectInfoFromFile(buildingBlocks, info);
(async () => {
  const chunks = await chunksPromise;
  Object.entries(chunks).forEach(([, value]) => {
    collectInfoFromFile(value, info);
  });
  await fs.writeFile('./data/80days.format.json', prettyJson(info));
  const types = new TypeGenerator(info).generate();
  if (process.env.GENERATE_TYPES !== undefined) {
    await fs.writeFile('./src/auto-types.ts', types);
  }
  await fs.writeFile(
    './data/80days.enum.json',
    prettyJson(
      Object.fromEntries(Object.entries(info)
        .filter(([, v]) => v.values.size === 1 && v.values.has('string') && v.nestedValues.size === 0)
        .map(([k, v]) => [k, v.valueEnumeration])),
    ),
  );
})();
