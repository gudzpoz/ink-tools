import assert from 'assert';
import { NEW_BUILDING_BLOCK_DEFINITIONS, InkyJsCompiler } from '../js2ijson';
import { InkStoryRunner } from '../story';

const compiler = new InkyJsCompiler();
const compiled = Object.fromEntries(Object.entries(NEW_BUILDING_BLOCK_DEFINITIONS).map(
  ([name, code]) => [name, compiler.compile(code)],
));

assert(compiled.print_num);
async function testPrintNum(n: number, expected: string) {
  const runner = new InkStoryRunner({
    initial: 'test',
    buildingBlocks: compiled.print_num,
    variables: {},
    'indexed-content': {
      filename: '',
      ranges: {
        test: '',
      },
    },
  }, () => Promise.resolve(JSON.stringify([{
    buildingBlock: 'print_num',
    params: {
      __bbprint_num0: n,
    },
  }, '<br><br>'])));
  await runner.init();
  const result = (await runner.next())!.filter((s) => typeof s === 'string').join('');
  if (result !== expected) {
    throw new Error(`Expected ${expected}, got ${result}`);
  }
}
const printNumTests = [
  [1, '一'],
  [2, '二'],
  [3, '三'],
  [4, '四'],
  [5, '五'],
  [6, '六'],
  [7, '七'],
  [8, '八'],
  [9, '九'],
  [10, '十'],
  [11, '十一'],
  [12, '十二'],
  [13, '十三'],
  [14, '十四'],
  [15, '十五'],
  [16, '十六'],
  [17, '十七'],
  [18, '十八'],
  [19, '十九'],
  [20, '二十'],
  [21, '二十一'],
  [28, '二十八'],
  [30, '三十'],
  [31, '三十一'],
  [32, '三十二'],
  [40, '四十'],
  [45, '四十五'],
  [50, '五十'],
  [55, '五十五'],
  [60, '六十'],
  [66, '六十六'],
  [70, '七十'],
  [77, '七十七'],
  [80, '八十'],
  [88, '八十八'],
  [90, '九十'],
  [99, '九十九'],
  [100, '一百'],
  [101, '一百零一'],
  [108, '一百零八'],
  [110, '一百一十'],
  [111, '一百一十一'],
  [120, '一百二十'],
  [122, '一百二十二'],
  [130, '一百三十'],
  [133, '一百三十三'],
  [404, '四百零四'],
  [500, '五百'],
  [779, '七百七十九'],
  [914, '九百一十四'],
  [1000, '一千'],
  [1001, '一千零一'],
  [1008, '一千零八'],
  [1010, '一千零一十'],
  [1011, '一千零一十一'],
  [1020, '一千零二十'],
  [1022, '一千零二十二'],
  [1024, '一千零二十四'],
  [1030, '一千零三十'],
  [1100, '一千一百'],
  [1101, '一千一百零一'],
  [1108, '一千一百零八'],
  [1536, '一千五百三十六'],
  [1999, '一千九百九十九'],
  [2000, '二千'],
  [2001, '二千零一'],
  [10000, '一万'],
  [10001, '一万零一'],
  [10008, '一万零八'],
  [10010, '一万零一十'],
  [10011, '一万零一十一'],
  [10020, '一万零二十'],
  [10100, '一万零一百'],
  [10101, '一万零一百零一'],
  [10111, '一万零一百一十一'],
  [11011, '一万一千零一十一'],
  [11101, '一万一千一百零一'],
  [11111, '一万一千一百一十一'],
  [12000, '一万二千'],
  [90000, '九万'],
  [100000, '十万'],
  [100001, '十万零一'],
  [101000, '十万一千'],
];
await Promise.all(
  printNumTests.map(([n, expected]) => testPrintNum(n as number, expected as string)),
);
