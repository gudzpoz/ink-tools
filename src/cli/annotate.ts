import fs from 'fs/promises';

import { parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';
import { RawSourceMap, SourceMapConsumer } from 'source-map-js';

const files = await fs.readdir('./output/filtered/build/machine-translated');

type CsvTranslation = {
  json_path: string,
  original: string,
  translated: string,
  comment?: string,
};
await fs.mkdir('./output/with-context/build/machine-translated/', { recursive: true });
await Promise.all(files.filter((file) => file.endsWith('.csv'))
  .map(async (file) => {
    const csv = await fs.readFile(`./output/filtered/build/machine-translated/${file}`, 'utf-8');
    const inkFile = file === '$meta.buildingBlocks.csv'
      ? 'buildingBlocks.ink'
      : `content/${file.replace('.csv', '.ink')}`;
    const destLines = (await fs.readFile(
      `./serialization/${inkFile}`,
      'utf-8',
    )).split('\n');
    const sourceMapFile = await fs.readFile(
      `./serialization/${inkFile}.map`,
      'utf-8',
    );
    const translations = parseCsv(csv, {
      bom: true,
      cast: false,
      columns: ['json_path', 'original', 'translated', 'comment'],
      skip_empty_lines: true,
      relax_column_count_less: true,
      relax_column_count_more: true,
    }) as CsvTranslation[];
    const sourceMap = new SourceMapConsumer(JSON.parse(sourceMapFile) as RawSourceMap);
    const translationsWithContext: CsvTranslation[] = translations.map((translation, i) => {
      const lineNumber = i + 2;
      const positions = sourceMap.allGeneratedPositionsFor({
        line: lineNumber,
        column: undefined as never,
        source: '<input>',
      });
      const destLine = positions.map((p) => p.line).reduce((a, b) => {
        if (a === b) {
          return a;
        }
        throw new Error(`Line ${lineNumber} has multiple positions in source map`);
      }) - 1;
      const contextBefore = destLines.slice(
        Math.max(0, destLine - 7),
        destLine,
      ).map((s) => `    ${s}`);
      const contextAfter = destLines.slice(
        destLine + 1,
        Math.max(0, destLine + 8),
      ).map((s) => `    ${s}`);
      const theLine = `>>> ${destLines[destLine]}`;
      return {
        ...translation,
        comment: `${translation.comment ? `关联：${translation.comment}\n\n` : ''}上下文：\n${
          [...contextBefore, theLine, ...contextAfter].join('\n').replace(/\n\s+\n/g, '\n')
        }`,
      };
    });
    const translatedCsv = stringifyCsv(translationsWithContext, {
      bom: true,
    });
    await fs.writeFile(
      `./output/with-context/build/machine-translated/${file}`,
      translatedCsv,
    );
  }));
